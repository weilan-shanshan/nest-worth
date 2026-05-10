import type { AssetCategory } from '../types';
import { getOrInitSettings, updateSettings } from '../db';

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
- platform: 截图所在 App / 银行名称（招商银行 / 支付宝 / 富途 / Binance ...）
- name: 该资产的具体名称（如"招行储蓄卡 1234"、"易方达蓝筹"、"贵州茅台"）
- category: 必须是以下枚举之一：cash | deposit | fund | stock | crypto | realestate | insurance | receivable | other
- balance: 当前金额，纯数字，去掉千分位、单位
- currency: ISO 货币代码（CNY / USD / HKD ...），默认 CNY
- cost: 持仓成本（可选）
- dailyChange: 当日涨跌金额（可选，正为涨负为跌）
- dailyChangePct: 当日涨跌百分比数字（如 +1.23 写 1.23，-0.5 写 -0.5）
- note: 任何额外说明（可选）

严格只输出 JSON，结构：{"items": [<RecognizedAsset>, ...]}。
不要 markdown 代码块，不要解释。如果图片无可识别资产，输出 {"items": []}。`;

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export async function recognizeAssetScreenshot(file: File): Promise<RecognizeResult> {
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
  const items: RecognizedAsset[] = Array.isArray(parsed?.items) ? parsed.items : [];
  return items.map(normalize).filter(Boolean) as RecognizedAsset[];
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
  'cash', 'deposit', 'fund', 'stock', 'crypto', 'realestate', 'insurance', 'receivable', 'other'
];

function normalize(raw: any): RecognizedAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const balance = Number(raw.balance);
  if (!Number.isFinite(balance)) return null;
  const cat = VALID_CATS.includes(raw.category) ? raw.category : 'other';
  return {
    platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    name: String(raw.name || raw.platform || '未命名资产').trim(),
    category: cat,
    balance,
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'CNY',
    cost: numOrUndef(raw.cost),
    dailyChange: numOrUndef(raw.dailyChange),
    dailyChangePct: numOrUndef(raw.dailyChangePct),
    note: typeof raw.note === 'string' ? raw.note : undefined
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
