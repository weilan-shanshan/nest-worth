import type { AssetCategory } from '../types';
import { getOrInitSettings, updateSettings } from '../db';
import { pickLlmMode, recognizeViaProxy } from './llm-client';

export interface RecognizedAsset {
  platform?: string;
  name: string;
  category: AssetCategory;
  balance: number;
  currency: string;
  cost?: number;
  dailyChange?: number;
  dailyChangePct?: number;
  note?: string;
  // 行情代码
  tickerSymbol?: string;
  tickerType?: 'cn-stock' | 'hk-stock' | 'us-stock' | 'cn-fund' | 'forex' | 'metal' | 'none';
  shares?: number;
  // 固收类
  termMonths?: number;
  interestRate?: number;
  startDate?: string;
  maturityDate?: string;
  transferredInterest?: number;   // 受让大额存单时已支付的利息
  holdingDays?: number;           // 截图明确写"您已持有 N 天"时填
  // 基金类
  annualizedReturn?: number;
  totalReturn?: number;
}

export interface RecognizeResult {
  items: RecognizedAsset[];
  modelUsed: string;
  modelsTried: string[];
  newlyExhausted: string[];
}

/**
 * 阿里云百炼 vision 模型链（按性价比/质量排序，全部 100 万 token 免费额度）。
 * 用完一个自动切下一个，已用完的会持久化到 IndexedDB。
 * 只用于截图识别（必须支持图像 input）。
 */
export const MODEL_CHAIN: { name: string; label: string }[] = [
  { name: 'qwen-vl-plus',              label: 'Qwen-VL Plus（性价比之王）' },
  { name: 'qwen2.5-vl-7b-instruct',    label: 'Qwen2.5-VL 7B（开源轻量）' },
  { name: 'qwen2.5-vl-32b-instruct',   label: 'Qwen2.5-VL 32B（开源中型）' },
  { name: 'qwen2.5-vl-72b-instruct',   label: 'Qwen2.5-VL 72B（开源旗舰）' },
  { name: 'qvq-max',                   label: 'QVQ-Max（视觉推理）' },
  { name: 'qvq-72b-preview',           label: 'QVQ 72B Preview（推理开源）' },
  { name: 'qwen-vl-max',               label: 'Qwen-VL Max（最强非推理）' }
];

/**
 * 文本/分析模型链（专为理财分析挑选，按推理深度/中文金融能力排序）。
 * 全部在百炼免费额度内。advisor.ts 会优先用这个链，失败再 fallback 到 MODEL_CHAIN。
 *
 * `cost`: 性价比评分（1-5，5 最高）
 * `quality`: 金融分析质量评分（1-5，5 最高）
 * `speed`: 响应速度（1-5，5 最快）
 */
export interface AnalystModel {
  name: string;
  label: string;
  desc: string;
  quality: number;
  speed: number;
  cost: number;
}

export const ANALYST_CHAIN: AnalystModel[] = [
  { name: 'deepseek-r1',          label: 'DeepSeek-R1',        desc: '推理模型，金融决策最优',     quality: 5, speed: 1, cost: 3 },
  { name: 'qwen-max-latest',      label: 'Qwen-Max',           desc: '中文金融旗舰',               quality: 5, speed: 3, cost: 3 },
  { name: 'deepseek-v3',          label: 'DeepSeek-V3',        desc: '性价比标杆',                 quality: 4, speed: 4, cost: 5 },
  { name: 'qwen-plus',            label: 'Qwen-Plus',          desc: '平衡选择',                   quality: 4, speed: 4, cost: 4 },
  { name: 'qwen2.5-72b-instruct', label: 'Qwen2.5 72B',        desc: '开源旗舰',                   quality: 4, speed: 3, cost: 4 },
  { name: 'qwen2.5-32b-instruct', label: 'Qwen2.5 32B',        desc: '开源中型',                   quality: 3, speed: 4, cost: 5 },
  { name: 'qwen-turbo',           label: 'Qwen-Turbo',         desc: '兜底快速',                   quality: 3, speed: 5, cost: 5 }
];

