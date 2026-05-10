import type { Asset, Goal, Settings } from '../types';
import { getOrInitSettings, db } from '../db';
import { MODEL_CHAIN, ANALYST_CHAIN, type AnalystModel } from './recognize';
import { CATEGORY_MAP } from './asset-meta';
import { fetchMarketSnapshot, formatSnapshotForPrompt, type MarketSnapshot } from './market-data';

/**
 * 文本建议 / 分析模块。
 * 复用 recognize 的 7 个免费视觉模型链（VL 模型也支持纯文本 input），
 * 失败自动 fallback；24h 缓存避免重复消耗免费额度。
 */

export interface AssetAdvice {
  assetId: number;
  status: string;          // 一句话现状判断
  suggestion: string;      // 一句话下一步建议
  level: 'good' | 'watch' | 'action';
}

export interface AdviceMeta {
  modelUsed: string;                    // 综合者 / 单模型名
  ensembleModels?: string[];            // 参与交叉验证的模型列表（N>1 时有值）
  ensembleSize: number;                 // 实际使用的交叉验证档位
  marketSnapshot: MarketSnapshot | null;
  cachedAt: number;
}

export interface CurrentOptimization {
  title: string;
  detail: string;
  impact: string;
}

export interface NewAllocation {
  market: 'china' | 'global' | 'mixed';
  type: string;             // 产品类型，如 "A股宽基ETF"、"美股科技ETF"
  title: string;
  detail: string;
  expectedReturn: string;   // 如 "年化 5-8%"
  risk: 'low' | 'medium' | 'high';
}

export interface ActionStep {
  phase: string;            // 如 "本月内"、"近3个月"、"半年内"、"年内"
  action: string;
}

export interface GoalAdvice {
  goalId: number;
  summary: string;                                  // 达成可能性判断
  currentOptimization: CurrentOptimization[];       // 现有持仓优化（最多 3 条）
  newAllocations: NewAllocation[];                  // 新增投资品类（最多 4 条）
  actionPlan: ActionStep[];                         // 分阶段行动计划（最多 4 步）
}

const CACHE_TTL = 24 * 60 * 60 * 1000;   // 24h

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

interface CacheRow {
  id?: number;
  key: string;
  fingerprint: string;
  payload: string;
  createdAt: number;
}

/* ---------- IndexedDB cache table ---------- */

async function getCache(key: string, fingerprint: string): Promise<any | null> {
  const row = await db.advice.where('key').equals(key).first();
  if (!row) return null;
  if (row.fingerprint !== fingerprint) return null;
  if (Date.now() - row.createdAt > CACHE_TTL) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}

async function setCache(key: string, fingerprint: string, payload: any): Promise<void> {
  const existing = await db.advice.where('key').equals(key).first();
  const row: CacheRow = {
    id: existing?.id,
    key, fingerprint,
    payload: JSON.stringify(payload),
    createdAt: Date.now()
  };
  if (existing?.id) await db.advice.put(row);
  else await db.advice.add(row);
}

export async function clearAdviceCache(prefix?: string): Promise<void> {
  if (prefix) {
    const all = await db.advice.toArray();
    const ids = all.filter(r => r.key.startsWith(prefix)).map(r => r.id!);
    await db.advice.bulkDelete(ids);
  } else {
    await db.advice.clear();
  }
}

/* ---------- LLM call with fallback chain ---------- */

/**
 * 用户自定义模型链（按 settings 排序 + 启用过滤），fallback 到默认链。
 */
function getAnalystChain(settings: Settings): AnalystModel[] {
  const enabled = settings.analystEnabled || {};
  const order = settings.analystModelOrder || [];
  const exhausted = new Set(settings.exhaustedModels || []);

  // 默认全启用
  const isEnabled = (name: string) => enabled[name] !== false;

  // 已排序的：按用户定义顺序
  const ordered: AnalystModel[] = [];
  const seen = new Set<string>();
  for (const name of order) {
    const m = ANALYST_CHAIN.find(x => x.name === name);
    if (m && isEnabled(name)) { ordered.push(m); seen.add(name); }
  }
  // 没排到的（新模型 / 用户没碰过）按默认顺序追加
  for (const m of ANALYST_CHAIN) {
    if (!seen.has(m.name) && isEnabled(m.name)) ordered.push(m);
  }
  // 已耗尽的排到末尾
  return ordered.sort(
    (a, b) => Number(exhausted.has(a.name)) - Number(exhausted.has(b.name))
  );
}

