/**
 * 资产派生字段计算（LLM 主路径 + asset-calc.ts 兜底）。
 *
 * 触发时机：
 *   1. 截图识别入库后（store.applyScreenshotImport → recomputeDerivedFor）
 *   2. 用户补充基础字段保存后（store.updateAsset → recomputeDerivedFor）
 *   3. 每次 app 启动且 settings.derivedAllAt > 12h（store.load → recomputeAllDerived）
 *   4. 用户手动点"重新计算"按钮
 *
 * 输出落到 a.derived（AssetDerived），UI 只读这里。
 *
 * ⚠️ 严禁让用户直接填收益/天数/年化字段，详见 feedback memory。
 */

import type { Asset, AssetDerived, AssetCategory, DeriveMode } from '../types';
import { db } from '../db';
import { callText, safeJson } from './advisor';
import * as fallback from './asset-calc';

const CACHE_TTL = 24 * 60 * 60 * 1000;

const SYSTEM = `你是金融资产派生字段计算器。给定一组资产的"基础事实字段"，输出每条资产的派生字段。

## 派生字段（按 category 取舍，无法算就省略字段）
- daysToMaturity: 距到期天数（仅 deposit/wealth；今天为 today，已到期为 0）
- maturityValue: 到期金额（balance + 利息），按单利公式：balance * (1 + interestRate% * termYears)
- maturityProfit: 到期收益 = maturityValue - balance
- holdingDays: 持有天数 = today - startDate（若无 startDate 用 createdAt 的日期）
- fundReturnAbs: 基金累计收益金额 = balance - cost
- fundReturnPct: 基金累计收益率 % = (balance - cost) / cost * 100
- annualized: 年化收益率 %
   * deposit/wealth: 直接用 interestRate
   * fund: 简易年化 = fundReturnPct * 365 / max(holdingDays, 1)（若 holdingDays<30，可直接用 fundReturnPct 不年化）
- pnlAbs / pnlPct: 通用浮盈金额/率 = balance - cost / pct（仅 stock/realestate 有 cost 时算）

## 输出严格 JSON（不要 markdown 代码块）：
{"items": [{"id": <number>, "derived": {...}}, ...]}

省略的字段不要写 null，整个不出现即可。绝对不要捏造数字。

## 计算注意
- 所有日期按 ISO YYYY-MM-DD 解析；today 由 prompt 提供
- 单位：金额是 CNY 整数级数字，百分比直接用数字（如 3.5 表示 3.5%）
- 计算结果保留 2 位小数
- 如果输入数据明显矛盾（如 termMonths 为负、maturityDate 在 startDate 之前），跳过该项的派生（输出 derived: {}）`;

interface BasicsInput {
  id: number;
  category: AssetCategory;
  name: string;
  balance: number;
  cost?: number;
  interestRate?: number;
  termMonths?: number;
  startDate?: string;
  maturityDate?: string;
  shares?: number;
  createdAt: number;
}

function pickBasics(a: Asset): BasicsInput {
  return {
    id: a.id!,
    category: a.category,
    name: a.name,
    balance: a.balance,
    cost: a.cost,
    interestRate: a.interestRate,
    termMonths: a.termMonths,
    startDate: a.startDate,
    maturityDate: a.maturityDate,
    shares: a.shares,
    createdAt: a.createdAt
  };
}

/**
 * 检查资产缺哪些"基础事实"字段才能算派生。
 * 返回 key 列表（types.ts Asset 上对应的字段名），UI 用此弹补充表单。
 */
export function getMissingBasics(a: Asset): string[] {
  const missing: string[] = [];
  switch (a.category) {
    case 'deposit':
    case 'wealth':
      if (!a.interestRate) missing.push('interestRate');
      if (!a.startDate) missing.push('startDate');
      if (!a.termMonths && !a.maturityDate) missing.push('termMonths');
      break;
    case 'fund':
      if (a.cost === undefined) missing.push('cost');
      if (!a.startDate) missing.push('startDate');
      // shares 缺也行（可只看金额收益），但行情同步会失效
      break;
    case 'stock':
      if (a.cost === undefined) missing.push('cost');
      if (!a.shares) missing.push('shares');
      break;
    case 'realestate':
      // cost 可缺，缺了就不算浮盈
      break;
    default:
      // cash / insurance / receivable / other 通常无派生需求
      break;
  }
  return missing;
}

/** 整批的指纹：用于 24h 缓存命中判断 */
function fingerprintBatch(assets: BasicsInput[]): string {
  return assets
    .map(a => `${a.id}:${a.category}:${a.balance.toFixed(2)}:${a.cost ?? '_'}:${a.interestRate ?? '_'}:${a.termMonths ?? '_'}:${a.startDate ?? '_'}:${a.maturityDate ?? '_'}:${a.shares ?? '_'}`)
    .sort()
    .join('|');
}