const SYSTEM_PROMPT = `你是一个金融资产识别助手。用户会上传一张来自银行/支付宝/微信/券商/基金 App 的截图。
请识别图片中的所有"资产持仓项"，每一项输出一条记录。

字段约束：
- platform: 截图所在 App / 银行名称（招商银行 / 支付宝 / 富途 / 蚂蚁财富 ...）
- name: 该资产的具体名称（如"招行三年定期"、"招银理财月月利"、"易方达蓝筹"）
- category: 必须是以下枚举之一：
   * cash       - 现金/活期/余额宝/货币基金
   * deposit    - 银行定期存款（必须是银行的存款，到期还本付息）
   * wealth     - 固收类理财（招银理财/工银理财/信托/券商资管/银行 R2-R3 理财）
   * fund       - 基金（公募基金/私募基金/QDII/ETF）
   * stock      - 股票（A 股/港股/美股个股）
   * realestate - 房产
   * insurance  - 保险
   * receivable - 应收借出
   * other      - 其他
   重要：定期存款（deposit）和理财（wealth）是不同类目！银行存款叫 deposit，"XX 理财产品"叫 wealth
- balance: 当前金额，纯数字，去掉千分位、单位
- currency: ISO 货币代码（CNY / USD / HKD ...），默认 CNY
- cost: 持仓成本（可选）
- dailyChange / dailyChangePct: 当日涨跌（可选）
- tickerSymbol: 行情代码（基金/股票适用）：A 股 6 位 / 港股 5 位 / 美股字母 / 基金 6 位
- tickerType: 与 tickerSymbol 对应：cn-stock | hk-stock | us-stock | cn-fund
- shares: 持仓数量（股 / 份）
- termMonths: 期限（月），定期存款用，如 12 / 36；开放式理财（无固定期限的"半年宝/活期理财"等）不填
- interestRate: 年化利率 %（数字），如 3.5（不带 % 符号）。开放式/净值型理财通常无固定利率，不填
- startDate: 起息日，格式 YYYY-MM-DD
- maturityDate: 到期日，格式 YYYY-MM-DD
- transferredInterest: 受让大额存单/转让理财时已支付的"已受让利息 / 已付受让利息"，纯数字（如 15066.39）
- holdingDays: 截图明确显示"您已持有 N 天"时直接填整数（如 10）；不要从日期反算
- annualizedReturn: 基金年化收益率 %
- totalReturn: 基金累计收益金额（CNY）
- note: 任何额外说明（可选）

特别注意：
- 大额存单"转让/受让"页签里会出现「已付受让利息 / 已支付受让利息 / 已收受让利息」金额，必须填到 transferredInterest，不要塞进 cost 或 balance
- 开放式理财（如"半年宝/财富竹/天天理财"等带"持仓收益/持有收益率"且无固定到期日的产品）属于 wealth，但通常没有 termMonths/interestRate/startDate，只有 cost（持仓成本）和 holdingDays（已持有 N 天）。这种情况下后三者全部留空

严格只输出 JSON，结构：{"items": [<RecognizedAsset>, ...]}。
不要 markdown 代码块，不要解释。如果图片无可识别资产，输出 {"items": []}。`;

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * 截图识别入口。按 pickLlmMode() 决定走代付还是 BYOK 直连。
 *   - proxy（已登录且非 Studio）→ server 代付，扣平台配额
 *   - byok（未登录或 Studio）→ 本地 Key，原模型链 fallback 逻辑不变
 */
export async function recognizeAssetScreenshot(file: File): Promise<RecognizeResult> {
  if (pickLlmMode() === 'proxy') {
    return recognizeViaProxy(file);
  }
  return recognizeViaByok(file);
}

