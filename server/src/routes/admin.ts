import { Hono } from 'hono';
import { pool } from '../db.js';
import { rangeSchema, rangeToDays, grantTierSchema } from '../schema.js';
import { hashEmail } from '../lib/hash.js';
import { recomputeCurrentPeriodQuota } from '../lib/quota.js';

export const admin = new Hono();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) {
  console.warn('[warn] ADMIN_TOKEN is not set — all /admin requests will be rejected');
}

admin.use('*', async (c, next) => {
  const t = c.req.header('X-Admin-Token') || '';
  if (!ADMIN_TOKEN || t !== ADMIN_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

function parseRange(c: any): number {
  const r = rangeSchema.safeParse(c.req.query('range'));
  return rangeToDays((r.success ? r.data : '30d') as any);
}

admin.get('/overview', async (c) => {
  const days = parseRange(c);
  const [{ rows: ov }, { rows: byPath }, { rows: dwell }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT device_hash) FILTER (WHERE event_name='page_view') AS uv,
         COUNT(*) FILTER (WHERE event_name='page_view') AS pv
       FROM events WHERE ts > NOW() - ($1 || ' days')::interval`,
      [String(days)]
    ),
    pool.query(
      `SELECT path,
              COUNT(*) AS pv,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dwell_ms) AS dwell_p50_ms
       FROM events
       WHERE ts > NOW() - ($1 || ' days')::interval
         AND path IS NOT NULL
         AND event_name IN ('page_view','dwell')
       GROUP BY path
       ORDER BY pv DESC
       LIMIT 20`,
      [String(days)]
    ),
    pool.query(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dwell_ms) AS p50,
              PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dwell_ms) AS p90
       FROM events
       WHERE event_name='dwell' AND ts > NOW() - ($1 || ' days')::interval`,
      [String(days)]
    )
  ]);

  const uv = Number(ov[0]?.uv || 0);
  const pv = Number(ov[0]?.pv || 0);

  return c.json({
    rangeDays: days,
    uv,
    pv,
    pvPerUv: uv ? pv / uv : null,
    dwellP50Ms: Number(dwell[0]?.p50 || 0) || null,
    dwellP90Ms: Number(dwell[0]?.p90 || 0) || null,
    byPath: byPath.map(r => ({
      path: r.path,
      pv: Number(r.pv),
      dwellP50Ms: r.dwell_p50_ms ? Number(r.dwell_p50_ms) : null
    }))
  });
});

admin.get('/funnel', async (c) => {
  const days = parseRange(c);
  const { rows } = await pool.query(
    `SELECT cta,
            COUNT(*) AS clicks,
            COUNT(DISTINCT device_hash) AS uniq_devices
     FROM events
     WHERE event_name='cta_click'
       AND ts > NOW() - ($1 || ' days')::interval
       AND cta IS NOT NULL
     GROUP BY cta
     ORDER BY clicks DESC`,
    [String(days)]
  );
  return c.json({
    rangeDays: days,
    cta: rows.map(r => ({
      cta: r.cta,
      clicks: Number(r.clicks),
      uniqDevices: Number(r.uniq_devices)
    }))
  });
});

/**
 * N 日留存：按首访日分桶。
 *   - newUsers = 当天首访设备数
 *   - dN%      = 首访 N 天后该设备是否还有任意事件
 * 注意：用 device_first_seen 物化视图加速；查询前刷新一次。
 */
admin.get('/retention', async (c) => {
  const days = parseRange(c);

  // 物化视图可能有几分钟延迟，强制刷新一次
  try {
    await pool.query('REFRESH MATERIALIZED VIEW device_first_seen');
  } catch (e) {
    // 视图不存在 / 权限不足时降级，直接走原表
  }

  const { rows } = await pool.query(
    `WITH cohorts AS (
       SELECT first_date AS cohort_date, COUNT(*) AS new_users
       FROM device_first_seen
       WHERE first_date > (CURRENT_DATE - $1::int)
       GROUP BY first_date
     ),
     activity AS (
       SELECT f.first_date AS cohort_date,
              (e.ts::date - f.first_date) AS day_offset,
              COUNT(DISTINCT e.device_hash) AS active
       FROM device_first_seen f
       JOIN events e USING (device_hash)
       WHERE f.first_date > (CURRENT_DATE - $1::int)
         AND e.ts::date >= f.first_date
         AND e.ts::date <= f.first_date + 30
       GROUP BY f.first_date, day_offset
     )
     SELECT c.cohort_date AS date,
            c.new_users,
            COALESCE(SUM(active) FILTER (WHERE day_offset = 1), 0)  AS d1,
            COALESCE(SUM(active) FILTER (WHERE day_offset = 3), 0)  AS d3,
            COALESCE(SUM(active) FILTER (WHERE day_offset = 7), 0)  AS d7,
            COALESCE(SUM(active) FILTER (WHERE day_offset = 14), 0) AS d14,
            COALESCE(SUM(active) FILTER (WHERE day_offset = 30), 0) AS d30
     FROM cohorts c
     LEFT JOIN activity a ON a.cohort_date = c.cohort_date
     GROUP BY c.cohort_date, c.new_users
     ORDER BY c.cohort_date DESC`,
    [days]
  );

  return c.json({
    rangeDays: days,
    cohorts: rows.map(r => {
      const n = Number(r.new_users);
      const pct = (v: any) => n ? (Number(v) / n) * 100 : null;
      return {
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        newUsers: n,
        d1Pct: pct(r.d1),
        d3Pct: pct(r.d3),
        d7Pct: pct(r.d7),
        d14Pct: pct(r.d14),
        d30Pct: pct(r.d30)
      };
    })
  });
});