function fingerprintOne(a: BasicsInput): string {
  return fingerprintBatch([a]);
}

async function getCache(key: string, fingerprint: string): Promise<any | null> {
  const row = await db.advice.where('key').equals(key).first();
  if (!row) return null;
  if (row.fingerprint !== fingerprint) return null;
  if (Date.now() - row.createdAt > CACHE_TTL) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}

async function setCache(key: string, fingerprint: string, payload: any): Promise<void> {
  const existing = await db.advice.where('key').equals(key).first();
  const row = {
    id: existing?.id,
    key,
    fingerprint,
    payload: JSON.stringify(payload),
    createdAt: Date.now()
  };
  if (existing?.id) await db.advice.put(row);
  else await db.advice.add(row);
}

function buildPrompt(items: BasicsInput[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = items.map(a => {
    const fields: string[] = [`id=${a.id}`, `category=${a.category}`, `name="${a.name}"`, `balance=${a.balance}`];
    if (a.cost !== undefined) fields.push(`cost=${a.cost}`);
    if (a.interestRate !== undefined) fields.push(`interestRate=${a.interestRate}`);
    if (a.termMonths !== undefined) fields.push(`termMonths=${a.termMonths}`);
    if (a.startDate) fields.push(`startDate=${a.startDate}`);
    if (a.maturityDate) fields.push(`maturityDate=${a.maturityDate}`);
    if (a.shares !== undefined) fields.push(`shares=${a.shares}`);
    fields.push(`createdAt=${new Date(a.createdAt).toISOString().slice(0, 10)}`);
    return `- ${fields.join(' ')}`;
  }).join('\n');
  return `today=${today}\n\n资产清单（${items.length} 项）：\n${lines}\n\n请输出 {"items":[{"id":..., "derived":{...}}, ...]} 严格 JSON。`;
}

/** asset-calc 兜底：当 LLM 失败或字段不足时用确定性公式补全可算的字段 */
function deriveFallback(a: Asset): AssetDerived {
  const d: AssetDerived = {};
  if (a.category === 'deposit' || a.category === 'wealth') {
    const days = fallback.daysToMaturity(a);
    if (days !== null) d.daysToMaturity = days;
    const v = fallback.computeMaturityValue(a);
    if (v !== null) d.maturityValue = round2(v);
    const p = fallback.computeMaturityProfit(a);
    if (p !== null) d.maturityProfit = round2(p);
    if (a.interestRate !== undefined) d.annualized = a.interestRate;
  } else if (a.category === 'fund') {
    const r = fallback.fundReturnAbs(a);
    if (r !== null) d.fundReturnAbs = round2(r);
    const p = fallback.fundReturnPct(a);
    if (p !== null) d.fundReturnPct = round2(p);
  } else if (a.category === 'stock' || a.category === 'realestate') {
    if (a.cost !== undefined) {
      d.pnlAbs = round2(a.balance - a.cost);
      d.pnlPct = a.cost ? round2(((a.balance - a.cost) / a.cost) * 100) : 0;
    }
  }
  const h = fallback.holdingDays(a);
  if (h !== null) d.holdingDays = h;
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface DeriveResult {
  derivedById: Map<number, AssetDerived>;
  modelUsed: string;
  fromCache: boolean;
}

/** 给 callText 套一个总超时（60s），避免多模型串联 fallback 把锁卡死 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`derive LLM timeout after ${ms}ms`)), ms))
  ]);
}

/** 整库一次 prompt 模式（默认） */
async function deriveBatch(inputs: BasicsInput[]): Promise<DeriveResult> {
  const fingerprint = fingerprintBatch(inputs);
  const cached = await getCache('derive-batch', fingerprint);
  if (cached?.items) {
    return {
      derivedById: new Map(cached.items.map((it: any) => [it.id, it.derived])),
      modelUsed: cached.modelUsed || 'cache',
      fromCache: true
    };
  }
  const prompt = buildPrompt(inputs);
  const { content, modelUsed } = await withTimeout(callText(prompt, SYSTEM, true), 60_000);
  const parsed = safeJson<{ items: { id: number; derived: AssetDerived }[] }>(content);
  if (!parsed?.items) throw new Error('派生计算 LLM 返回格式异常');
  const items = parsed.items.map(it => ({ id: Number(it.id), derived: sanitize(it.derived) }));
  await setCache('derive-batch', fingerprint, { items, modelUsed });
  return {
    derivedById: new Map(items.map(it => [it.id, it.derived])),
    modelUsed,
    fromCache: false
  };
}

/** 每条一次 LLM 模式（并发） */
async function deriveParallel(inputs: BasicsInput[]): Promise<DeriveResult> {
  const map = new Map<number, AssetDerived>();
  let modelUsed = '';
  let fromCache = true;

  await Promise.all(inputs.map(async (a) => {
    const fp = fingerprintOne(a);
    const cached = await getCache(`derive-one-${a.id}`, fp);
    if (cached?.derived) {
      map.set(a.id, cached.derived);
      return;
    }
    fromCache = false;
    try {
      const { content, modelUsed: m } = await withTimeout(callText(buildPrompt([a]), SYSTEM, true), 60_000);
      const parsed = safeJson<{ items: { id: number; derived: AssetDerived }[] }>(content);
      const item = parsed?.items?.[0];
      if (item?.derived) {
        const sane = sanitize(item.derived);
        map.set(a.id, sane);
        modelUsed = m;
        await setCache(`derive-one-${a.id}`, fp, { derived: sane, modelUsed: m });
      }
    } catch {
      // 单条失败不影响整体
    }
  }));

  return { derivedById: map, modelUsed: modelUsed || 'parallel', fromCache };
}

/** 把 LLM 返回的 derived 收紧（裁字段、转数字、丢弃 null/NaN） */
function sanitize(raw: any): AssetDerived {
  if (!raw || typeof raw !== 'object') return {};
  const d: AssetDerived = {};
  const numKeys: (keyof AssetDerived)[] = [
    'daysToMaturity', 'maturityValue', 'maturityProfit',
    'fundReturnAbs', 'fundReturnPct', 'annualized', 'holdingDays',
    'pnlAbs', 'pnlPct'
  ];
  for (const k of numKeys) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) (d as any)[k] = v;
  }
  if (typeof raw.note === 'string' && raw.note.trim()) d.note = String(raw.note).slice(0, 60);
  return d;
}

