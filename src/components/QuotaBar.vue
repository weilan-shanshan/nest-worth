<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  used: number;
  quota: number;
}>();

const pct = computed(() => {
  if (props.quota <= 0) return 0;
  return Math.min(100, Math.round((props.used / props.quota) * 100));
});

// 0-79% 绿、80-99% 橙、100% 红
const tone = computed(() => {
  if (pct.value >= 100) return 'bg-neg';
  if (pct.value >= 80) return 'bg-orange';
  return 'bg-brand';
});

const remaining = computed(() => Math.max(0, props.quota - props.used));
</script>

<template>
  <div>
    <div class="flex items-center justify-between text-[11px] mb-1">
      <span class="text-ink-muted">{{ label }}</span>
      <span class="font-600 tabular-nums">
        {{ used }} <span class="text-ink-muted font-400">/</span> {{ quota }}
        <span class="text-ink-muted ml-1">（剩 {{ remaining }}）</span>
      </span>
    </div>
    <div class="h-1.5 bg-line rounded-full overflow-hidden">
      <div :class="['h-full', 'rounded-full', 'transition-all', tone]" :style="{ width: pct + '%' }" />
    </div>
  </div>
</template>
