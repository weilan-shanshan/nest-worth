<script setup lang="ts">
/**
 * Settings 页和其他位置可以放的「安装到主屏」入口卡。
 * 自适应 4 种场景：
 *  - 已 standalone → 显示已安装标记（不可再装）
 *  - 有 native prompt（Android/桌面 Chromium） → 一键直装按钮
 *  - iOS Safari → 弹「分享 → 添加到主屏」引导
 *  - 不支持 → 提示用 Chrome/Edge 打开
 */
import { ref, computed, onMounted } from 'vue';
import { pwaInstall } from '../lib/pwa-install';

const promptReady = ref(pwaInstall.hasNativePrompt());
const showIOSGuide = ref(false);
const showDesktopHint = ref(false);
const showUnsupported = ref(false);
const showOpenInBrowser = ref(false);
const justInstalled = ref(false);

const inAppLabel = computed(() => {
  switch (pwaInstall.browserKind) {
    case 'wechat': return '微信';
    case 'workWechat': return '企业微信';
    case 'qq': return 'QQ';
    case 'dingtalk': return '钉钉';
    case 'feishu': return '飞书';
    case 'xiaohongshu': return '小红书';
    case 'douyin': return '抖音';
    default: return '当前 App';
  }
});

onMounted(() => {
  pwaInstall.onReady(() => { promptReady.value = true; });
});

const isStandalone = pwaInstall.isStandalone;
const isIOS = pwaInstall.isIOS;
const isDesktopChromium = pwaInstall.isDesktopChromium;

const subtitle = computed(() => {
  if (justInstalled.value) return '已添加到主屏 ✓';
  if (isStandalone) return '正在主屏 App 模式中运行 ✓';
  if (pwaInstall.isInAppBrowser) {
    return `${inAppLabel.value}内浏览器无法安装 PWA · 点这里看怎么办`;
  }
  if (promptReady.value) return '一键添加到主屏，跟原生 App 一样用';
  if (isIOS) return '点这里看 Safari 添加到主屏的步骤';
  if (isDesktopChromium) return '点这里看 Chrome/Edge 安装步骤';
  return '当前浏览器不支持，点这里看推荐浏览器';
});

async function handleClick() {
  const r = await pwaInstall.tryInstall();
  if (r === 'ACCEPTED') {
    justInstalled.value = true;
  } else if (r === 'IOS_SHOW_GUIDE') {
    showIOSGuide.value = true;
  } else if (r === 'OPEN_IN_BROWSER') {
    showOpenInBrowser.value = true;
  } else if (r === 'NO_PROMPT') {
    if (isDesktopChromium) showDesktopHint.value = true;
    else showUnsupported.value = true;
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(location.href);
    return true;
  } catch {
    return false;
  }
}
const urlCopied = ref(false);
async function handleCopy() {
  if (await copyUrl()) {
    urlCopied.value = true;
    setTimeout(() => urlCopied.value = false, 2000);
  }
}
</script>

