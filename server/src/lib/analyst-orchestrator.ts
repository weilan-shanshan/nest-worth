/**
 * 分析编排：按 tier 决定模型组合，处理 N=1/2/3 并行 + 综合层。
 *
 * 设计原则：
 *   - 1 次 analyzeAssets / adviseGoal 调用 = 用户视角 1 次 analysis 配额
 *   - 内部可能产生 N+1 次模型调用（N 个并行 + 1 个综合），都共用同一 trace_id
 *   - 内部成本（cost_cents）按每个模型独立计算后求和
 *   - 部分模型失败时：仍能 synth 出结果就 synth，全失败才整体抛错
 *
 * 不在本层：
 *   - quota 扣减（在 routes/llm.ts 里事务化做）
 *   - usage_events 写入（同上）
 *   - fallback chain（Sprint 3 加；目前模型组合是按 tier 静态选）
 */

import { callOne, BailianAnalystError } from './bailian-analyst.js';
import { computeCostCents } from './bailian-pricing.js';
import type { SubscriptionTier } from '../schema.js';

export interface ModelCallLog {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  /** 'parallel' = N 并行其一；'synth' = 综合层 */
  role: 'parallel' | 'synth';
  ok: boolean;
  errMessage?: string;
}

export interface RunAnalysisResult {
  content: string;
  /** 用户看的标签：'DeepSeek-R1' / 'DeepSeek-R1 综合 2 个模型' */
  modelUsed: string;
  /** 客户端请求的 N */
  requestedEnsembleSize: number;
  /** 当前 tier 最大允许的 N */
  allowedEnsembleSize: number;
  /** = min(requested, allowed)，本次调用启动时计划的 N */
  effectiveEnsembleSize: number;
  /** 实际成功的 N（部分模型失败时可能 < effective） */
  actualEnsembleSize: number;
  /** 参与的模型 ID 列表（不含 synth） */
  ensembleModels: string[];
  /** 所有模型调用日志，用于上层写 usage_events */
  callLogs: ModelCallLog[];
}

/**
 * tier 决策表。
 *   - maxN: 该 tier 允许的最大交叉验证档（N=1/2/3）。请求超出会被静默降级
 *   - defaultModel: N=1 时用的模型；Free/Plus 走 V3 省成本，Pro/Max 走 R1
 *
 * 商业化方案：
 *   - free / plus  → N=1 V3 单模型
 *   - pro          → N≤2，主用 R1
 *   - max          → N≤3 全顶配
 *   - studio       → 走 BYOK，理论上不到这条路；兜底放宽到 N≤3
 */
const TIER_GATE: Record<SubscriptionTier, { maxN: number; defaultModel: string }> = {
  free:   { maxN: 1, defaultModel: 'deepseek-v3' },
  plus:   { maxN: 1, defaultModel: 'deepseek-v3' },
  pro:    { maxN: 2, defaultModel: 'deepseek-r1' },
  max:    { maxN: 3, defaultModel: 'deepseek-r1' },
  studio: { maxN: 3, defaultModel: 'deepseek-r1' }
};

export interface ModelPlan {
  models: string[];
  synth: string;
  allowedN: number;
  effectiveN: number;
}

export function pickModels(tier: SubscriptionTier, requested: number): ModelPlan {
  const gate = TIER_GATE[tier] ?? TIER_GATE.free;
  const allowedN = gate.maxN;
  const effectiveN = Math.max(1, Math.min(allowedN, Math.floor(requested) || 1));

  switch (effectiveN) {
    case 1:
      return { models: [gate.defaultModel], synth: gate.defaultModel, allowedN, effectiveN };
    case 2:
      // N=2 用 R1 + V3；R1 作综合者
      return { models: ['deepseek-r1', 'deepseek-v3'], synth: 'deepseek-r1', allowedN, effectiveN };
    case 3:
    default:
      // N=3 顶配：R1（推理）+ Qwen-Max（中文金融）+ V3（性价比）；R1 综合
      return { models: ['deepseek-r1', 'qwen-max-latest', 'deepseek-v3'], synth: 'deepseek-r1', allowedN, effectiveN };
  }
}

const SYNTH_SYSTEM = '你是一个 AI 答案综合器，从多个模型的回答中提炼共识，输出最终的高质量 JSON。';

