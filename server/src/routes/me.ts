import { Hono } from 'hono';
import { pool } from '../db.js';
import { requireAuth } from '../lib/auth-mw.js';

export const me = new Hono();

me.use('*', requireAuth);

/**
 * GET /me
 * 返回当前用户的订阅状态。
 * 不返回任何邮箱/资产相关字段。
 */
me.get('/', async (c) => {
  const session = c.get('session');

  const { rows } = await pool.query(
    `SELECT subscription_tier, subscription_status,
            current_period_end, trial_ends_at, created_at
       FROM users WHERE id = $1`,
    [session.userId]
  );
  const u = rows[0];
  if (!u) return c.json({ error: 'user_not_found' }, 404);

  return c.json({
    tier: u.subscription_tier,
    status: u.subscription_status,
    currentPeriodEnd: u.current_period_end,
    trialEndsAt: u.trial_ends_at,
    createdAt: u.created_at
  });
});