<template>
  <button
    class="tap rounded-card p-3.5 text-left flex items-center gap-3 w-full transition-all"
    :class="isStandalone || justInstalled
      ? 'bg-pos/10 border border-pos/30'
      : 'bg-gradient-to-br from-blue to-[#3F73CC] text-white shadow-[0_8px_24px_rgba(92,143,224,0.25)]'"
    :disabled="isStandalone"
    @click="handleClick"
  >
    <div class="w-10 h-10 rounded-icon flex items-center justify-center shrink-0"
         :class="isStandalone || justInstalled ? 'bg-pos/15 text-pos' : 'bg-white/20 text-white'">
      <span :class="isStandalone || justInstalled ? 'i-ph-check-circle-duotone' : 'i-ph-device-mobile-camera-duotone'"
            class="text-xl" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="font-700 text-[14px] leading-tight">
        {{ isStandalone || justInstalled ? '已安装到主屏' : '把 Nestworth 装到主屏' }}
      </div>
      <div class="text-[10px] opacity-90 mt-0.5 leading-relaxed"
           :class="isStandalone || justInstalled ? 'text-pos' : ''">
        {{ subtitle }}
      </div>
    </div>
    <span v-if="!isStandalone && !justInstalled"
          class="i-ph-caret-right-bold text-base opacity-80 shrink-0" />
  </button>

  <!-- iOS Safari 引导 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showIOSGuide"
           class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
           @click.self="showIOSGuide = false">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-ph-device-mobile-camera-duotone text-brand text-xl" />
              <h3 class="font-700 text-base flex-1">在 iOS Safari 安装</h3>
              <button class="tap text-ink-muted i-ph-x-bold text-lg" @click="showIOSGuide = false" />
            </div>
            <div class="bg-bg/60 rounded-icon p-3 text-[13px] leading-relaxed flex flex-col gap-2">
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">①</span>
                <span>点 Safari 底部
                  <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-brand/15 text-brand mx-1">
                    <span class="i-ph-share-network-duotone" />
                  </span>
                  <b>分享按钮</b>
                </span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">②</span>
                <span>滚动找到 <b>「添加到主屏幕」</b></span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">③</span>
                <span>点 <b>「添加」</b> 完成</span>
              </div>
            </div>
            <p class="text-[11px] text-ink-muted leading-relaxed mt-3">
              ✨ 装完后跟原生 App 一样：全屏无浏览器栏、可离线打开。
            </p>
            <button class="tap mt-3 w-full h-11 rounded-icon bg-brand text-white font-700 text-sm"
                    @click="showIOSGuide = false">知道了</button>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- 桌面 Chrome 引导 -->
    <Transition name="fade">
      <div v-if="showDesktopHint"
           class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
           @click.self="showDesktopHint = false">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-ph-desktop-duotone text-brand text-xl" />
              <h3 class="font-700 text-base flex-1">在 Chrome / Edge 安装</h3>
              <button class="tap text-ink-muted i-ph-x-bold text-lg" @click="showDesktopHint = false" />
            </div>
            <div class="bg-bg/60 rounded-icon p-3 text-[13px] leading-relaxed flex flex-col gap-2">
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">①</span>
                <span>看地址栏 <b>右侧</b>，找到
                  <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-brand/15 text-brand mx-1">
                    <span class="i-ph-download-simple-duotone" />
                  </span>
                  <b>"安装"</b> 图标
                </span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">②</span>
                <span>点击 → 弹窗确认 <b>「安装」</b></span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">③</span>
                <span>装完后会出现独立窗口，可固定到 Dock / 任务栏</span>
              </div>
            </div>
            <div class="bg-orange/10 rounded-icon p-2.5 text-[11px] text-ink leading-relaxed mt-3">
              <span class="i-ph-info-duotone text-orange align-middle mr-1" />
              如果没看到安装图标，可能是浏览器认为还不够"频繁访问"。多用一会儿、刷新几次再试，或菜单 → "安装 Nestworth"。
            </div>
            <button class="tap mt-3 w-full h-11 rounded-icon bg-brand text-white font-700 text-sm"
                    @click="showDesktopHint = false">知道了</button>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- 微信/QQ/钉钉等 App 内嵌 → 在外部浏览器打开 -->
    <Transition name="fade">
      <div v-if="showOpenInBrowser"
           class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
           @click.self="showOpenInBrowser = false">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-ph-arrow-square-out-duotone text-orange text-xl" />
              <h3 class="font-700 text-base flex-1">{{ inAppLabel }} 里装不了 PWA</h3>
              <button class="tap text-ink-muted i-ph-x-bold text-lg" @click="showOpenInBrowser = false" />
            </div>
            <p class="text-[12px] text-ink leading-relaxed mb-3">
              {{ inAppLabel }}用的是内嵌浏览器，不支持"添加到主屏"。复制链接到外部浏览器打开即可：
            </p>
            <div class="bg-bg/60 rounded-icon p-3 text-[13px] leading-relaxed flex flex-col gap-2">
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">①</span>
                <span>点 <b>右上角 ··· 菜单</b></span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">②</span>
                <span>选 <b>「在浏览器打开」</b>（{{ inAppLabel === '微信' ? '微信' : inAppLabel }}所有版本都有）</span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">③</span>
                <span>系统会用 Safari (iOS) / 默认浏览器 (Android) 打开</span>
              </div>
              <div class="flex gap-2">
                <span class="text-brand font-700 shrink-0">④</span>
                <span>再回这里点「装到主屏」</span>
              </div>
            </div>
            <button class="tap mt-3 w-full h-11 rounded-icon bg-brand text-white font-700 text-sm flex items-center justify-center gap-1.5"
                    @click="handleCopy">
              <span :class="urlCopied ? 'i-ph-check-bold' : 'i-ph-copy-duotone'" class="text-base" />
              {{ urlCopied ? '已复制 ✓' : '一键复制本页链接' }}
            </button>
            <button class="tap mt-2 w-full h-9 rounded-icon text-ink-muted text-[12px] font-600"
                    @click="showOpenInBrowser = false">知道了</button>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- 不支持（桌面 Safari / Firefox / 其他冷门）-->
    <Transition name="fade">
      <div v-if="showUnsupported"
           class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
           @click.self="showUnsupported = false">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-ph-warning-circle-duotone text-orange text-xl" />
              <h3 class="font-700 text-base flex-1">当前浏览器装不了</h3>
              <button class="tap text-ink-muted i-ph-x-bold text-lg" @click="showUnsupported = false" />
            </div>
            <p class="text-[12px] text-ink leading-relaxed mb-3">
              用下面任一国内/海外浏览器打开本页就能装：
            </p>
            <div class="bg-bg/60 rounded-icon p-3 text-[12px] leading-relaxed flex flex-col gap-2">
              <div>📱 <b>iOS</b>：Safari（系统自带，唯一选择）</div>
              <div>📱 <b>Android</b>：Edge / 夸克 / 小米浏览器 / 华为浏览器 / Chrome</div>
              <div>💻 <b>电脑</b>：Edge / Chrome / Brave / 360 极速浏览器（极速模式）</div>
            </div>
            <div class="bg-orange/10 rounded-icon p-2.5 text-[11px] text-ink leading-relaxed mt-3">
              <span class="i-ph-info-duotone text-orange align-middle mr-1" />
              <b class="text-orange">不支持的：</b>桌面 Safari、桌面 Firefox、UC 浏览器旧版、QQ 浏览器手机版、所有 App 内嵌浏览器
            </div>
            <button class="tap mt-3 w-full h-11 rounded-icon bg-brand text-white font-700 text-sm flex items-center justify-center gap-1.5"
                    @click="handleCopy">
              <span :class="urlCopied ? 'i-ph-check-bold' : 'i-ph-copy-duotone'" class="text-base" />
              {{ urlCopied ? '已复制 ✓' : '复制链接到其他浏览器打开' }}
            </button>
            <button class="tap mt-2 w-full h-9 rounded-icon text-ink-muted text-[12px] font-600"
                    @click="showUnsupported = false">知道了</button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
