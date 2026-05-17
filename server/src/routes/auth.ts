import { Hono } from 'hono';
import { pool } from '../db.js';
import { requestLinkSchema, verifyLinkSchema } from '../schema.js';
import { hashEmail, hashToken, generateMagicToken } from '../lib/hash.js';
import { signSession } from '../lib/jwt.js';

export const auth = new Hono();

const MAGIC_TTL_MIN = 15;
const MAGIC_BASE = process.env.MAGIC_LINK_BASE_URL || 'http://localhost:5173/auth/verify';

/**
 * POST /auth/request-link
 * Body: { email }
 * 行为：永远返 204（不暴露邮箱是否注册过）；后台 log 真实链接。
 * Sprint 0: 邮件先打 console.log；Sprint 1 接 SMTP。
 */
auth.post('/request-link', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.body(null, 204); }

  const parsed = requestLinkSchema.safeParse(raw);
  if (!parsed.success) return c.body(null, 204);

  const email = parsed.data.email;
  const emailHash = hashEmail(email);
  const rawToken = generateMagicToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MIN * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO magic_link_tokens (token_hash, email_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [tokenHash, emailHash, expiresAt]
    );
  } catch (err) {
    console.error('[auth.request-link] insert failed', err);
    return c.body(null, 204);
  }

  const link = `${MAGIC_BASE}?token=${rawToken}`;
  // Sprint 0：邮件 stub。生产请勿打印 link 到日志（会包含原 token）。
  console.log(`[auth.request-link] DEV stub email to ${email}`);
  console.log(`[auth.request-link] DEV magic link: ${link}`);

  return c.body(null, 204);
});

/**
 * POST /auth/verify
 * Body: { token }
 * 行为：
 *   - token 哈希后查 magic_link_tokens；未过期 & 未使用 → 通过
 *   - users 按 email_hash upsert（首次登录自动建账号）
 *   - 标记 token used；签发 JWT 返回
 */
auth.post('/verify', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'bad_payload' }, 400); }

  const parsed = verifyLinkSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'bad_payload' }, 400);

  const tokenHash = hashToken(parsed.data.token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tokRows } = await client.query(
      `SELECT email_hash, expires_at, used_at
         FROM magic_link_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash]
    );
    const tok = tokRows[0];
    if (!tok || tok.used_at || new Date(tok.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return c.json({ error: 'invalid_or_expired' }, 401);
    }

    // upsert user
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email_hash) VALUES ($1)
         ON CONFLICT (email_hash) DO UPDATE SET updated_at = NOW()
       RETURNING id, subscription_tier`,
      [tok.email_hash]
    );
    const u = userRows[0];

    await client.query(
      `UPDATE magic_link_tokens SET used_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );

    await client.query('COMMIT');

    const jwt = await signSession({ sub: u.id, tier: u.subscription_tier });
    return c.json({ token: jwt, tier: u.subscription_tier });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[auth.verify] failed', err);
    return c.json({ error: 'server_error' }, 500);
  } finally {
    client.release();
  }
});
