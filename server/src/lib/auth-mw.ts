import type { Context, Next } from 'hono';
import { verifySession, type VerifiedSession } from './jwt.js';

/**
 * 从 Authorization: Bearer <jwt> 解出会话，挂到 c.var.session。
 * 失败统一返 401，不区分"无 token / token 无效 / 过期"，避免泄露信息。
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const auth = c.req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: 'unauthorized' }, 401);

  const session = await verifySession(m[1]);
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  c.set('session', session);
  await next();
}

export type { VerifiedSession };

declare module 'hono' {
  interface ContextVariableMap {
    session: VerifiedSession;
  }
}
