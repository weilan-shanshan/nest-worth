<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
const route = useRoute();

const ensembleSize = computed(() => store.settings.ensembleSize || 1);

function goSetup() {
  router.push({ path: '/setup-key', query: { from: route.fullPath } });
}
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

    <!-- 未配 Key：一行轻提示（Home 已有大 banner，此处不重复）-->
    <button v-if="!store.hasApiKey"
            class="tap mt-1 w-full px-3 py-2.5 rounded-icon bg-orange/8 border border-orange/20 flex items-center gap-2 text-left"
            @click="goSetup">
      <span class="i-ph-rocket-launch-duotone text-orange text-base shrink-0" />
      <span class="flex-1 min-w-0 text-[12px] text-ink leading-snug">
        <b class="text-orange">配置 AI Key</b> 后此处会显示 AI 分析
      </span>
      <span class="i-ph-caret-right-bold text-orange text-xs shrink-0" />
    </button>

    <div v-else-if="loading" class="flex flex-col gap-2.5 mt-1">
      <div class="flex items-center gap-2 text-[11px] text-ink-muted">
        <span class="i-ph-sparkle-duotone text-brand text-sm animate-pulse" />
        AI 分析中…（首次 5-15 秒，结果会缓存 24h）
      </div>
      <div class="skeleton h-3.5 w-[85%]" />
      <div class="skeleton h-3.5 w-[70%]" />
      <div class="skeleton h-3.5 w-[92%]" />
      <div class="skeleton h-3.5 w-[60%]" />
      <div class="skeleton h-16 w-full mt-1" />
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
