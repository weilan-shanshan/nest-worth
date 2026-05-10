/**
 * PWA 安装工具：把 beforeinstallprompt 事件 + 平台检测封装成一个全局单例。
 * 多个组件（PWAInstallPrompt、Settings 入口卡）都能复用。
 */

type InstallResult =
  | 'ACCEPTED'           // 用户在系统弹窗里点了"安装"
  | 'DISMISSED'          // 用户点了取消
  | 'IOS_SHOW_GUIDE'     // iOS Safari，需要外部展示手动引导
  | 'NO_PROMPT';         // 桌面 Chrome 还没准备好 / 浏览器不支持

interface PwaInstallApi {
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktopChromium: boolean;
  /** beforeinstallprompt 是否已被捕获（true 时可以直接 install） */
  hasNativePrompt: () => boolean;
  /** 注册一个回调，当 beforeinstallprompt 被捕获时触发（可能立即触发） */
  onReady: (cb: () => void) => void;
  /** 触发安装。返回结果用于上层决定是否要弹手动引导 */
  tryInstall: () => Promise<InstallResult>;
}

let deferred: any = null;
const readyCallbacks: Array<() => void> = [];

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPhone|iPad|iPod/.test(ua) && !(typeof window !== 'undefined' && (window as any).MSStream);
const isAndroid = /Android/.test(ua);
// Chromium 桌面：Chrome / Edge / Brave / Opera，但不是 Safari / Firefox
const isDesktopChromium =
  !isIOS &&
  !isAndroid &&
  /Chrome|Chromium|Edg/.test(ua) &&
  !/Mobile/.test(ua);

const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferred = e;
    readyCallbacks.splice(0).forEach(cb => cb());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

export const pwaInstall: PwaInstallApi = {
  isStandalone,
  isIOS,
  isAndroid,
  isDesktopChromium,

  hasNativePrompt: () => !!deferred,

  onReady(cb) {
    if (deferred) cb();
    else readyCallbacks.push(cb);
  },

  async tryInstall() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      const accepted = choice.outcome === 'accepted';
      deferred = null;
      return accepted ? 'ACCEPTED' : 'DISMISSED';
    }
    if (isIOS) return 'IOS_SHOW_GUIDE';
    return 'NO_PROMPT';
  }
};
