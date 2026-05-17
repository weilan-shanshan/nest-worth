<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAccountStore } from '../store/account';
import { ApiError } from '../lib/api';

const router = useRouter();
const route = useRoute();
const accountStore = useAccountStore();

const email = ref('');
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

// 简单邮箱正则；后端 zod 还会再校验
const isValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));

async function submit() {
  if (!isValid.value || sending.value) return;
  sending.value = true;
  error.value = null;
  try {
    await accountStore.requestMagicLink(email.value.trim());
    sent.value = true;
  } catch (e) {
    const err = e as ApiError;
    // 后端永远返 204，不会到这；唯一可能是网络错
    error.value = err.message || '发送失败，请稍后重试';
  } finally {
    sending.value = false;
  }
}

function back() {
  if (window.history.length > 1) router.back();
  else router.push((route.query.from as string) || '/settings');
}

function changeEmail() {
  sent.value = false;
  error.value = null;
}
</script>

<template>
  <div class="px-5 pt-12 pb-12 flex flex-col gap-5 min-h-screen">
    <button
      class="tap inline-flex items-center gap-1 text-ink-muted text-sm w-fit"
      @click="back"
    >
      <span class="i-ph-caret-left-bold text-base" />
      返回
    </button>

    <header>
      <h1 class="font-brand font-600 text-2xl">登录 Nestworth</h1>
      <p class="text-xs text-ink-muted mt-1">输入邮箱，我们会发一条登录链接给你 · 无需密码</p>
    </header>

    <!-- 未发送：邮箱输入 -->
    <section v-if="!sent" class="card-base">
      <div class="flex items-center gap-2 mb-3">
        <span class="i-ph-envelope-simple-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">邮箱</h3>
      </div>

      <input
        v-model="email"
        type="email"
        autocomplete="email"
        inputmode="email"
        autocapitalize="off"
        spellcheck="false"
        placeholder="you@example.com"
        class="w-full px-3 py-2.5 rounded-lg border border-line bg-card text-[14px] focus:outline-none focus:border-brand transition-colors"
        @keydown.enter="submit"
      />

      <p v-if="error" class="text-[11px] text-neg mt-2">
        <span class="i-ph-warning-circle-duotone align-middle mr-0.5" />
        {{ error }}
      </p>

      <button
        class="tap w-full mt-4 py-2.5 rounded-lg font-600 text-[14px] transition-colors"
        :class="isValid && !sending
          ? 'bg-brand text-white'
          : 'bg-line text-ink-muted cursor-not-allowed'"
        :disabled="!isValid || sending"
        @click="submit"
      >
        {{ sending ? '发送中…' : '发送登录链接' }}
      </button>

      <p class="text-[11px] text-ink-muted mt-3 leading-relaxed">
        账号只用于验证你的订阅状态。<span class="font-600 text-ink">永不存任何资产、金额、API Key 等数据</span>。
      </p>
    </section>

    <!-- 已发送：等待邮件 -->
    <section v-else class="card-base">
      <div class="flex items-center gap-2 mb-3">
        <span class="i-ph-paper-plane-tilt-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">已发送</h3>
      </div>

      <p class="text-[13px] leading-relaxed">
        我们已向 <span class="font-600">{{ email }}</span> 发送了一条登录链接。
      </p>

      <ul class="mt-3 space-y-1.5 text-[12px] text-ink-muted leading-relaxed">
        <li class="flex gap-2">
          <span class="i-ph-arrow-right-bold text-[10px] mt-1 shrink-0" />
          打开邮箱，点击邮件里的登录按钮即可
        </li>
        <li class="flex gap-2">
          <span class="i-ph-arrow-right-bold text-[10px] mt-1 shrink-0" />
          链接 15 分钟内有效，一次性使用
        </li>
        <li class="flex gap-2">
          <span class="i-ph-arrow-right-bold text-[10px] mt-1 shrink-0" />
          没收到？检查垃圾邮件 / 广告邮件文件夹
        </li>
      </ul>

      <button
        class="tap w-full mt-4 py-2.5 rounded-lg border border-line text-[13px] text-ink-muted"
        @click="changeEmail"
      >
        换个邮箱
      </button>
    </section>
  </div>
</template>
