import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../lib/auth-mw.js';
import { callOcr, BailianError } from '../lib/bailian-ocr.js';
import { consumeOcrQuota, QuotaExceededError, readCurrentQuota } from '../lib/quota.js';

export const llm = new Hono();

llm.use('*', requireAuth);

const ocrSchema = z.object({
  // data URL，例如 "data:image/png;base64,xxxx"；上限放宽到 ~10MB base64
  image: z.string().min(64).max(15_000_000).regex(/^data:image\/[a-zA-Z+]+;base64,/),
  model: z.string().max(64).optional()
}).strict();

/**
 * POST /llm/ocr
 *
 * 调用顺序：
 *   1. 软预检：配额剩余 < 1 直接 402（不打 Bailian）
 *   2. 调 Bailian OCR（用 server 持有的 BAILIAN_API_KEY）
 *   3. 成功 → 同一事务里写 usage_events + atomic consumeOcrQuota
 *   4. 失败 → 直接抛错，不扣额度
 *
 * 返回 { items, model, quota: {used, quota}, trace }
 */
llm.post('/ocr', async (c) => {
  const session = c.get('session');

  // 1. parse body
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'bad_payload' }, 400); }

  const parsed = ocrSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }

  // 2. 软预检
  const before = await readCurrentQuota(session.userId);
  if (!before) {
    // 理论不会：verify 时已 ensureCurrentPeriodQuota
    return c.json({ error: 'quota_not_initialized' }, 500);
  }
  if (before.ocr.used >= before.ocr.quota) {
    return c.json({
      error: 'ocr_quota_exceeded',
      quota: before.ocr
    }, 402);
  }

  // 3. 调 Bailian
  let result;
  try {
    result = await callOcr(parsed.data.image, parsed.data.model);
  } catch (e) {
    if (e instanceof BailianError) {
      console.error('[llm.ocr] bailian failed', {
        userId: session.userId, status: e.status, isQuota: e.isQuotaError, msg: e.message
      });
      // server 端模型额度耗尽 → 503（与用户配额无关）
      if (e.isQuotaError) {
        return c.json({ error: 'upstream_quota_exhausted' }, 503);
      }
      return c.json({ error: 'upstream_error', detail: e.message }, 502);
    }
    console.error('[llm.ocr] unexpected', e);
    return c.json({ error: 'server_error' }, 500);
  }

  // 4. 同一事务里写 usage_events + 原子扣额度
  const client = await pool.connect();
  let after;
  let traceId: string;
  try {
    await client.query('BEGIN');
    const evt = await client.query(
      `INSERT INTO usage_events (user_id, event_type, model_id, tokens_in, tokens_out, cost_cents)
       VALUES ($1, 'ocr', $2, $3, $4, $5)
       RETURNING gen_random_uuid() AS trace_id`,
      [session.userId, result.model, result.tokensIn, result.tokensOut, result.costCents]
    );
    traceId = evt.rows[0].trace_id;
    after = await consumeOcrQuota(session.userId, 1, client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e instanceof QuotaExceededError) {
      // 极罕见的并发竞争：预检通过但实际扣时已被另一请求扣完
      return c.json({ error: 'ocr_quota_exceeded', quota: before.ocr }, 402);
    }
    console.error('[llm.ocr] db write failed', e);
    return c.json({ error: 'server_error' }, 500);
  } finally {
    client.release();
  }

  return c.json({
    items: result.items,
    model: result.model,
    quota: after,
    trace: traceId
  });
});
