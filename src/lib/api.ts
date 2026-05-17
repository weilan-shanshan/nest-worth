/**
 * 商业化后端 API fetch 封装（Sprint 0+）
 *
 * - 自动带 JWT（从 localStorage 读）
 * - 401 自动清除本地 JWT
 * - 网络/解析失败抛 ApiError，调用方按需 catch
 *
 * 注意：商业化后端 API 与本地 IndexedDB 完全分离——这里不存任何资产数据。
 */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

const TOKEN_KEY = 'nw_session_token';

export function getSessionToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); }
  catch { return null; }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode etc — silent */ }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ApiOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false = 不带 Authorization；默认 true */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  if (!BASE) throw new ApiError(0, 'VITE_API_BASE 未配置');

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  if (opts.auth !== false) {
    const t = getSessionToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal
    });
  } catch (e) {
    throw new ApiError(0, (e as Error).message || 'network_error');
  }

  if (res.status === 401) {
    setSessionToken(null);
    throw new ApiError(401, 'unauthorized');
  }

  if (res.status === 204) return undefined as T;

  let data: any = null;
  try { data = await res.json(); }
  catch { /* 非 JSON 响应留 null */ }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `http_${res.status}`, data?.error);
  }
  return data as T;
}