/**
 * GET /admin/list-users
 *
 * 用户列表，支持 tier 过滤 + 分页。配合 Admin.vue 用户管理面板。
 * Query: ?page=1&pageSize=20&tier=pro(可选)
 *
 * 返回字段刻意不含完整 email_hash，只 8 位前缀（避免管理员日常工作中接触到
 * 任何可能反查出邮箱的足够信息；要升档/退订请通过 grant-tier 用完整邮箱）。
 */
admin.get('/list-users', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') || 20)));
  const tierFilter = c.req.query('tier');
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: any[] = [];
  if (tierFilter && ['free','plus','pro','max','studio'].includes(tierFilter)) {
    params.push(tierFilter);
    where.push(`u.subscription_tier = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const periodStart = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  })();

  const [{ rows: totalRows }, { rows: userRows }] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params),
    pool.query(
      `SELECT u.id,
              LEFT(u.email_hash, 8) AS email_hash_prefix,
              u.subscription_tier,
              u.subscription_status,
              u.current_period_end,
              u.trial_ends_at,
              u.created_at,
              u.updated_at,
              q.ocr_quota, q.ocr_used,
              q.analysis_quota, q.analysis_used
         FROM users u
         LEFT JOIN quota_snapshots q
           ON q.user_id = u.id AND q.period_start = $${params.length + 1}::date
         ${whereSql}
         ORDER BY u.updated_at DESC
         LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
      [...params, periodStart, pageSize, offset]
    )
  ]);

  return c.json({
    page,
    pageSize,
    total: Number(totalRows[0]?.total || 0),
    users: userRows.map(r => ({
      id: r.id,
      emailHashPrefix: r.email_hash_prefix,
      tier: r.subscription_tier,
      status: r.subscription_status,
      currentPeriodEnd: r.current_period_end,
      trialEndsAt: r.trial_ends_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      currentPeriod: r.ocr_quota === null ? null : {
        ocrQuota: r.ocr_quota,
        ocrUsed: r.ocr_used,
        analysisQuota: r.analysis_quota,
        analysisUsed: r.analysis_used
      }
    }))
  });
});

/**
 * POST /admin/grant-tier
 *
 * 商业化过渡期：自动支付通道未上前，作者收到打款 / 转账后用 admin token 调本
 * 接口给指定 email 升档。也用于内部测试、客服退款、试用激活等。
 *
 * 鉴权：复用上方 admin.use('*') 的 X-Admin-Token 中间件。
 *
 * 行为（事务内）：
 *   1. 按 email_hash 查 users
 *   2. 不存在：createIfMissing=true 则插入 free 用户；否则 404
 *   3. UPDATE tier / status / current_period_end / trial_ends_at / updated_at
 *   4. recomputeCurrentPeriodQuota 同步当月配额上限（保留 used）
 *
 * 操作日志打到 server log（Sprint 3 不入 DB，admin_actions 表 Sprint 4 加）
 */
admin.post('/grant-tier', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { return c.json({ error: 'bad_payload' }, 400); }

  const parsed = grantTierSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }
  const p = parsed.data;
  const emailHash = hashEmail(p.email);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, subscription_tier, subscription_status FROM users WHERE email_hash = $1 FOR UPDATE`,
      [emailHash]
    );

    let userId: string;
    let previousTier: string | null = null;
    let previousStatus: string | null = null;

    if (existing[0]) {
      userId = existing[0].id;
      previousTier = existing[0].subscription_tier;
      previousStatus = existing[0].subscription_status;
    } else {
      if (!p.createIfMissing) {
        await client.query('ROLLBACK');
        return c.json({ error: 'user_not_found', email_hash_prefix: emailHash.slice(0, 8) }, 404);
      }
      const { rows: created } = await client.query(
        `INSERT INTO users (email_hash) VALUES ($1) RETURNING id`,
        [emailHash]
      );
      userId = created[0].id;
    }

    // 动态拼 UPDATE：periodEnd / trialEndsAt undefined 表示「保留」；null 表示「清空」
    const sets: string[] = ['subscription_tier = $2', 'subscription_status = $3', 'updated_at = NOW()'];
    const params: any[] = [userId, p.tier, p.status];
    if (p.periodEnd !== undefined) {
      params.push(p.periodEnd);
      sets.push(`current_period_end = $${params.length}`);
    }
    if (p.trialEndsAt !== undefined) {
      params.push(p.trialEndsAt);
      sets.push(`trial_ends_at = $${params.length}`);
    }
    const { rows: updated } = await client.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, subscription_tier, subscription_status, current_period_end, trial_ends_at`,
      params
    );

    await recomputeCurrentPeriodQuota(userId, p.tier, client);

    await client.query('COMMIT');

    console.log('[admin.grant-tier] ok', {
      userId,
      previousTier, previousStatus,
      newTier: p.tier, newStatus: p.status,
      ts: new Date().toISOString()
    });

    const u = updated[0];
    return c.json({
      userId: u.id,
      previousTier,
      previousStatus,
      tier: u.subscription_tier,
      status: u.subscription_status,
      currentPeriodEnd: u.current_period_end,
      trialEndsAt: u.trial_ends_at
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[admin.grant-tier] failed', e);
    return c.json({ error: 'server_error' }, 500);
  } finally {
    client.release();
  }
});
