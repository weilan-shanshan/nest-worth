import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { requireAuth } from '../lib/auth-mw.js';
import { callOcr, BailianError } from '../lib/bailian-ocr.js';
import { runAnalysis } from '../lib/analyst-orchestrator.js';
import { BailianAnalystError } from '../lib/bailian-analyst.js';
import { consumeOcrQuota, consumeAnalysisQuota, QuotaExceededError, readCurrentQuota } from '../lib/quota.js';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../schema.js';

export const llm = new Hono();

llm.use('*', requireAuth);

const ocrSchema = z.object({
  // data URL，例如 "data:image/png;base64,xxxx"；上限放宽到 ~10MB base64
  image: z.string().min(64).max(15_000_000).regex(/^data:image\/[a-zA-Z+]+;base64,/),
  model: z.string().max(64).optional()
}).strict();

const analysisSchema = z.object({
  prompt: z.string().min(1).max(80_000),
  system: z.string().min(1).max(20_000),
  // 1 / 2 / 3，前端 settings.ensembleSize；超 tier 时 server 静默降级
  ensembleSize: z.number().int().min(1).max(3).default(1)
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

/**
 * POST /llm/analysis
 *
 * 调用顺序与 OCR 对称：
 *   1. 软预检：analysis 剩余 < 1 直接 402
 *   2. 跑 orchestrator（N 路并行 + 可能的 synth）
 *   3. 成功 → 同一事务批量写 N+1 行 usage_events（共用 trace_id）+ 扣 1 个 analysis 配额
 *   4. 失败 → 不扣额度
 *
 * 返回 { content, modelUsed, ensembleModels, actualEnsembleSize, quota, trace }
 */
llm.post('/analysis', async (c) => {
  const session = c.get('session');

  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'bad_payload' }, 400); }

  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }

  // 1. 软预检
  const before = await readCurrentQuota(session.userId);
  if (!before) return c.json({ error: 'quota_not_initialized' }, 500);
  if (before.analysis.used >= before.analysis.quota) {
    return c.json({ error: 'analysis_quota_exceeded', quota: before.analysis }, 402);
  }

  // 2. 跑 orchestrator
  // 不能信 JWT 里的 tier（admin 升档后旧 JWT 仍是老值），实时从 DB 拉
  const { rows: tierRows } = await pool.query(
    `SELECT subscription_tier FROM users WHERE id = $1`,
    [session.userId]
  );
  const dbTier = tierRows[0]?.subscription_tier;
  const tier = (SUBSCRIPTION_TIERS as readonly string[]).includes(dbTier) ? dbTier : 'free';
  let result;
  try {
    result = await runAnalysis({
      prompt: parsed.data.prompt,
      system: parsed.data.system,
      ensembleSize: parsed.data.ensembleSize,
      tier: tier as SubscriptionTier
    });
  } catch (e) {
    if (e instanceof BailianAnalystError) {
      console.error('[llm.analysis] upstream failed', { userId: session.userId, msg: e.message, status: e.status, isQuota: e.isQuotaError });
      if (e.isQuotaError) return c.json({ error: 'upstream_quota_exhausted' }, 503);
      if (e.isTimeout)   return c.json({ error: 'upstream_timeout' }, 504);
      return c.json({ error: 'upstream_error', detail: e.message }, 502);
    }
    console.error('[llm.analysis] unexpected', e);
    return c.json({ error: 'server_error' }, 500);
  }

  // 3. 同一事务写 N+1 行 usage_events（共用 trace_id）+ 扣 1 配额
  const traceId = randomUUID();
  const client = await pool.connect();
  let after;
  try {
    await client.query('BEGIN');
    // 只把 ok 的调用计费（ok=false 的算服务端兜底成本，不记入用户账单）
    for (const log of result.callLogs.filter(l => l.ok)) {
      await client.query(
        `INSERT INTO usage_events (user_id, event_type, model_id, tokens_in, tokens_out, cost_cents, trace_id)
         VALUES ($1, 'analysis', $2, $3, $4, $5, $6)`,
        [session.userId, log.model, log.tokensIn, log.tokensOut, log.costCents, traceId]
      );
    }
    after = await consumeAnalysisQuota(session.userId, 1, client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e instanceof QuotaExceededError) {
      return c.json({ error: 'analysis_quota_exceeded', quota: before.analysis }, 402);
    }
    console.error('[llm.analysis] db write failed', e);
    return c.json({ error: 'server_error' }, 500);
  } finally {
    client.release();
  }

  return c.json({
    content: result.content,
    modelUsed: result.modelUsed,
    ensembleModels: result.ensembleModels,
    requestedEnsembleSize: result.requestedEnsembleSize,
    allowedEnsembleSize: result.allowedEnsembleSize,
    effectiveEnsembleSize: result.effectiveEnsembleSize,
    actualEnsembleSize: result.actualEnsembleSize,
    quota: after,
    trace: traceId
  });
});
