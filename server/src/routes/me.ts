import { Hono } from 'hono';
import { pool } from '../db.js';
import { requireAuth } from '../lib/auth-mw.js';
import { upgradeRequestSchema } from '../schema.js';

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

/**
 * POST /me/upgrade-request
 *
 * 用户在 Pricing 页面点付费 CTA → 提交升档意向。
 * 不真升档；只是给作者打 server log（Sprint 3 简化版），作者收到付款后用
 * /admin/grant-tier 真正开通。
 *
 * 后续 Sprint 4：写入 upgrade_requests 表 + 邮件通知作者 + 用户邮件确认。
 */
me.post('/upgrade-request', async (c) => {
  const session = c.get('session');

  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'bad_payload' }, 400); }

  const parsed = upgradeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }
  const p = parsed.data;

  // 拉一下当前 tier 方便作者一目了然
  const { rows } = await pool.query(
    `SELECT subscription_tier, LEFT(email_hash, 8) AS email_hash_prefix
       FROM users WHERE id = $1`,
    [session.userId]
  );
  const u = rows[0];

  // 醒目 log：作者每次扫日志能秒看到
  console.log('\n========================================');
  console.log('🛒 UPGRADE REQUEST');
  console.log('  user_id        :', session.userId);
  console.log('  email_hash#    :', u?.email_hash_prefix ?? '?');
  console.log('  current_tier   :', u?.subscription_tier ?? '?');
  console.log('  target_tier    :', p.targetTier);
  console.log('  billing        :', p.billing);
  console.log('  payment_method :', p.paymentMethod);
  if (p.note) console.log('  note           :', p.note);
  console.log('  ts             :', new Date().toISOString());
  console.log('========================================\n');

  return c.json({ ok: true, message: 'received' });
});
