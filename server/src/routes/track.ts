import { Hono } from 'hono';
import { pool } from '../db.js';
import { eventSchema } from '../schema.js';

export const track = new Hono();

track.post('/', async (c) => {
  // sendBeacon 通常以 application/json 或 text/plain 上报，都尝试解析
  let raw: any;
  try {
    raw = await c.req.json();
  } catch {
    try {
      raw = JSON.parse(await c.req.text());
    } catch {
      return c.text('bad payload', 400);
    }
  }

  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) {
    // 不回吐错误细节，避免暴露 schema；只返 204 让客户端忽略
    return c.body(null, 204);
  }
  const e = parsed.data;

  // 服务器端时间 = 接收时间；客户端 ts 用于排序/时差校验，不直接信任
  const serverTs = new Date();
  const clientTs = new Date(e.ts);
  // 客户端时间和服务器时间差超过 24h 视为异常，按服务器时间存
  const finalTs = Math.abs(serverTs.getTime() - clientTs.getTime()) > 24 * 3600 * 1000
    ? serverTs : clientTs;

  try {
    await pool.query(
      `INSERT INTO events (
        event_name, ts, device_hash, session_id, path, ref_host, cta,
        dwell_ms, lang, screen_wh, app_ver
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        e.event,
        finalTs,
        e.device,
        e.session,
        e.path ?? null,
        e.ref_host ?? null,
        e.cta ?? null,
        e.dwell_ms ?? null,
        e.lang ?? null,
        e.sw ?? null,
        e.app_ver ?? null
      ]
    );
  } catch (err) {
    console.error('[track insert]', err);
    return c.body(null, 204);   // 失败也对客户端"成功"，避免重试风暴
  }
  return c.body(null, 204);
});