async function callOne(model: string, prompt: string, system: string, apiKey: string): Promise<string> {
  const isReasoner = model.includes('deepseek-r1') || model.includes('qvq');
  const body: any = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  };
  if (!isReasoner) body.response_format = { type: 'json_object' };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`${model} 调用失败 (${res.status}): ${text.slice(0, 200)}`);
    err.status = res.status; err.body = text;
    throw err;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function isQuotaErr(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || e.body || '').toLowerCase();
  if (e.status === 429) return true;
  return ['quota', 'allocation', 'used up', 'arrearage', 'rate_limit', 'model not found', 'modelnotfound'].some(k => msg.includes(k));
}

async function callText(prompt: string, system: string, useAnalyst = false): Promise<{ content: string; modelUsed: string; ensembleModels?: string[] }> {
  const settings = await getOrInitSettings();
  const apiKey = settings.apiKey || import.meta.env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('未配置 API Key');

  // ===== 单模型链（截图识别 / 不需要 ensemble 的场景）=====
  if (!useAnalyst) {
    const exhausted = new Set(settings.exhaustedModels || []);
    const ordered = [...MODEL_CHAIN].sort(
      (a, b) => Number(exhausted.has(a.name)) - Number(exhausted.has(b.name))
    );
    if (settings.preferredModel) {
      const idx = ordered.findIndex(m => m.name === settings.preferredModel);
      if (idx > 0) { const [pick] = ordered.splice(idx, 1); ordered.unshift(pick); }
    }
    let lastErr: any = null;
    for (const m of ordered) {
      if (exhausted.has(m.name)) continue;
      try {
        const content = await callOne(m.name, prompt, system, apiKey);
        return { content, modelUsed: m.name };
      } catch (e: any) {
        lastErr = e;
        if (isQuotaErr(e)) continue;
        throw e;
      }
    }
    throw new Error('所有免费模型都不可用：' + (lastErr?.message || ''));
  }

  // ===== 分析模型链 =====
  const chain = getAnalystChain(settings);
  if (chain.length === 0) throw new Error('未启用任何理财分析模型');

  const ensembleSize = Math.max(1, Math.min(3, settings.ensembleSize ?? 1));

  // ----- 单模型模式（最常见）-----
  if (ensembleSize === 1) {
    let lastErr: any = null;
    const allChains = [...chain, ...MODEL_CHAIN];   // 分析链先用，再 fallback 到视觉链
    for (const m of allChains) {
      try {
        const content = await callOne(m.name, prompt, system, apiKey);
        return { content, modelUsed: m.name };
      } catch (e: any) {
        lastErr = e;
        if (isQuotaErr(e)) continue;
        throw e;
      }
    }
    throw new Error('所有理财模型都不可用：' + (lastErr?.message || ''));
  }

  // ----- 交叉验证模式（N 个模型并行 + 第 N+1 个综合）-----
  const candidates = chain.slice(0, ensembleSize);
  const results = await Promise.allSettled(
    candidates.map(m => callOne(m.name, prompt, system, apiKey).then(content => ({ name: m.name, content })))
  );
  const successful = results
    .filter((r): r is PromiseFulfilledResult<{ name: string; content: string }> => r.status === 'fulfilled')
    .map(r => r.value);

  if (successful.length === 0) {
    // 全部失败 → 退回单模型 fallback
    const lastErr = (results.find(r => r.status === 'rejected') as any)?.reason;
    throw new Error('交叉验证全部失败：' + (lastErr?.message || ''));
  }
  if (successful.length === 1) {
    // 只有一个成功就直接用它
    return { content: successful[0].content, modelUsed: successful[0].name + ' (单模型)', ensembleModels: [successful[0].name] };
  }

  // 用 R1 / Max 综合多份意见
  const synthesizer = chain[0];   // 最优模型作为综合者
  const synthPrompt = `以下是 ${successful.length} 个 AI 模型对同一问题的回答。请综合它们的共识、剔除离群观点，输出一份最终的、最可靠的方案。
保持原始 JSON 结构不变，只输出最终 JSON。

${successful.map((s, i) => `===== 模型 ${i + 1} (${s.name}) =====\n${s.content}`).join('\n\n')}

请综合输出最终 JSON。`;

  try {
    const finalContent = await callOne(synthesizer.name, synthPrompt, '你是一个 AI 答案综合器，从多个模型的回答中提炼共识，输出最终的高质量 JSON。', apiKey);
    return {
      content: finalContent,
      modelUsed: `${synthesizer.label || synthesizer.name} 综合 ${successful.length} 个模型`,
      ensembleModels: successful.map(s => s.name)
    };
  } catch {
    // 综合失败就用第一个原始结果
    return {
      content: successful[0].content,
      modelUsed: successful[0].name + ' (综合失败，用原结果)',
      ensembleModels: successful.map(s => s.name)
    };
  }
}

function safeJson<T>(text: string): T | null {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
    return null;
  }
}

/* ---------- Asset analysis ---------- */