export interface RecomputeOptions {
  mode?: DeriveMode;
  /** 跳过缺基础字段的资产（不送 LLM，直接走兜底/missingFields）*/
  skipMissing?: boolean;
  /** 跳过 LLM 调用，全部用 asset-calc 兜底公式（用于无 API Key 场景） */
  skipLlm?: boolean;
}

export interface RecomputeResult {
  /** key=assetId，value=新的 derived（合并 LLM + 兜底）*/
  derived: Map<number, AssetDerived>;
  /** key=assetId，value=missingFields 列表 */
  missing: Map<number, string[]>;
  modelUsed: string;
  fromCache: boolean;
  llmFailed: boolean;
}

/**
 * 主入口：算给定一组资产的派生字段。
 * - 缺基础字段的资产不送 LLM（避免烧 token），仅打 missingFields 标记 + 兜底算尽量多的字段
 * - 其他资产按 mode 走 LLM；LLM 失败时全部回退到 asset-calc 公式
 */
export async function recomputeDerived(
  assets: Asset[],
  opts: RecomputeOptions = {}
): Promise<RecomputeResult> {
  const mode: DeriveMode = opts.mode ?? 'batch';
  const result: RecomputeResult = {
    derived: new Map(),
    missing: new Map(),
    modelUsed: '-',
    fromCache: false,
    llmFailed: false
  };

  const sendable: BasicsInput[] = [];
  for (const a of assets) {
    if (!a.id) continue;
    const missing = getMissingBasics(a);
    if (missing.length) {
      result.missing.set(a.id, missing);
      // 缺字段也尽量给一个兜底 derived（如纯天数/holdingDays 这种）
      result.derived.set(a.id, deriveFallback(a));
      continue;
    }
    sendable.push(pickBasics(a));
  }

  if (sendable.length === 0) {
    return result;
  }

  // 无 LLM 模式：直接全部走兜底
  if (opts.skipLlm) {
    result.modelUsed = 'fallback';
    for (const a of assets) {
      if (!a.id || result.missing.has(a.id)) continue;
      result.derived.set(a.id, deriveFallback(a));
    }
    return result;
  }

  try {
    const r = mode === 'parallel'
      ? await deriveParallel(sendable)
      : await deriveBatch(sendable);
    result.modelUsed = r.modelUsed;
    result.fromCache = r.fromCache;
    // 合并 LLM 输出与兜底（兜底兜 LLM 没给的字段）
    for (const a of assets) {
      if (!a.id || result.missing.has(a.id)) continue;
      const llm = r.derivedById.get(a.id) || {};
      const fb = deriveFallback(a);
      result.derived.set(a.id, { ...fb, ...llm });
    }
  } catch (err) {
    // LLM 全失败 → 全部走兜底
    result.llmFailed = true;
    for (const a of assets) {
      if (!a.id || result.missing.has(a.id)) continue;
      result.derived.set(a.id, deriveFallback(a));
    }
  }

  return result;
}

/** 12 小时阈值：> 12h 没算就重算 */
export const DERIVE_STALE_MS = 12 * 60 * 60 * 1000;

export function isStale(derivedAllAt?: number): boolean {
  if (!derivedAllAt) return true;
  return Date.now() - derivedAllAt > DERIVE_STALE_MS;
}
