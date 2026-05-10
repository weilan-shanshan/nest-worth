<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: 'home',     label: '总览', icon: 'i-ph-squares-four-duotone' },
  { name: 'assets',   label: '资产', icon: 'i-ph-coins-duotone' },
  { name: 'trend',    label: '走势', icon: 'i-ph-chart-line-up-duotone' },
  { name: 'goals',    label: '目标', icon: 'i-ph-target-duotone' },
  { name: 'settings', label: '设置', icon: 'i-ph-gear-six-duotone' }
];

const active = computed(() => route.name);
</script>

<template>
  <div class="w-full flex items-center justify-center bg-[#DDEDDE] sm:py-6"
       :style="{ height: '100dvh' }">
    <div class="relative w-full h-full sm:max-w-[420px] sm:h-[860px] sm:rounded-app sm:shadow-2xl bg-bg overflow-hidden flex flex-col">
      <!-- 内容滚动区 -->
      <main class="flex-1 overflow-y-auto scroll-hide pb-28">
        <slot />
      </main>

      <!-- 底部导航 -->
      <nav class="absolute bottom-3 left-3 right-3 h-16 bg-white/95 backdrop-blur rounded-nav shadow-[0_8px_24px_rgba(46,158,96,0.12)] border border-border flex items-center justify-around px-2">
        <button
          v-for="t in tabs"
          :key="t.name"
          class="tap relative h-12 flex-1 flex flex-col items-center justify-center gap-0.5 rounded-navActive transition-all"
          :class="active === t.name ? 'bg-brand text-white' : 'text-ink-muted'"
          @click="router.push({ name: t.name })"
        >
          <span :class="[t.icon, 'text-[20px]']" />
          <span class="text-[10px] font-600 tracking-wide">{{ t.label }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>