const ASSET_SYSTEM = `你是个人资产顾问。基于用户的持仓信息，对每项资产输出"现状判断 + 下一步建议"。
要求：
1. 中文输出
2. status：≤ 25 字，描述当前状态（如"短期亏损 1.4%，仍处合理回调"、"现金占比偏低"）
3. suggestion：≤ 30 字，给出可执行建议（如"加仓不超过 5%"、"考虑转入货币基金提高收益"）
4. level："good"=表现良好/无需操作 | "watch"=需要观察 | "action"=建议调整
5. 严格输出 JSON：{"items": [{"assetId": 1, "status": "...", "suggestion": "...", "level": "watch"}, ...]}
不要 markdown，不要解释。`;

export async function analyzeAssets(assets: Asset[]): Promise<{ items: AssetAdvice[]; meta: AdviceMeta }> {
  const settings = await getOrInitSettings();
  const ensembleSize = Math.max(1, Math.min(3, settings.ensembleSize ?? 1));

  if (assets.length === 0) {
    return { items: [], meta: { modelUsed: '-', ensembleSize, marketSnapshot: null, cachedAt: Date.now() } };
  }
  // 拉市场快照（30 分钟缓存），失败也不影响
  const market = await fetchMarketSnapshot().catch(() => null);
  const fingerprint = assets.map(a => `${a.id}:${a.balance.toFixed(0)}:${a.dailyChangePct ?? 0}`).join('|')
    + '|m=' + (market ? Math.floor(market.fetchedAt / (30 * 60 * 1000)) : 'none')
    + '|n=' + ensembleSize;

  const cached = await getCache('assets-analysis', fingerprint);
  if (cached) return cached;

  const lines = assets.map(a => {
    const cat = CATEGORY_MAP[a.category]?.label || a.category;
    const cost = a.cost ? ` 成本¥${a.cost.toFixed(0)}` : '';
    const chg = a.dailyChangePct !== undefined ? ` 日涨跌${a.dailyChangePct > 0 ? '+' : ''}${a.dailyChangePct}%` : '';
    return `id=${a.id} 名称="${a.name}" 类型=${cat} 平台=${a.platform || '-'} 当前¥${a.balance.toFixed(0)}${cost}${chg}`;
  }).join('\n');

  const total = assets.reduce((s, a) => s + a.balance, 0);
  const marketBlock = market ? `\n${formatSnapshotForPrompt(market)}\n` : '';
  const prompt = `${marketBlock}\n用户持仓共 ${assets.length} 项，总额 ¥${total.toFixed(0)}：\n${lines}\n\n请结合上方市场数据逐项分析。`;
  const { content: raw, modelUsed, ensembleModels } = await callText(prompt, ASSET_SYSTEM, true);
  const parsed = safeJson<{ items: AssetAdvice[] }>(raw);
  if (!parsed?.items) throw new Error('模型返回格式异常');

  const items: AssetAdvice[] = parsed.items.map(it => ({
    assetId: Number(it.assetId),
    status: String(it.status || '').slice(0, 60),
    suggestion: String(it.suggestion || '').slice(0, 80),
    level: ['good', 'watch', 'action'].includes(it.level) ? it.level : 'watch'
  })).filter(it => Number.isFinite(it.assetId));

  const meta: AdviceMeta = {
    modelUsed,
    ensembleModels,
    ensembleSize,
    marketSnapshot: market,
    cachedAt: Date.now()
  };
  const result = { items, meta };
  await setCache('assets-analysis', fingerprint, result);
  return result;
}

/* ---------- Goal advisor ---------- */

const GOAL_SYSTEM = `你是个人理财教练，结合中国市场与全球市场为用户设计达成目标的整体财富增值方案。
基于用户的总净值、持仓结构、目标金额和截止日期，输出三个维度的建议。

输出 JSON 严格结构：
{
  "summary": "≤60字，达成可能性判断（如'按当前节奏可如期达成'、'需引入海外资产 + 提高储蓄率 X%'）",
  "currentOptimization": [
    { "title": "≤12字", "detail": "≤40字，怎么做", "impact": "≤20字，预期影响" }
  ],
  "newAllocations": [
    {
      "market": "china | global | mixed",
      "type": "产品类型，如：A股宽基ETF / 美股QQQ / 港股通 / 黄金ETF / QDII / REITs / 可转债 / 美元货基 / 银行理财等",
      "title": "≤12字，方案标题",
      "detail": "≤50字，具体怎么投、配置比例建议",
      "expectedReturn": "如'年化5-8%'、'年化10-15%'",
      "risk": "low | medium | high"
    }
  ],
  "actionPlan": [
    { "phase": "本月内 | 近3个月 | 半年内 | 年内", "action": "≤30字" }
  ]
}

要求：
1. currentOptimization：基于现有持仓的优化（如调整配置、止盈、定投），最多 3 条
2. newAllocations：推荐 3-4 条新投资品类，覆盖中国 + 全球，按风险分散：至少 1 条低风险、1-2 条中风险、≤1 条高风险
   - 中国市场可选：A股宽基ETF（沪深300/中证500）、港股通、A股行业ETF、可转债、国债逆回购、银行理财、REITs
   - 全球市场可选：美股ETF（VOO/QQQ/VTI）、QDII基金、纳指100、海外REITs、黄金ETF、美元货基
   - 避免推荐高度投机品种作为主仓
3. actionPlan：按时间分阶段，最多 4 步，从短期到长期，串联上面的优化和新增配置
4. 全部中文，严格 JSON，不要 markdown 代码块，不要解释。`;

