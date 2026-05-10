/**
 * 资产派生字段计算（不写入 DB，渲染时实时算）。
 */
import type { Asset } from '../types';

/** 起息日 + 期限 → 到期日 */
export function computeMaturityDate(a: Asset): string | null {
  if (a.maturityDate) return a.maturityDate;
  if (!a.startDate || !a.termMonths) return null;
  const d = new Date(a.startDate);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + a.termMonths);
  return d.toISOString().slice(0, 10);
}

/** 距到期天数（已到期返回 0，未配置返回 null） */
export function daysToMaturity(a: Asset): number | null {
  const mat = computeMaturityDate(a);
  if (!mat) return null;
  const diff = new Date(mat).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

/** 到期金额（本金 + 利息）。优先用户填，否则按单利公式自动算 */
export function computeMaturityValue(a: Asset): number | null {
  if (a.maturityValue !== undefined) return a.maturityValue;
  if (!a.balance || !a.interestRate || !a.termMonths) return null;
  const years = a.termMonths / 12;
  // 简单单利（多数定期/理财都是按单利展示）
  return a.balance * (1 + (a.interestRate * years) / 100);
}

/** 到期收益 = 到期金额 - 当前本金 */
export function computeMaturityProfit(a: Asset): number | null {
  const v = computeMaturityValue(a);
  if (v === null) return null;
  return v - a.balance;
}

/** 基金累计收益百分比 */
export function fundReturnPct(a: Asset): number | null {
  if (a.totalReturn !== undefined && a.cost) {
    return (a.totalReturn / a.cost) * 100;
  }
  if (a.cost && a.balance) {
    return ((a.balance - a.cost) / a.cost) * 100;
  }
  return null;
}

/** 基金累计收益金额（优先用 totalReturn 字段，否则用 balance - cost 推算） */
export function fundReturnAbs(a: Asset): number | null {
  if (a.totalReturn !== undefined) return a.totalReturn;
  if (a.cost) return a.balance - a.cost;
  return null;
}

/** 持有天数（从 startDate 优先，回落到 createdAt） */
export function holdingDays(a: Asset): number | null {
  const start = a.startDate ? new Date(a.startDate) : null;
  if (start && !isNaN(start.getTime())) {
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
  }
  if (a.createdAt) {
    return Math.max(0, Math.floor((Date.now() - a.createdAt) / 86400000));
  }
  return null;
}
