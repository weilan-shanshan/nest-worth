<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAccountStore } from '../store/account';
import { ApiError } from '../lib/api';

const router = useRouter();
const route = useRoute();
const accountStore = useAccountStore();

type Phase = 'verifying' | 'success' | 'fail';
const phase = ref<Phase>('verifying');
const errorMsg = ref<string>('');

onMounted(async () => {
  const token = (route.query.token as string | undefined)?.trim();
  if (!token) {
    phase.value = 'fail';
    errorMsg.value = '链接缺少 token 参数';
    return;
  }
  try {
    await accountStore.verifyMagicLink(token);
    phase.value = 'success';
    // 1.2s 后自动跳设置
    setTimeout(() => router.replace('/settings'), 1200);
  } catch (e) {
    const err = e as ApiError;
    phase.value = 'fail';
    errorMsg.value = err.code === 'invalid_or_expired'
      ? '登录链接已失效或已被使用，请重新发送'
      : (err.message || '登录失败，请重试');
  }
});
</script>

<template>
  <div class="px-5 pt-16 pb-12 flex flex-col items-center text-center min-h-screen">
    <div v-if="phase === 'verifying'" class="flex flex-col items-center gap-3 mt-12">
      <span class="i-ph-circle-notch-bold text-brand text-3xl animate-spin" />
      <p class="text-[14px] text-ink-muted">正在验证登录链接…</p>
    </div>

    <div v-else-if="phase === 'success'" class="flex flex-col items-center gap-3 mt-12">
      <span class="i-ph-check-circle-duotone text-brand text-5xl" />
      <p class="text-[16px] font-600">登录成功</p>
      <p class="text-[12px] text-ink-muted">正在跳转到设置页…</p>
    </div>

    <div v-else class="flex flex-col items-center gap-3 mt-12 max-w-xs">
      <span class="i-ph-x-circle-duotone text-neg text-5xl" />
      <p class="text-[15px] font-600">登录失败</p>
      <p class="text-[12px] text-ink-muted leading-relaxed">{{ errorMsg }}</p>
      <button
        class="tap mt-4 px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-600"
        @click="router.push('/auth/login')"
      >
        重新发送登录链接
      </button>
    </div>
  </div>
</template>
