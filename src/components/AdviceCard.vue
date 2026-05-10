<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store/assets';

const props = defineProps<{
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  title: string;
  icon?: string;
}>();
const emit = defineEmits<{ (e: 'refresh'): void }>();

const iconClass = computed(() => props.icon || 'i-ph-lightbulb-duotone');
const store = useAppStore();
const router = useRouter();

const ensembleSize = computed(() => store.settings.ensembleSize || 1);
</script>

<template>
  <section class="card-base">
    <div class="flex items-center gap-2 mb-2">
      <span :class="iconClass" class="text-brand text-lg" />
      <h3 class="font-700 text-[14px]">{{ title }}</h3>
      <button
        class="ml-auto tap inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-700 transition-colors"
        :class="ensembleSize > 1 ? 'bg-orange/15 text-orange' : 'bg-brand/15 text-brand'"
        @click="router.push('/settings')"
      >
        <span class="i-ph-shuffle-duotone text-xs" />
        <span>{{ ensembleSize === 1 ? '单模型' : ensembleSize + ' 模型交叉' }}</span>
      </button>
      <button class="tap text-ink-muted text-base" @click="emit('refresh')" :disabled="loading">
        <span class="i-ph-arrows-clockwise-bold" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div v-if="loading" class="text-[12px] text-ink-muted py-2 flex items-center gap-2">
      <span class="i-ph-sparkle-duotone text-brand text-base animate-pulse" />
      AI 分析中…（首次约 5-15 秒，结果会缓存 24h）
    </div>

    <div v-else-if="error" class="text-[12px] text-neg bg-neg/10 px-3 py-2 rounded-icon leading-relaxed">
      {{ error }}
    </div>

    <div v-else-if="empty" class="text-[12px] text-ink-muted py-2">
      {{ emptyText || '暂无建议' }}
    </div>

    <slot v-else />
  </section>
</template>
