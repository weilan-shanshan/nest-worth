/**
 * 阿里云百炼 OCR 调用封装（服务端代付路径专用）。
 *
 * Sprint 1：只走 1 个模型（qwen-vl-plus），无 fallback chain。
 * 配额/限速/失败 fallback 是 Sprint 2 增强项。
 *
 * 与 frontend src/lib/recognize.ts 共用同一份 SYSTEM_PROMPT 和 normalize 逻辑，
 * 但为了避免跨 tsconfig 共享导入复杂度，这里复制保留一份。
 * SYSTEM_PROMPT 修改必须两边同步——上线后会抽到 schema 文件分发。
 */

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen-vl-plus';

// Qwen-VL Plus 计费（2026-05）：输入/输出同价 ¥0.008/1K tokens
// → ¥/token = 0.000008 = 0.0008 cents/token
// 用整数（cent × 10000）精度避免浮点；最终 cost_cents = ceil(units / 10000)
const PRICE_PER_TOKEN_X10K = 8; // 0.0008 cents × 10000

const SYSTEM_PROMPT = `你是一个金融资产识别助手。用户会上传一张来自银行/支付宝/微信/券商/基金 App 的截图。
请识别图片中的所有"资产持仓项"，每一项输出一条记录。

字段约束：
- platform: 截图所在 App / 银行名称
- name: 该资产的具体名称
- category: 必须是以下枚举之一：
   * cash | deposit | wealth | fund | stock | realestate | insurance | receivable | other
   重要：定期存款（deposit）和理财（wealth）是不同类目
- balance: 当前金额，纯数字，去掉千分位、单位
- currency: ISO 货币代码（CNY / USD / HKD ...），默认 CNY
- cost: 持仓成本（可选）
- dailyChange / dailyChangePct: 当日涨跌（可选）
- tickerSymbol: 行情代码（基金/股票适用）
- tickerType: cn-stock | hk-stock | us-stock | cn-fund | forex | metal
- shares: 持仓数量
- termMonths: 期限（月），定期存款用；开放式理财不填
- interestRate: 年化利率 %（数字，不带 %）。开放式/净值型理财通常无固定利率，不填
- startDate / maturityDate: 起息日 / 到期日，格式 YYYY-MM-DD
- transferredInterest: 大额存单"转让/受让"时已支付的"已付受让利息"，纯数字
- holdingDays: 截图明确显示"您已持有 N 天"时直接填整数
- annualizedReturn: 基金年化收益率 %
- totalReturn: 基金累计收益金额
- note: 任何额外说明（可选）

严格只输出 JSON，结构：{"items": [<RecognizedAsset>, ...]}。
不要 markdown 代码块，不要解释。如果图片无可识别资产，输出 {"items": []}。`;

const VALID_CATS = ['cash', 'deposit', 'wealth', 'fund', 'stock', 'realestate', 'insurance', 'receivable', 'other'];
const VALID_TICKER_TYPES = ['cn-stock', 'hk-stock', 'us-stock', 'cn-fund', 'forex', 'metal'];

export interface RecognizedAsset {
  platform?: string;
  name: string;
  category: string;
  balance: number;
  currency: string;
  cost?: number;
  dailyChange?: number;
  dailyChangePct?: number;
  note?: string;
  tickerSymbol?: string;
  tickerType?: string;
  shares?: number;
  termMonths?: number;
  interestRate?: number;
  startDate?: string;
  maturityDate?: string;
  transferredInterest?: number;
  holdingDays?: number;
  annualizedReturn?: number;
  totalReturn?: number;
}

export interface OcrCallResult {
  items: RecognizedAsset[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
}

export class BailianError extends Error {
  status?: number;
  isQuotaError: boolean;
  constructor(message: string, status?: number, isQuotaError = false) {
    super(message);
    this.status = status;
    this.isQuotaError = isQuotaError;
  }
}

const API_KEY = process.env.BAILIAN_API_KEY;
if (!API_KEY) {
  // 不直接 exit；让服务能起来（其他路由可用），调用 OCR 时再抛
  console.warn('[bailian-ocr] BAILIAN_API_KEY 未配置，/llm/ocr 调用会失败');
}

/**
 * 调用 OCR。输入 base64 data URL（同前端 fileToDataUrl 输出）。
 */
export async function callOcr(dataUrl: string, model = DEFAULT_MODEL): Promise<OcrCallResult> {
  if (!API_KEY) {
    throw new BailianError('server BAILIAN_API_KEY 未配置', 500);
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: '请识别截图中的所有资产持仓项，输出 JSON。' }
          ]
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const lower = body.toLowerCase();
    const isQuota = res.status === 429
      || lower.includes('quota')
      || lower.includes('throttling')
      || lower.includes('insufficientbalance')
      || lower.includes('arrearage');
    throw new BailianError(
      `Bailian 调用失败 (${res.status}): ${body.slice(0, 300)}`,
      res.status,
      isQuota
    );
  }

  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new BailianError('Bailian 未返回有效内容');

  const tokensIn = Number(data?.usage?.prompt_tokens) || 0;
  const tokensOut = Number(data?.usage?.completion_tokens) || 0;
  const costCents = Math.ceil(((tokensIn + tokensOut) * PRICE_PER_TOKEN_X10K) / 10000);

  const parsed = safeParseJson(content);
  const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = rawItems.map(normalize).filter((x): x is RecognizedAsset => x !== null);

  return { items, model, tokensIn, tokensOut, costCents };
}

function safeParseJson(text: string): any {
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall */ } }
    return null;
  }
}

function numOrUndef(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalize(raw: any): RecognizedAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const balance = Number(raw.balance);
  if (!Number.isFinite(balance)) return null;
  const cat = VALID_CATS.includes(raw.category) ? raw.category : 'other';
  const ticker = typeof raw.tickerSymbol === 'string' ? raw.tickerSymbol.trim().toUpperCase() : undefined;
  const tickerType = typeof raw.tickerType === 'string' && VALID_TICKER_TYPES.includes(raw.tickerType)
    ? raw.tickerType
    : undefined;
  return {
    platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    name: String(raw.name || raw.platform || '未命名资产').trim(),
    category: cat,
    balance,
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'CNY',
    cost: numOrUndef(raw.cost),
    dailyChange: numOrUndef(raw.dailyChange),
    dailyChangePct: numOrUndef(raw.dailyChangePct),
    note: typeof raw.note === 'string' ? raw.note : undefined,
    tickerSymbol: ticker || undefined,
    tickerType,
    shares: numOrUndef(raw.shares),
    termMonths: numOrUndef(raw.termMonths),
    interestRate: numOrUndef(raw.interestRate),
    startDate: typeof raw.startDate === 'string' ? raw.startDate : undefined,
    maturityDate: typeof raw.maturityDate === 'string' ? raw.maturityDate : undefined,
    transferredInterest: numOrUndef(raw.transferredInterest),
    holdingDays: numOrUndef(raw.holdingDays),
    annualizedReturn: numOrUndef(raw.annualizedReturn),
    totalReturn: numOrUndef(raw.totalReturn)
  };
}
