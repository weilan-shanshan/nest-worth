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
