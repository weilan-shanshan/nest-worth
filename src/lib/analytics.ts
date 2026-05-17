/**
 * 网站访问统计 SDK（zero-dep）。
 *
 * 设计原则：
 *  - 绝不上传业务数据（金额 / ticker / API key / 资产名 / 平台名）
 *  - device_hash 仅是 localStorage 里的随机 UUID，90 天滚动；用户清缓存即重置
 *  - session_id 30 分钟无操作滑窗
 *  - 上报走 sendBeacon（fire-and-forget），不阻塞主线程
 *  - 用户可在「设置」一键关闭
 *  - 字段白名单：超出的字段会被前端拒绝，后端也会拒收
 *
 * 完整字段：
 *  event   : 'page_view' | 'cta_click' | 'dwell'
 *  path?   : 当前路由 path（去 query / hash）
 *  ref_host?: document.referrer 的 hostname
 *  cta?    : 受控枚举（CTA_IDS）
 *  dwell_ms?: number（仅 dwell 事件）
 *  ts      : Date.now()
 *  device  : localStorage UUID（90 天）
 *  session : 30min 滑窗 UUID
 *  lang    : navigator.language.slice(0,2)
 *  sw      : `${screen.width}x${screen.height}`
 *  app_ver : import.meta.env.VITE_APP_VERSION || 'dev'
 */

/** CTA 枚举：新增请在此处登记，未登记的会被丢弃 */
export const CTA_IDS = [
  'import_screenshot',   // 点开/确认截图识别
  'setup_key_start',     // 进入 setup-key 流程
  'setup_key_done',      // 配置 key 完成
  'open_advisor',        // 查看 AI 建议（走势页）
  'open_goal_plan',      // 查看目标增值方案
  'add_asset_manual',    // 手动添加资产
  'add_goal',            // 新增目标
  'refresh_quotes',      // 行情刷新
  'recompute_derived'    // 派生重算
] as const;
export type CtaId = typeof CTA_IDS[number];

const ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;
const APP_VER = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';
const DEVICE_KEY = 'nw_device_id';
const DEVICE_TS_KEY = 'nw_device_ts';
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_KEY = 'nw_session_id';
const SESSION_TS_KEY = 'nw_session_ts';
const SESSION_IDLE_MS = 30 * 60 * 1000;

let enabled = true;

/** 由 store 在启动时调用，把用户设置同步过来 */
export function setEnabled(v: boolean) {
  enabled = v;
}

export function isEnabled(): boolean {
  return enabled && !!ENDPOINT;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  // Fallback：足够随机即可
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getDeviceId(): string {
  try {
    const ts = Number(localStorage.getItem(DEVICE_TS_KEY) || 0);
    const id = localStorage.getItem(DEVICE_KEY);
    if (id && ts && Date.now() - ts < DEVICE_TTL_MS) return id;
    const next = uuid();
    localStorage.setItem(DEVICE_KEY, next);
    localStorage.setItem(DEVICE_TS_KEY, String(Date.now()));
    return next;
  } catch {
    return 'no-storage';
  }
}

function getSessionId(): string {
  try {
    const last = Number(sessionStorage.getItem(SESSION_TS_KEY) || 0);
    const id = sessionStorage.getItem(SESSION_KEY);
    const now = Date.now();
    if (id && last && now - last < SESSION_IDLE_MS) {
      sessionStorage.setItem(SESSION_TS_KEY, String(now));
      return id;
    }
    const next = uuid();
    sessionStorage.setItem(SESSION_KEY, next);
    sessionStorage.setItem(SESSION_TS_KEY, String(now));
    return next;
  } catch {
    return 'no-storage';
  }
}

interface BasePayload {
  event: 'page_view' | 'cta_click' | 'dwell';
  ts: number;
  device: string;
  session: string;
  lang: string;
  sw: string;
  app_ver: string;
  path?: string;
  ref_host?: string;
  cta?: CtaId;
  dwell_ms?: number;
}

function basePayload(): Omit<BasePayload, 'event'> {
  return {
    ts: Date.now(),
    device: getDeviceId(),
    session: getSessionId(),
    lang: (navigator.language || 'unknown').slice(0, 5),
    sw: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    app_ver: APP_VER
  };
}

function send(payload: BasePayload) {
  if (!isEnabled()) return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${ENDPOINT}/track`, blob);
    } else {
      // 极旧浏览器兜底：fetch keepalive
      fetch(`${ENDPOINT}/track`, {
        method: 'POST',
        body: blob,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => { /* 静默失败 */ });
    }
  } catch {
    // 任何异常都不应阻塞用户操作
  }
}

function safePath(p: string): string {
  try {
    return p.split('?')[0].split('#')[0].slice(0, 80);
  } catch {
    return '/';
  }
}

function safeRefHost(): string | undefined {
  try {
    const r = document.referrer;
    if (!r) return undefined;
    const u = new URL(r);
    if (u.hostname === location.hostname) return undefined;   // 同站不算
    return u.hostname.slice(0, 80);
  } catch {
    return undefined;
  }
}

/** 路由切换时调用：上报上一页的 dwell + 新页的 page_view */
let lastPath: string | null = null;
let lastEnterAt = 0;

export function trackPageView(path: string) {
  const now = Date.now();
  if (lastPath && lastEnterAt) {
    const ms = now - lastEnterAt;
    if (ms > 500 && ms < 30 * 60 * 1000) {
      send({ ...basePayload(), event: 'dwell', path: lastPath, dwell_ms: ms });
    }
  }
  lastPath = safePath(path);
  lastEnterAt = now;
  send({
    ...basePayload(),
    event: 'page_view',
    path: lastPath,
    ref_host: safeRefHost()
  });
}

/** 页面隐藏/离开时收尾 dwell */
export function flushDwell() {
  if (!lastPath || !lastEnterAt) return;
  const ms = Date.now() - lastEnterAt;
  if (ms > 500 && ms < 30 * 60 * 1000) {
    send({ ...basePayload(), event: 'dwell', path: lastPath, dwell_ms: ms });
  }
  lastEnterAt = Date.now(); // 重置起点，避免被回前台又被算一遍
}

/** 关键 CTA 点击；id 必须是 CTA_IDS 枚举之一 */
export function trackCta(id: CtaId, path?: string) {
  if (!CTA_IDS.includes(id)) return;
  send({
    ...basePayload(),
    event: 'cta_click',
    cta: id,
    path: path ? safePath(path) : (lastPath || safePath(location.pathname))
  });
}

/** 监听 visibilitychange + pagehide 自动 flush */
export function installAutoFlush() {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDwell();
  });
  window.addEventListener('pagehide', flushDwell);
}
