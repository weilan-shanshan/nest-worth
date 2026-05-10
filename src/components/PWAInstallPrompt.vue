<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';

const DISMISS_KEY = 'nestworth.pwa.dismissed';

const deferredPrompt = ref<any>(null);
const showPrompt = ref(false);
const isIOS = ref(false);
const isStandalone = ref(false);
const showIOSGuide = ref(false);

onMounted(() => {
  // 已经"添加到主屏"运行
  isStandalone.value =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  if (isStandalone.value) return;

  // 用户已主动关闭
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (dismissed) {
    const days = (Date.now() - Number(dismissed)) / 86400000;
    if (days < 14) return;   // 14 天内不再打扰
  }

  isIOS.value =
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  // Android Chrome / Edge：监听 beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt.value = e;
    showPrompt.value = true;
  });

  // iOS Safari：3 秒后展示手动添加引导
  if (isIOS.value) {
    setTimeout(() => {
      showPrompt.value = true;
    }, 3000);
  }
});

async function install() {
  if (deferredPrompt.value) {
    deferredPrompt.value.prompt();
    const choice = await deferredPrompt.value.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    deferredPrompt.value = null;
    showPrompt.value = false;
  } else if (isIOS.value) {
    showIOSGuide.value = true;
  }
}

function dismiss() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
  showPrompt.value = false;
  showIOSGuide.value = false;
}

const platformLabel = computed(() => isIOS.value ? 'iOS Safari' : '浏览器');
</script>

<template>
  <Teleport to="body">
    <!-- 主提示 banner（底部浮起） -->
    <Transition name="slide-up">
      <div v-if="showPrompt && !showIOSGuide"
           class="fixed bottom-22 left-3 right-3 z-50 sm:max-w-[400px] sm:left-1/2 sm:-translate-x-1/2"
           role="dialog"
           aria-label="安装到主屏幕">
        <div class="rounded-card bg-card border border-border p-3.5 shadow-[0_12px_32px_rgba(46,158,96,0.20)] flex items-center gap-3">
          <div class="w-10 h-10 rounded-icon bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <span class="i-ph-device-mobile-camera-duotone text-xl" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-700 text-[13px] leading-tight">把 Nestworth 装到主屏</div>
            <div class="text-[10px] text-ink-muted leading-relaxed mt-0.5">
              跟原生 App 一样用 · 离线可读 · 全屏体验
            </div>
          </div>
          <button class="tap px-3 h-8 rounded-icon bg-brand text-white font-700 text-[11px] shrink-0"
                  @click="install">
            添加
          </button>
          <button class="tap w-7 h-7 rounded-full text-ink-muted shrink-0 i-ph-x-bold"
                  aria-label="关闭"
                  @click="dismiss" />
        </div>
      </div>
    </Transition>

    <!-- iOS 手动引导（点添加后展开） -->
    <Transition name="fade">
      <div v-if="showIOSGuide"
           class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
           @click.self="dismiss">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-ph-device-mobile-camera-duotone text-brand text-xl" />
              <h3 class="font-700 text-base flex-1">在 {{ platformLabel }} 安装</h3>
              <button class="tap text-ink-muted i-ph-x-bold text-lg" @click="dismiss" />
            </div>
            <div class="flex flex-col gap-3">
              <div class="bg-bg/60 rounded-icon p-3 text-[13px] leading-relaxed">
                <div class="flex gap-2 mb-2">
                  <span class="text-brand font-700 shrink-0">①</span>
                  <span>点击 Safari 底部 <b>分享按钮</b>
                    <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-brand/15 text-brand mx-1">
                      <span class="i-ph-share-network-duotone" />
                    </span>
                  </span>
                </div>
                <div class="flex gap-2 mb-2">
                  <span class="text-brand font-700 shrink-0">②</span>
                  <span>滚动找到 <b>「添加到主屏幕」</b></span>
                </div>
                <div class="flex gap-2">
                  <span class="text-brand font-700 shrink-0">③</span>
                  <span>点 <b>「添加」</b> 完成 — 主屏会出现 Nestworth 图标</span>
                </div>
              </div>
              <p class="text-[11px] text-ink-muted leading-relaxed">
                ✨ 安装后跟原生 App 体验一样：全屏无浏览器栏、可离线打开、底部通知图标徽章…
              </p>
              <button class="tap h-11 rounded-icon bg-brand text-white font-700 text-sm" @click="dismiss">
                知道了
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
