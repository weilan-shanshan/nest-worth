<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, MarkLineComponent, MarkPointComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '../store/assets';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact, formatMoney, formatPct } from '../lib/format';
import { analyzeAssets, clearAdviceCache, type AssetAdvice, type AdviceMeta } from '../lib/advisor';
import AdviceCard from '../components/AdviceCard.vue';
import AssetIcon from '../components/AssetIcon.vue';
import AdviceMetaFooter from '../components/AdviceMetaFooter.vue';

echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer]);

const store = useAppStore();
const range = ref<'7' | '30' | '90' | 'all'>('all');

const lineData = computed(() => {
  const all = store.snapshots;
  let arr = all;
  if (range.value !== 'all') {
    arr = all.slice(-Number(range.value));
  }
  return arr;
});

const lineChange = computed(() => {
  const arr = lineData.value;
  if (arr.length < 2) return { abs: 0, pct: 0 };
  const start = arr[0].total;
  const end = arr[arr.length - 1].total;
  return { abs: end - start, pct: start ? ((end - start) / start) * 100 : 0 };
});

const pieData = computed(() => {
  const map = new Map<string, number>();
  for (const a of store.assets) map.set(a.category, (map.get(a.category) || 0) + a.balance);
  return Array.from(map.entries()).map(([k, v]) => ({
    name: CATEGORY_MAP[k as keyof typeof CATEGORY_MAP].label,
    value: v,
    color: CATEGORY_MAP[k as keyof typeof CATEGORY_MAP].color
  })).sort((a, b) => b.value - a.value);
});

const lineRef = ref<HTMLDivElement | null>(null);
const pieRef = ref<HTMLDivElement | null>(null);
let lineChart: echarts.ECharts | null = null;
let pieChart: echarts.ECharts | null = null;

function renderLine() {
  if (!lineRef.value) return;
  if (!lineChart) lineChart = echarts.init(lineRef.value);
  const data = lineData.value;
  lineChart.setOption({
    grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#E0EFE6',
      textStyle: { color: '#1F2D26' },
      formatter: (p: any) => {
        const it = p[0];
        return `<div style="font-size:11px;color:#8BAF96">${it.name}</div>
                <div style="font-weight:700;font-family:Playfair Display">¥ ${Number(it.value).toLocaleString('zh-CN')}</div>`;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date.slice(5)),
      axisLine: { lineStyle: { color: '#E0EFE6' } },
      axisLabel: { color: '#8BAF96', fontSize: 10, interval: Math.max(0, Math.floor(data.length / 6) - 1) },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#F0F6F2' } },
      axisLabel: { color: '#8BAF96', fontSize: 10, formatter: (v: number) => formatCompact(v) }
    },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      showSymbol: false,
      data: data.map(d => d.total),
      lineStyle: { color: '#2E9E60', width: 2.5 },
      itemStyle: { color: '#2E9E60' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(46,158,96,0.35)' },
          { offset: 1, color: 'rgba(46,158,96,0.02)' }
        ])
      }
    }]
  });
}

function renderPie() {
  if (!pieRef.value) return;
  if (!pieChart) pieChart = echarts.init(pieRef.value);
  pieChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#fff',
      borderColor: '#E0EFE6',
      textStyle: { color: '#1F2D26' },
      formatter: (p: any) => `${p.name}<br/><b>¥${Number(p.value).toLocaleString('zh-CN')}</b> (${p.percent}%)`
    },
    series: [{
      type: 'pie',
      radius: ['55%', '80%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      data: pieData.value.map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.color } }))
    }]
  });
}

// AI 持仓分析
const adviceMap = ref<Record<number, AssetAdvice>>({});
const adviceMeta = ref<AdviceMeta | null>(null);
const adviceLoading = ref(false);
const adviceError = ref<string | null>(null);

async function loadAdvice(force = false) {
  if (store.assets.length === 0) return;
  adviceLoading.value = true;
  adviceError.value = null;
  try {
    if (force) await clearAdviceCache('assets-analysis');
    const { items, meta } = await analyzeAssets(store.assets);
    adviceMap.value = Object.fromEntries(items.map(a => [a.assetId, a]));
    adviceMeta.value = meta;
  } catch (e: any) {
    adviceError.value = e.message || '分析失败';
  } finally {
    adviceLoading.value = false;
  }
}

