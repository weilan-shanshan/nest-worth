<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Asset, AssetCategory } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact, formatPct } from '../lib/format';
import AssetIcon from './AssetIcon.vue';

const props = defineProps<{
  category: AssetCategory;
  items: Asset[];
  total: number;
  netWorth: number;
  privacyMode?: boolean;
}>();

const emit = defineEmits<{ (e: 'click', a: Asset): void }>();

const expanded = ref(false);
const meta = computed(() => CATEGORY_MAP[props.category]);
const ratio = computed(() => (props.netWorth ? (props.total / props.netWorth) * 100 : 0));
const dailyChange = computed(() => props.items.reduce((s, a) => s + (a.dailyChange || 0), 0));
const dailyPct = computed(() => (props.total ? (dailyChange.value / props.total) * 100 : 0));

function mask(s: string) {
  return props.privacyMode ? s.replace(/[\d.,]/g, '•') : s;
}
</script>

<template>
  <div class="bg-card border border-border rounded-row overflow-hidden">
    <button class="tap w-full px-3 py-2.5 flex items-center gap-3 text-left" @click="expanded = !expanded">
      <AssetIcon :category="category" :size="36" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-700 text-[14px]">{{ meta.label }}</span>
          <span class="text-[10px] text-ink-muted">{{ items.length }} 项</span>
        </div>
        <div class="mt-1 h-1 bg-bg rounded-full overflow-hidden">
          <div class="h-full rounded-full" :style="{ width: ratio + '%', background: meta.color }" />
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-brand font-600 text-[15px] leading-tight">¥{{ mask(formatCompact(total)) }}</div>
        <div class="text-[10px] mt-0.5"
             :class="dailyChange === 0 ? 'text-ink-muted' : (dailyChange > 0 ? 'text-pos' : 'text-neg')">
          <template v-if="dailyChange !== 0">{{ formatPct(dailyPct, 2) }}</template>
          <template v-else>{{ ratio.toFixed(1) }}%</template>
        </div>
      </div>
      <span class="i-ph-caret-down-bold text-ink-muted text-xs transition-transform shrink-0"
            :class="expanded ? 'rotate-180' : ''" />
    </button>

    <div v-if="expanded" class="border-t border-border bg-bg/40">
      <button v-for="a in items" :key="a.id"
              class="tap w-full px-3 py-2 flex items-center gap-3 text-left border-b border-border last:border-b-0"
              @click.stop="emit('click', a)">
        <div class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: meta.color }" />
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-600 truncate">{{ a.name }}</div>
          <div class="text-[10px] text-ink-muted truncate">{{ a.platform || meta.label }}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-brand text-[13px] font-600">¥{{ mask(formatCompact(a.balance)) }}</div>
          <div v-if="a.dailyChangePct" class="text-[10px] font-600"
               :class="a.dailyChangePct >= 0 ? 'text-pos' : 'text-neg'">
            {{ formatPct(a.dailyChangePct) }}
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
