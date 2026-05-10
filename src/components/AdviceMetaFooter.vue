<script setup lang="ts">
import { computed } from 'vue';
import type { AdviceMeta } from '../lib/advisor';
import { ANALYST_CHAIN, MODEL_CHAIN } from '../lib/recognize';

const props = defineProps<{ meta: AdviceMeta }>();

function labelOf(name: string): string {
  const all = [...ANALYST_CHAIN, ...MODEL_CHAIN];
  return all.find(m => m.name === name)?.label || name;
}

const modelLabel = computed(() => labelOf(props.meta.modelUsed));

const ensembleLabels = computed(() =>
  (props.meta.ensembleModels || []).map(labelOf)
);

const cachedTime = computed(() => {
  const d = new Date(props.meta.cachedAt);
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
});

const marketTime = computed(() => {
  if (!props.meta.marketSnapshot) return null;
  const d = new Date(props.meta.marketSnapshot.fetchedAt);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
});

const liveData = computed(() => {
  const m = props.meta.marketSnapshot;
  if (!m) return [];
  const arr: string[] = [];
  if (m.fxRates && m.fxRates.CNY) arr.push(`USD/CNY ${m.fxRates.CNY.toFixed(3)}`);
  if (m.fxRates && m.fxRates.HKD) arr.push(`USD/HKD ${m.fxRates.HKD.toFixed(3)}`);
  for (const x of m.metals.slice(0, 1)) {
    arr.push(`${x.symbol} $${x.price.toFixed(0)}/oz`);
  }
  return arr;
});
</script>

<template>
  <div class="mt-3 pt-2 border-t border-border/60 flex flex-col gap-1 text-[10px] text-ink-muted leading-relaxed">
    <div v-if="liveData.length" class="flex items-center gap-1 flex-wrap">
      <span class="i-ph-broadcast-duotone text-brand text-sm" />
      <span class="font-600">实时锚点</span>
      <span class="text-pos">·</span>
      <span class="font-mono">{{ liveData.join(' · ') }}</span>
      <span v-if="marketTime" class="ml-auto opacity-70">{{ marketTime }}</span>
    </div>
    <div v-if="meta.marketSnapshot?.sources?.length" class="opacity-70">
      数据源：{{ meta.marketSnapshot.sources.join(' / ') }}
    </div>
    <div v-if="ensembleLabels.length > 1" class="flex items-start gap-1.5">
      <span class="i-ph-shuffle-duotone text-orange text-sm shrink-0" />
      <div class="flex-1">
        <span class="font-600 text-orange">{{ ensembleLabels.length }} 模型交叉验证</span>
        <span class="opacity-70"> · {{ ensembleLabels.join(' + ') }}</span>
        <br/><span class="opacity-70">综合者：<span class="font-600 text-ink">{{ modelLabel }}</span></span>
      </div>
    </div>
    <div v-else class="flex items-center gap-1.5 opacity-70">
      <span class="i-ph-cpu-duotone" />
      <span>由 <span class="font-600 text-ink">{{ modelLabel }}</span> 生成 · {{ cachedTime }} · 24h 缓存</span>
    </div>
    <div v-if="ensembleLabels.length > 1" class="opacity-70 mt-0.5">
      <span class="i-ph-clock-duotone inline-block align-middle mr-1" />{{ cachedTime }} · 24h 缓存
    </div>
  </div>
</template>
