import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import type { SubscriptionTier } from '../schema.js';

/**
 * 档位配额（每月）。
 * Sprint 1 首月翻倍是产品决策，由 isFirstMonth 参数控制。
 *
 * Free / Plus / Pro / Max 走平台代付，Studio 自带 Key 故 quota = 大数（不限）。
 */
const TIER_QUOTA: Record<SubscriptionTier, { ocr: number; analysis: number }> = {
  free:   { ocr: 30,   analysis: 5   },
  plus:   { ocr: 300,  analysis: 30  },
  pro:    { ocr: 1500, analysis: 80  },
  max:    { ocr: 5000, analysis: 300 },
  studio: { ocr: 999_999, analysis: 999_999 }
};

export function tierToQuota(tier: SubscriptionTier, isFirstMonth = false): { ocr: number; analysis: number } {
  const base = TIER_QUOTA[tier] ?? TIER_QUOTA.free;
  if (!isFirstMonth || tier !== 'free') return base;
  // 首月翻倍仅适用于 Free 档
  return { ocr: base.ocr * 2, analysis: base.analysis * 2 };
}

/** 当月起始日期（UTC，与 quota_snapshots.period_start 类型对齐） */
export function currentPeriodStart(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * 用户登录时调用：当月 quota_snapshot 不存在则创建，存在则不动。
 * 幂等：同一 (user_id, period_start) 唯一约束（PK）。
 *
 * 注入 client 时复用调用方事务；不注入则起新连接。
 */
export async function ensureCurrentPeriodQuota(
  userId: string,
  tier: SubscriptionTier,
  isFirstMonth = false,
  client?: PoolClient
): Promise<void> {
  const period = currentPeriodStart();
  const q = tierToQuota(tier, isFirstMonth);
  const exec = client ?? pool;

  await exec.query(
    `INSERT INTO quota_snapshots (user_id, period_start, ocr_quota, analysis_quota)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (user_id, period_start) DO NOTHING`,
    [userId, period, q.ocr, q.analysis]
  );
}

/**
 * tier 变化（admin 升档 / 降档）时同步当月 quota 上限。
 *
 * 行为：
 *   - quota 上限直接覆盖为新 tier 的值
 *   - used 计数保留不变（已用就是已用，不退）
 *   - 若 used > 新 quota（降档场景），用户当月剩余 = 0 但不"倒扣"
 *
 * 跟 ensureCurrentPeriodQuota 区别：本函数会 UPDATE 已存在行；前者只 INSERT。
 *
 * 注：跨月度的退档 / 升档时按比例退款是商业策略，跟本函数无关。
 */
export async function recomputeCurrentPeriodQuota(
  userId: string,
  tier: SubscriptionTier,
  client?: PoolClient
): Promise<void> {
  const period = currentPeriodStart();
  const q = tierToQuota(tier, false);   // 不再给 first month bonus（防止月内被反复刷出额度）
  const exec = client ?? pool;

  await exec.query(
    `INSERT INTO quota_snapshots (user_id, period_start, ocr_quota, analysis_quota)
       VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (user_id, period_start) DO UPDATE
       SET ocr_quota      = EXCLUDED.ocr_quota,
           analysis_quota = EXCLUDED.analysis_quota,
           updated_at     = NOW()`,
    [userId, period, q.ocr, q.analysis]
  );
}

// ===========================================================================
// 读 / 扣减
// ===========================================================================

export interface QuotaSnapshot {
  periodStart: string;            // ISO date
  ocr: { quota: number; used: number };
  analysis: { quota: number; used: number };
}

/**
 * 把 pg 返回的 DATE（JS Date 本地午夜）格式化为 YMD，避免 toISOString 在
 * CST 等东半球时区把日期回退一天。
 */
function fmtPeriodDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 读当月配额。若 snapshot 不存在返回 null（理论上不会，因为 verify 时已 ensure）。
 */
export async function readCurrentQuota(userId: string): Promise<QuotaSnapshot | null> {
  const period = currentPeriodStart();
  const { rows } = await pool.query(
    `SELECT period_start, ocr_quota, analysis_quota, ocr_used, analysis_used
       FROM quota_snapshots
      WHERE user_id = $1 AND period_start = $2::date`,
    [userId, period]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    periodStart: fmtPeriodDate(r.period_start),
    ocr:      { quota: r.ocr_quota,      used: r.ocr_used },
    analysis: { quota: r.analysis_quota, used: r.analysis_used }
  };
}

export class QuotaExceededError extends Error {
  constructor(public kind: 'ocr' | 'analysis') {
    super(`${kind}_quota_exceeded`);
  }
}

/**
 * 原子扣减 OCR 配额（+amount）。
 * 用条件 UPDATE：仅在 used + amount <= quota 时增加，否则 0 行返回。
 * 0 行 → 配额不足，抛 QuotaExceededError。
 *
 * 调用顺序建议（避免 LLM 失败仍扣额度）：
 *   1) readCurrentQuota 做软预检（前端体验用）
 *   2) 调 Bailian OCR
 *   3) Bailian 成功后调本函数 + 写 usage_events（同一事务）
 *   4) Bailian 失败：直接抛错，无任何 DB 写入
 *
 * 极端并发下 step 2 可能未通过 step 4 的扣减而消耗 API 余额；Sprint 1 暂不做
 * 串行锁，靠 step 1 软预检 + 后期 Sprint 2 的 rate limit 兜底。
 */
export async function consumeOcrQuota(
  userId: string,
  amount = 1,
  client?: PoolClient
): Promise<{ used: number; quota: number }> {
  const period = currentPeriodStart();
  const exec = client ?? pool;
  const { rows } = await exec.query(
    `UPDATE quota_snapshots
        SET ocr_used = ocr_used + $3, updated_at = NOW()
      WHERE user_id = $1
        AND period_start = $2::date
        AND ocr_used + $3 <= ocr_quota
      RETURNING ocr_used, ocr_quota`,
    [userId, period, amount]
  );
  const r = rows[0];
  if (!r) throw new QuotaExceededError('ocr');
  return { used: r.ocr_used, quota: r.ocr_quota };
}

/**
 * 原子扣减 analysis 配额。与 consumeOcrQuota 对称。
 * 1 次 analyzeAssets/adviseGoal 调用 = 1 个 analysis_used，无论内部跑了 N 个模型。
 */
export async function consumeAnalysisQuota(
  userId: string,
  amount = 1,
  client?: PoolClient
): Promise<{ used: number; quota: number }> {
  const period = currentPeriodStart();
  const exec = client ?? pool;
  const { rows } = await exec.query(
    `UPDATE quota_snapshots
        SET analysis_used = analysis_used + $3, updated_at = NOW()
      WHERE user_id = $1
        AND period_start = $2::date
        AND analysis_used + $3 <= analysis_quota
      RETURNING analysis_used, analysis_quota`,
    [userId, period, amount]
  );
  const r = rows[0];
  if (!r) throw new QuotaExceededError('analysis');
  return { used: r.analysis_used, quota: r.analysis_quota };
}
