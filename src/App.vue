<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from './store/assets';
import AppShell from './components/AppShell.vue';
import PWAInstallPrompt from './components/PWAInstallPrompt.vue';

const store = useAppStore();
onMounted(async () => {
  await store.load();
  // 后台静默刷新行情（如果距上次 > 4h）
  store.maybeRefreshQuotes();
});
</script>

<template>
  <AppShell v-if="store.ready">
    <RouterView />
  </AppShell>
  <div v-else class="h-full flex items-center justify-center text-ink-muted text-sm">
    Nestworth 启动中…
  </div>
  <PWAInstallPrompt />
</template>