export async function adviseGoal(goal: Goal, assets: Asset[], totalNetWorth: number): Promise<{ advice: GoalAdvice; meta: AdviceMeta }> {
  const settings = await getOrInitSettings();
  const ensembleSize = Math.max(1, Math.min(3, settings.ensembleSize ?? 1));
  const market = await fetchMarketSnapshot().catch(() => null);
  const fingerprint = `${goal.id}:${goal.target}:${goal.deadline || ''}:${totalNetWorth.toFixed(0)}:${assets.length}`
    + '|m=' + (market ? Math.floor(market.fetchedAt / (30 * 60 * 1000)) : 'none')
    + '|n=' + ensembleSize;

  const cached = await getCache(`goal-${goal.id}`, fingerprint);
  if (cached) return cached;

  const breakdown = aggregateByCategory(assets);
  const remaining = goal.target - totalNetWorth;
  const monthsLeft = goal.deadline
    ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (30 * 86400000)))
    : null;
  const monthlyNeeded = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : null;
  const marketBlock = market ? `\n${formatSnapshotForPrompt(market)}\n` : '';

  const prompt = `${marketBlock}
【用户情况】
当前净值 ¥${totalNetWorth.toFixed(0)}
目标："${goal.name}" 目标额 ¥${goal.target.toFixed(0)}
截止：${goal.deadline || '无'} ${monthsLeft !== null ? `（剩 ${monthsLeft} 个月）` : ''}
缺口：¥${remaining.toFixed(0)} ${monthlyNeeded ? `（需平均月增 ¥${monthlyNeeded.toFixed(0)}）` : ''}

【现有资产分布】
${breakdown}

请基于上方实时市场数据 + 用户情况，输出 JSON 格式的整体增值方案。新增配置的预期收益要参考市场快照里的实际数据（如汇率变动、黄金价格）做合理判断。`;

  const { content: raw, modelUsed, ensembleModels } = await callText(prompt, GOAL_SYSTEM, true);
  const parsed = safeJson<any>(raw);
  if (!parsed) throw new Error('模型返回格式异常');

  const advice: GoalAdvice = {
    goalId: goal.id!,
    summary: String(parsed.summary || '').slice(0, 120),
    currentOptimization: (parsed.currentOptimization || []).slice(0, 3).map((s: any) => ({
      title: String(s.title || '').slice(0, 20),
      detail: String(s.detail || '').slice(0, 80),
      impact: String(s.impact || '').slice(0, 40)
    })),
    newAllocations: (parsed.newAllocations || []).slice(0, 4).map((s: any) => ({
      market: ['china', 'global', 'mixed'].includes(s.market) ? s.market : 'mixed',
      type: String(s.type || '').slice(0, 30),
      title: String(s.title || '').slice(0, 20),
      detail: String(s.detail || '').slice(0, 100),
      expectedReturn: String(s.expectedReturn || '').slice(0, 30),
      risk: ['low', 'medium', 'high'].includes(s.risk) ? s.risk : 'medium'
    })),
    actionPlan: (parsed.actionPlan || []).slice(0, 4).map((s: any) => ({
      phase: String(s.phase || '').slice(0, 20),
      action: String(s.action || '').slice(0, 60)
    }))
  };
  const meta: AdviceMeta = {
    modelUsed,
    ensembleModels,
    ensembleSize,
    marketSnapshot: market,
    cachedAt: Date.now()
  };
  const result = { advice, meta };
  await setCache(`goal-${goal.id}`, fingerprint, result);
  return result;
}

function aggregateByCategory(assets: Asset[]): string {
  const map = new Map<string, number>();
  for (const a of assets) {
    const cat = CATEGORY_MAP[a.category]?.label || a.category;
    map.set(cat, (map.get(cat) || 0) + a.balance);
  }
  const total = Array.from(map.values()).reduce((s, n) => s + n, 0) || 1;
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}：¥${v.toFixed(0)} (${((v / total) * 100).toFixed(1)}%)`)
    .join('\n');
}
