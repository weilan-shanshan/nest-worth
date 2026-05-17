/**
 * 阿里云百炼分析模型调用封装（服务端代付路径）。
 *
 * 与 bailian-ocr.ts 类似的形态，但：
 *   - 文本/推理模型（非视觉）
 *   - reasoner 模型（deepseek-r1 / qvq）不强制 json_object 响应格式
 *   - 单次 callOne 返回 {content, tokensIn, tokensOut}，由 orchestrator 决定 N 路并行 / 综合
 *
 * SYSTEM_PROMPT 不在本文件——advisor 的系统提示由前端构造后透传过来（不同场景：持仓
 * 分析 / 目标方案 / 综合 prompt 都长得不一样），server 不做任何 prompt 改写。
 */

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export interface CallOneResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

export class BailianAnalystError extends Error {
  status?: number;
  isQuotaError: boolean;
  isTimeout: boolean;
  constructor(message: string, opts: { status?: number; isQuotaError?: boolean; isTimeout?: boolean } = {}) {
    super(message);
    this.status = opts.status;
    this.isQuotaError = opts.isQuotaError ?? false;
    this.isTimeout = opts.isTimeout ?? false;
  }
}

const API_KEY = process.env.BAILIAN_API_KEY;
if (!API_KEY) {
  console.warn('[bailian-analyst] BAILIAN_API_KEY 未配置，/llm/analysis 调用会失败');
}

const ANALYSIS_TIMEOUT_MS = 90_000;

/**
 * 调用单个文本模型。
 * - reasoner（deepseek-r1 / qvq）：不强制 json_object，由 prompt 自己控制
 * - 其余：强制 response_format = json_object（与 advisor.ts BYOK 路径一致）
 */
export async function callOne(opts: {
  model: string;
  prompt: string;
  system: string;
  jsonObject?: boolean;
}): Promise<CallOneResult> {
  if (!API_KEY) {
    throw new BailianAnalystError('server BAILIAN_API_KEY 未配置', { status: 500 });
  }

  const isReasoner = opts.model.includes('deepseek-r1') || opts.model.includes('qvq');
  const useJsonFormat = opts.jsonObject ?? !isReasoner;

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt }
    ]
  };
  if (useJsonFormat) body.response_format = { type: 'json_object' };

  const ctrl = AbortSignal.timeout(ANALYSIS_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl
    });
  } catch (e) {
    const err = e as Error;
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new BailianAnalystError(
      isTimeout ? `${opts.model} 调用超时（${ANALYSIS_TIMEOUT_MS / 1000}s）` : `${opts.model} 网络错误: ${err.message}`,
      { isTimeout }
    );
  }

  if (!res.ok) {
    const text = await res.text();
    const lower = text.toLowerCase();
    const isQuota = res.status === 429
      || lower.includes('quota')
      || lower.includes('throttling')
      || lower.includes('insufficientbalance')
      || lower.includes('arrearage')
      || lower.includes('modelnotfound');
    throw new BailianAnalystError(
      `${opts.model} 调用失败 (${res.status}): ${text.slice(0, 200)}`,
      { status: res.status, isQuotaError: isQuota }
    );
  }

  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new BailianAnalystError(`${opts.model} 未返回有效内容`);
  }

  return {
    content,
    tokensIn: Number(data?.usage?.prompt_tokens) || 0,
    tokensOut: Number(data?.usage?.completion_tokens) || 0
  };
}
