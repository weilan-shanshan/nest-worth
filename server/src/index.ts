// 启动前自动加载同目录 .env（dev / 生产都依赖此行）
import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { track } from './routes/track.js';
import { admin } from './routes/admin.js';

const app = new Hono();

/**
 * CORS：仅允许显式 origin 白名单。
 * 在 env 里用逗号分隔。例：
 *   ALLOWED_ORIGINS=https://nestworth.app,https://nestworth.pages.dev
 */
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '';
    // 本地开发默认放行 localhost
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
    return ALLOWED.includes(origin) ? origin : '';
  },
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Admin-Token']
}));

app.get('/', (c) => c.text('nestworth-analytics ok'));

app.route('/track', track);
app.route('/admin', admin);

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[nestworth-analytics] listening on :${port}`);
});