const advisedAssets = computed(() =>
  store.assets
    .map(a => ({ asset: a, advice: adviceMap.value[a.id!] }))
    .filter(x => x.advice)
);

onMounted(() => {
  renderLine();
  renderPie();
  window.addEventListener('resize', onResize);
  loadAdvice();
});

watch([lineData, pieData], () => {
  renderLine();
  renderPie();
});

function onResize() {
  lineChart?.resize();
  pieChart?.resize();
}
</script>

<template>
  <div class="px-5 pt-12 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="font-brand font-600 text-2xl">走势</h1>
    </header>

    <section class="card-base">
      <div class="flex items-center justify-between mb-2">
        <div>
          <div class="text-xs text-ink-muted font-600">区间净值变化</div>
          <div class="font-brand text-2xl font-600 mt-1 whitespace-nowrap">
            ¥ {{ formatCompact(store.totalNetWorth) }}
          </div>
          <div class="text-xs font-600 mt-0.5"
               :class="lineChange.abs >= 0 ? 'text-pos' : 'text-neg'">
            {{ formatMoney(lineChange.abs, { sign: true, decimals: 0 }) }} ({{ formatPct(lineChange.pct) }})
          </div>
        </div>
        <div class="flex gap-1 bg-brand/10 rounded-full p-1 shrink-0 self-start">
          <button v-for="r in [['7','7'], ['30','30'], ['90','90'], ['all','全']] as const" :key="r[0]"
                  class="tap w-7 h-7 text-[11px] rounded-full font-600 transition-all flex items-center justify-center"
                  :class="range === r[0] ? 'bg-brand text-white' : 'text-ink-muted'"
                  @click="range = r[0] as any">{{ r[1] }}</button>
        </div>
      </div>
      <div ref="lineRef" class="w-full h-56" />
    </section>

    <section class="card-base">
      <div class="text-xs text-ink-muted font-600 mb-2">资产构成</div>
      <div class="flex items-center gap-4">
        <div ref="pieRef" class="w-32 h-32 shrink-0" />
        <div class="flex-1 min-w-0 flex flex-col gap-1.5">
          <div v-for="d in pieData.slice(0, 6)" :key="d.name"
               class="flex items-center gap-2 text-xs">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: d.color }" />
            <span class="flex-1 truncate text-ink">{{ d.name }}</span>
            <span class="font-brand font-600 text-ink-muted">
              {{ ((d.value / store.totalNetWorth) * 100).toFixed(1) }}%
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- AI 持仓分析 -->
    <AdviceCard
      title="持仓分析与建议"
      icon="i-ph-sparkle-duotone"
      :loading="adviceLoading"
      :error="adviceError"
      :empty="!adviceLoading && advisedAssets.length === 0"
      empty-text="还没有持仓，先去添加资产吧"
      @refresh="loadAdvice(true)"
    >
      <div class="flex flex-col gap-2.5">
        <div v-for="{ asset, advice } in advisedAssets" :key="asset.id"
             class="flex gap-2.5 p-2.5 rounded-icon bg-bg/60">
          <AssetIcon :category="asset.category" :size="32" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-700 text-[13px] truncate">{{ asset.name }}</span>
              <span class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700"
                    :class="{
                      'bg-pos/15 text-pos': advice.level === 'good',
                      'bg-orange/15 text-orange': advice.level === 'watch',
                      'bg-neg/15 text-neg': advice.level === 'action'
                    }">
                {{ advice.level === 'good' ? '良好' : advice.level === 'watch' ? '观察' : '建议调整' }}
              </span>
            </div>
            <div class="mt-1 text-[11px] text-ink leading-relaxed">
              <span class="i-ph-warning-circle-duotone inline-block align-middle text-ink-muted mr-1" />{{ advice.status }}
            </div>
            <div class="text-[11px] text-brand leading-relaxed font-600">
              <span class="i-ph-arrow-circle-right-duotone inline-block align-middle mr-1" />{{ advice.suggestion }}
            </div>
          </div>
        </div>
      </div>
      <AdviceMetaFooter v-if="adviceMeta" :meta="adviceMeta" />
    </AdviceCard>
  </div>
</template>