function buildSynthPrompt(successful: { model: string; content: string }[]): string {
  return `以下是 ${successful.length} 个 AI 模型对同一问题的回答。请综合它们的共识、剔除离群观点，输出一份最终的、最可靠的方案。
保持原始 JSON 结构不变，只输出最终 JSON。

${successful.map((s, i) => `===== 模型 ${i + 1} (${s.model}) =====\n${s.content}`).join('\n\n')}

请综合输出最终 JSON。`;
}

export async function runAnalysis(opts: {
  prompt: string;
  system: string;
  ensembleSize: number;
  tier: SubscriptionTier;
}): Promise<RunAnalysisResult> {
  const plan = pickModels(opts.tier, opts.ensembleSize);
  const sharedMeta = {
    requestedEnsembleSize: opts.ensembleSize,
    allowedEnsembleSize: plan.allowedN,
    effectiveEnsembleSize: plan.effectiveN
  };
  const callLogs: ModelCallLog[] = [];

  // ----- N=1：直接调一次 -----
  if (plan.models.length === 1) {
    const m = plan.models[0];
    try {
      const r = await callOne({ model: m, prompt: opts.prompt, system: opts.system });
      const cost = computeCostCents(m, r.tokensIn, r.tokensOut);
      callLogs.push({ model: m, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costCents: cost, role: 'parallel', ok: true });
      return {
        content: r.content,
        modelUsed: m,
        ...sharedMeta,
        actualEnsembleSize: 1,
        ensembleModels: [m],
        callLogs
      };
    } catch (e) {
      const err = e as BailianAnalystError;
      callLogs.push({ model: m, tokensIn: 0, tokensOut: 0, costCents: 0, role: 'parallel', ok: false, errMessage: err.message });
      throw err;
    }
  }

  // ----- N≥2：并行 + 综合 -----
  const settled = await Promise.allSettled(
    plan.models.map(m => callOne({ model: m, prompt: opts.prompt, system: opts.system }))
  );

  const successful: { model: string; content: string }[] = [];
  settled.forEach((r, idx) => {
    const m = plan.models[idx];
    if (r.status === 'fulfilled') {
      const cost = computeCostCents(m, r.value.tokensIn, r.value.tokensOut);
      callLogs.push({ model: m, tokensIn: r.value.tokensIn, tokensOut: r.value.tokensOut, costCents: cost, role: 'parallel', ok: true });
      successful.push({ model: m, content: r.value.content });
    } else {
      const err = r.reason as BailianAnalystError;
      callLogs.push({ model: m, tokensIn: 0, tokensOut: 0, costCents: 0, role: 'parallel', ok: false, errMessage: err?.message ?? 'unknown' });
    }
  });

  if (successful.length === 0) {
    const firstErr = settled.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw (firstErr?.reason as BailianAnalystError) ?? new BailianAnalystError('all_models_failed');
  }

  // 只剩 1 个成功的就直接用，不再综合（综合层无意义）
  if (successful.length === 1) {
    return {
      content: successful[0].content,
      modelUsed: `${successful[0].model}（其它模型失败）`,
      ...sharedMeta,
      actualEnsembleSize: 1,
      ensembleModels: successful.map(s => s.model),
      callLogs
    };
  }

  // 多个成功 → synth
  try {
    const synthResult = await callOne({
      model: plan.synth,
      prompt: buildSynthPrompt(successful),
      system: SYNTH_SYSTEM
    });
    const cost = computeCostCents(plan.synth, synthResult.tokensIn, synthResult.tokensOut);
    callLogs.push({ model: plan.synth, tokensIn: synthResult.tokensIn, tokensOut: synthResult.tokensOut, costCents: cost, role: 'synth', ok: true });
    return {
      content: synthResult.content,
      modelUsed: `${plan.synth} 综合 ${successful.length} 个模型`,
      ...sharedMeta,
      actualEnsembleSize: successful.length,
      ensembleModels: successful.map(s => s.model),
      callLogs
    };
  } catch (e) {
    const err = e as BailianAnalystError;
    callLogs.push({ model: plan.synth, tokensIn: 0, tokensOut: 0, costCents: 0, role: 'synth', ok: false, errMessage: err.message });
    // 综合失败：用第一个成功的原始回答
    return {
      content: successful[0].content,
      modelUsed: `${successful[0].model}（综合失败用原结果）`,
      ...sharedMeta,
      actualEnsembleSize: successful.length,
      ensembleModels: successful.map(s => s.model),
      callLogs
    };
  }
}