async function recognizeViaByok(file: File): Promise<RecognizeResult> {
  const settings = await getOrInitSettings();
  const apiKey = settings.apiKey || import.meta.env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('未配置 Qwen-VL API Key，请到「设置」页填入');
  }

  const dataUrl = await fileToDataUrl(file);
  const exhausted = new Set(settings.exhaustedModels || []);
  const newlyExhausted: string[] = [];
  const modelsTried: string[] = [];

  // 调整模型顺序：用户偏好的排前，已耗尽的排末
  const ordered = orderModels(settings.preferredModel, exhausted);

  let lastError: Error | null = null;

  for (const m of ordered) {
    if (exhausted.has(m.name)) continue;
    modelsTried.push(m.name);
    try {
      const items = await callModel(apiKey, m.name, dataUrl);
      // 即便 items 为空也算调用成功（只是图里没东西），不切模型
      if (newlyExhausted.length) {
        await persistExhausted([...exhausted, ...newlyExhausted]);
      }
      return { items, modelUsed: m.name, modelsTried, newlyExhausted };
    } catch (err: any) {
      lastError = err;
      if (isQuotaError(err)) {
        exhausted.add(m.name);
        newlyExhausted.push(m.name);
        continue;   // 切下一个
      }
      // 非额度错误（网络/认证/参数）直接抛
      if (newlyExhausted.length) {
        await persistExhausted([...exhausted]);
      }
      throw err;
    }
  }

  // 所有模型都试完了
  if (newlyExhausted.length) {
    await persistExhausted([...exhausted]);
  }
  throw new Error(
    `所有 ${modelsTried.length} 个免费模型额度都已用完。\n` +
    `可在「设置」点"重置已耗尽"重试，或等阿里云月度刷新。\n` +
    `最后错误：${lastError?.message || '未知'}`
  );
}

function orderModels(preferred: string | undefined, exhausted: Set<string>) {
  const chain = [...MODEL_CHAIN];
  // 用户偏好的排到第一位
  if (preferred) {
    const idx = chain.findIndex(m => m.name === preferred);
    if (idx > 0) {
      const [pick] = chain.splice(idx, 1);
      chain.unshift(pick);
    }
  }
  // 已耗尽的排到末尾（保留以备万一手动重置后再试）
  return chain.sort((a, b) => Number(exhausted.has(a.name)) - Number(exhausted.has(b.name)));
}

async function callModel(apiKey: string, model: string, dataUrl: string): Promise<RecognizedAsset[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
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
    const text = await res.text();
    const err: any = new Error(`Qwen 调用失败 (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型未返回有效内容');

  const parsed = safeParseJson(content);
  const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
  const normalized = rawItems.map(normalize).filter(Boolean) as RecognizedAsset[];

  console.groupCollapsed(`[recognize] ${model} → ${normalized.length} item(s)`);
  console.log('raw content string:', content);
  console.log('parsed.items (model output):', rawItems);
  console.log('normalized (after filter):', normalized);
  const fixedIncomeFields = ['termMonths', 'interestRate', 'startDate', 'maturityDate'];
  rawItems.forEach((it, i) => {
    const missing = fixedIncomeFields.filter(f => it?.[f] === undefined || it?.[f] === null || it?.[f] === '');
    if (missing.length) console.warn(`item[${i}] "${it?.name}" missing fixed-income fields:`, missing);
  });
  console.groupEnd();

  return normalized;
}

/**
 * 判断是否是免费额度耗尽 / 限流类错误。
 * 阿里云百炼 / DashScope OpenAI 兼容协议的常见关键词：
 *   - "Free allocated quota exceeded"
 *   - "Throttling.AllocationQuota"
 *   - "Free trial quota has been used up"
 *   - "InsufficientBalance" / "Arrearage"
 *   - HTTP 429 (rate limit)
 */
function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.body || '').toLowerCase();
  if (err.status === 429) return true;
  return [
    'quota',
    'allocationquota',
    'throttling',
    'free trial',
    'free tier',
    'free allocated',
    'used up',
    'insufficientbalance',
    'arrearage',
    'rate_limit',
    'limit_requests',
    'limit exceeded'
  ].some(k => msg.includes(k));
}

async function persistExhausted(list: string[]): Promise<void> {
  const uniq = Array.from(new Set(list));
  await updateSettings({ exhaustedModels: uniq });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

const VALID_CATS: AssetCategory[] = [
  'cash', 'deposit', 'wealth', 'fund', 'stock', 'realestate', 'insurance', 'receivable', 'other'
];

const VALID_TICKER_TYPES = ['cn-stock', 'hk-stock', 'us-stock', 'cn-fund', 'forex', 'metal'];

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
    tickerType: tickerType as any,
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

function numOrUndef(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function resetExhaustedModels(): Promise<void> {
  await updateSettings({ exhaustedModels: [] });
}

export async function setPreferredModel(model: string | undefined): Promise<void> {
  await updateSettings({ preferredModel: model });
}
