/**
 * PWA 安装工具：把 beforeinstallprompt 事件 + 平台检测封装成一个全局单例。
 * 多个组件（PWAInstallPrompt、Settings 入口卡）都能复用。
 */

type InstallResult =
  | 'ACCEPTED'              // 系统弹窗里点了"安装"
  | 'DISMISSED'             // 系统弹窗里点了取消
  | 'IOS_SHOW_GUIDE'        // iOS Safari → 弹分享菜单引导
  | 'OPEN_IN_BROWSER'       // 微信/QQ/企业微信内嵌 → 弹"在外部浏览器打开"
  | 'NO_PROMPT';            // 桌面 Chromium 还没触发 / 不支持

export type BrowserKind =
  | 'iosSafari'
  | 'androidChromium'
  | 'desktopChromium'
  | 'desktopSafari'
  | 'desktopFirefox'
  | 'wechat'
  | 'qq'
  | 'workWechat'
  | 'dingtalk'
  | 'feishu'
  | 'xiaohongshu'
  | 'douyin'
  | 'webview'
  | 'unknown';

interface PwaInstallApi {
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktopChromium: boolean;
  isWeChat: boolean;
  isInAppBrowser: boolean;        // 各种 App 内嵌 webview，PWA 都装不了
  browserKind: BrowserKind;
  /** beforeinstallprompt 是否已被捕获 */
  hasNativePrompt: () => boolean;
  /** 注册一个回调，当 beforeinstallprompt 被捕获时触发 */
  onReady: (cb: () => void) => void;
  /** 触发安装 */
  tryInstall: () => Promise<InstallResult>;
}

let deferred: any = null;
const readyCallbacks: Array<() => void> = [];

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const lcUa = ua.toLowerCase();

const isIOS = /iPhone|iPad|iPod/.test(ua) && !(typeof window !== 'undefined' && (window as any).MSStream);
const isAndroid = /Android/.test(ua);
const isMobile = /Mobile/.test(ua) || isIOS || isAndroid;

// 国内/海外 App 内嵌（最常见的"无法安装"场景）
const isWeChat = /MicroMessenger\b/i.test(ua);
const isWorkWechat = /wxwork/i.test(ua);
const isQQEmbed = /\bQQ\/[\d.]+/i.test(ua) && !/MQQBrowser/i.test(ua);   // QQ App 内嵌（不是 QQ 浏览器）
const isDingTalk = /DingTalk/i.test(ua);
const isFeishu = /Lark|Feishu/i.test(ua);
const isXiaohongshu = /xhs/i.test(ua) || /XHS/.test(ua);
const isDouyin = /Aweme/i.test(ua);
const isInAppBrowser =
  isWeChat || isWorkWechat || isQQEmbed || isDingTalk ||
  isFeishu || isXiaohongshu || isDouyin ||
  /; wv\)|FBAN|FBAV|Instagram|Line\//i.test(ua);

// 桌面 Chromium 系（Chrome / Edge / Brave / Opera / 360 极速 / 搜狗高速 / 夸克 / 等）
const isDesktopChromium =
  !isMobile &&
  !isInAppBrowser &&
  /Chrome|Chromium|Edg/.test(ua) &&
  !/Edge\/[0-9]/.test(ua);   // 旧 Edge (EdgeHTML) 不支持

const isDesktopSafari =
  !isMobile &&
  /Safari/.test(ua) &&
  !/Chrome|Chromium|Edg/.test(ua);

const isDesktopFirefox = /Firefox/.test(ua) && !isMobile;

let browserKind: BrowserKind = 'unknown';
if (isWeChat) browserKind = 'wechat';
else if (isWorkWechat) browserKind = 'workWechat';
else if (isQQEmbed) browserKind = 'qq';
else if (isDingTalk) browserKind = 'dingtalk';
else if (isFeishu) browserKind = 'feishu';
else if (isXiaohongshu) browserKind = 'xiaohongshu';
else if (isDouyin) browserKind = 'douyin';
else if (isInAppBrowser) browserKind = 'webview';
else if (isIOS) browserKind = 'iosSafari';
else if (isAndroid && /Chrome|Chromium/.test(ua)) browserKind = 'androidChromium';
else if (isDesktopChromium) browserKind = 'desktopChromium';
else if (isDesktopSafari) browserKind = 'desktopSafari';
else if (isDesktopFirefox) browserKind = 'desktopFirefox';

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
  isWeChat,
  isInAppBrowser,
  browserKind,

  hasNativePrompt: () => !!deferred,

  onReady(cb) {
    if (deferred) cb();
    else readyCallbacks.push(cb);
  },

  async tryInstall() {
    // 1) 各种 App 内嵌 → 必须先在外部浏览器打开
    if (isInAppBrowser) return 'OPEN_IN_BROWSER';

    // 2) 有 native prompt（Android/桌面 Chromium 触发了 beforeinstallprompt）
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      const accepted = choice.outcome === 'accepted';
      deferred = null;
      return accepted ? 'ACCEPTED' : 'DISMISSED';
    }

    // 3) iOS Safari → 弹手动引导
    if (isIOS) return 'IOS_SHOW_GUIDE';

    // 4) 其他（桌面 Chromium 没触发事件 / 桌面 Safari/Firefox / Android 国产）
    return 'NO_PROMPT';
  }
};
