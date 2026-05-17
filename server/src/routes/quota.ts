import { Hono } from 'hono';
import { requireAuth } from '../lib/auth-mw.js';
import { readCurrentQuota } from '../lib/quota.js';

export const quota = new Hono();

quota.use('*', requireAuth);

/**
 * GET /quota
 * 返回当前用户当月配额状态。前端 Settings / 上传截图卡片用。
 */
quota.get('/', async (c) => {
  const session = c.get('session');
  const snap = await readCurrentQuota(session.userId);
  if (!snap) {
    // 理论不会：verify 时已 ensure；防御性返 200 + null
    return c.json({ snapshot: null }, 200);
  }
  return c.json(snap);
});
