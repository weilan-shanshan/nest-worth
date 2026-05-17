<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));

const endpoint = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) || '';
const loading = ref(false);
const error = ref<string | null>(null);
const overview = ref<any>(null);
const funnel = ref<any>(null);
const retention = ref<any[]>([]);
const range = ref<'7d' | '30d' | '90d'>('30d');

async function fetchJson(path: string) {
  const res = await fetch(`${endpoint}${path}`, {
    headers: { 'X-Admin-Token': token.value }
  });
  if (res.status === 401) throw new Error('Token 无效（请检查 URL 中的 token 段）');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function load() {
  if (!endpoint) {
    error.value = '未配置 VITE_ANALYTICS_ENDPOINT，无法连接后端。';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const [ov, fn, rt] = await Promise.all([
      fetchJson(`/admin/overview?range=${range.value}`),
      fetchJson(`/admin/funnel?range=${range.value}`),
      fetchJson(`/admin/retention?range=${range.value}`)
    ]);
    overview.value = ov;
    funnel.value = fn;
    retention.value = rt.cohorts || [];
  } catch (e: any) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // 给页面加 noindex 元标记
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
  load();
});

function fmt(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toLocaleString();
}

function fmtMs(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}
</script>

<template>
  <div class="px-5 pt-12 pb-10 flex flex-col gap-4 max-w-4xl mx-auto">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="font-brand font-700 text-2xl">运营后台</h1>
        <p class="text-[11px] text-ink-muted mt-1">只看访问人数 / 按钮点击 / 停留时长 · 不含任何资产信息</p>
      </div>
      <div class="flex gap-1.5">
        <button v-for="r in (['7d','30d','90d'] as const)" :key="r"
                class="tap h-8 px-3 rounded-icon text-[11px] font-700"
                :class="range === r ? 'bg-brand text-white' : 'bg-card text-ink-muted border border-border'"
                @click="range = r; load()">
          {{ r }}
        </button>
      </div>
    </header>

    <div v-if="error" class="card-base bg-neg/10 text-neg text-xs leading-relaxed">{{ error }}</div>
    <div v-if="loading" class="card-base text-ink-muted text-sm flex items-center gap-2">
      <span class="i-ph-spinner-gap-bold animate-spin text-lg" /> 加载中…
    </div>

    <!-- Overview -->
    <section v-if="overview" class="grid grid-cols-2 gap-3">
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">UV（独立设备）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmt(overview.uv) }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">PV（总访问）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmt(overview.pv) }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">人均 PV</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ overview.pvPerUv?.toFixed(1) ?? '-' }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">平均停留（p50）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmtMs(overview.dwellP50Ms) }}</div>
      </div>
    </section>

    <!-- Path breakdown -->
    <section v-if="overview?.byPath?.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">各页面 PV / 停留</h3>
      <div class="flex flex-col gap-1 text-[12px]">
        <div v-for="p in overview.byPath" :key="p.path"
             class="flex items-center justify-between py-1.5 border-t border-border first:border-t-0">
          <span class="font-mono">{{ p.path }}</span>
          <span class="flex gap-3 text-ink-muted">
            <span>PV {{ fmt(p.pv) }}</span>
            <span>停留 p50 {{ fmtMs(p.dwellP50Ms) }}</span>
          </span>
        </div>
      </div>
    </section>

    <!-- Funnel / CTA -->
    <section v-if="funnel?.cta?.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">关键 CTA 点击</h3>
      <div class="flex flex-col gap-1 text-[12px]">
        <div v-for="c in funnel.cta" :key="c.cta"
             class="flex items-center justify-between py-1.5 border-t border-border first:border-t-0">
          <span>{{ c.cta }}</span>
          <span class="text-ink-muted">
            点击 {{ fmt(c.clicks) }} · 设备 {{ fmt(c.uniqDevices) }}
          </span>
        </div>
      </div>
    </section>

    <!-- Retention -->
    <section v-if="retention.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">N 日留存（首访后回访比例）</h3>
      <div class="overflow-x-auto">
        <table class="text-[11px] w-full">
          <thead>
            <tr class="text-ink-muted">
              <th class="text-left py-1.5">首访日</th>
              <th class="text-right">新用户</th>
              <th class="text-right">D1</th>
              <th class="text-right">D3</th>
              <th class="text-right">D7</th>
              <th class="text-right">D14</th>
              <th class="text-right">D30</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in retention" :key="c.date" class="border-t border-border">
              <td class="py-1.5">{{ c.date }}</td>
              <td class="text-right">{{ fmt(c.newUsers) }}</td>
              <td class="text-right">{{ c.d1Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d3Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d7Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d14Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d30Pct?.toFixed(0) ?? '-' }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
