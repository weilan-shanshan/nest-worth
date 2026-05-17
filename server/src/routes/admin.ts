import { Hono } from 'hono';
import { pool } from '../db.js';
import { rangeSchema, rangeToDays } from '../schema.js';

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
