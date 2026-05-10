<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store/assets';
import AssetEditor from '../components/AssetEditor.vue';
import ScreenshotImporter from '../components/ScreenshotImporter.vue';
import AssetGroupCard from '../components/AssetGroupCard.vue';
import { formatMoney, formatPct, formatCompact, monthLabel } from '../lib/format';
import { CATEGORIES } from '../lib/asset-meta';
import type { Asset, AssetCategory } from '../types';

const store = useAppStore();
const router = useRouter();

const editorOpen = ref(false);
const editing = ref<Asset | null>(null);
const importerOpen = ref(false);

// 月份柱状图
const monthBars = computed(() => {
  const last = store.snapshots.slice(-7);
  if (last.length === 0) return [];
  const max = Math.max(...last.map(s => s.total));
  const min = Math.min(...last.map(s => s.total));
  const range = max - min || 1;
  return last.map(s => ({
    label: monthLabel(s.date),
    pct: 0.20 + ((s.total - min) / range) * 0.80,
    isCurrent: s === last[last.length - 1]
  }));
});

const monthChange = computed(() => {
  const arr = store.snapshots;
  if (arr.length < 2) return { abs: 0, pct: 0 };
  const cur = arr[arr.length - 1].total;
  const prev = arr[arr.length - 2].total;
  return { abs: cur - prev, pct: prev ? ((cur - prev) / prev) * 100 : 0 };
});

const ytdChange = computed(() => {
  const arr = store.snapshots;
  if (arr.length === 0) return { abs: 0, pct: 0 };
  const yearStart = new Date().getFullYear() + '-01-01';
  const startSnap = arr.find(s => s.date >= yearStart) || arr[0];
  const cur = arr[arr.length - 1].total;
  return { abs: cur - startSnap.total, pct: startSnap.total ? ((cur - startSnap.total) / startSnap.total) * 100 : 0 };
});

// 距离最近目标
const topGoal = computed(() => store.goals[0]);
const goalGap = computed(() => {
  if (!topGoal.value) return null;
  return {
    pct: Math.min(100, (store.totalNetWorth / topGoal.value.target) * 100),
    remaining: topGoal.value.target - store.totalNetWorth
  };
});

// 资产分组聚合（按金额降序）
const assetGroups = computed(() => {
  const map = new Map<AssetCategory, Asset[]>();
  for (const a of store.assets) {
    const list = map.get(a.category) || [];
    list.push(a);
    map.set(a.category, list);
  }
  return CATEGORIES
    .filter(c => map.has(c.key))
    .map(c => ({
      key: c.key,
      items: map.get(c.key)!,
      total: map.get(c.key)!.reduce((s, a) => s + a.balance, 0)
    }))
    .sort((a, b) => b.total - a.total);
});

function openEditor(a: Asset | null = null) {
  editing.value = a;
  editorOpen.value = true;
}

async function onSave(data: any) {
  if (editing.value?.id) await store.updateAsset(editing.value.id, data);
  else await store.addAsset(data);
  editorOpen.value = false;
}

async function onDelete() {
  if (editing.value?.id) {
    await store.deleteAsset(editing.value.id);
    editorOpen.value = false;
  }
}

async function onImport(items: any[]) {
  for (const it of items) await store.addAsset(it);
  importerOpen.value = false;
}

function maskOrShow(text: string) {
  return store.settings.privacyMode ? text.replace(/[\d.,]/g, '•') : text;
}
</script>

<template>
  <div class="px-4 pt-10 flex flex-col gap-3">
    <!-- 未配置 Key CTA banner（强引导） -->
    <button
      v-if="!store.hasApiKey"
      class="tap rounded-card p-3.5 text-left bg-gradient-to-br from-orange to-[#E58A0F] text-white shadow-[0_8px_24px_rgba(245,166,35,0.28)] flex items-center gap-3"
      @click="router.push({ path: '/setup-key', query: { from: '/' } })"
    >
      <div class="w-10 h-10 rounded-icon bg-white/20 flex items-center justify-center shrink-0">
        <span class="i-ph-rocket-launch-duotone text-xl" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-700 text-[14px] leading-tight">还差一步，开启完整 AI 能力</div>
        <div class="text-[10px] opacity-90 mt-0.5 leading-relaxed">
          截图识别 · 持仓分析 · 目标方案 都需要 1 个免费 API Key（5 分钟搞定）
        </div>
      </div>
      <span class="i-ph-caret-right-bold text-base opacity-80 shrink-0" />
    </button>

    <!-- 顶栏 -->
    <header class="flex items-center justify-between">
      <div class="flex items-baseline gap-0.5 font-brand">
        <span class="text-2xl text-ink font-700">Nest</span>
        <span class="text-2xl text-brand font-700">worth</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="tap w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-ink-muted"
                @click="store.setPrivacy(!store.settings.privacyMode)">
          <span :class="store.settings.privacyMode ? 'i-ph-eye-closed-duotone' : 'i-ph-eye-duotone'" class="text-base" />
        </button>
        <div class="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-brand font-700 text-base">N</div>
      </div>
    </header>

    <!-- 净值 + 月增长图 一体卡 -->
    <section class="rounded-card bg-card border border-border p-4 shadow-[0_8px_24px_rgba(46,158,96,0.06)]">
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-ink-muted font-600">总净值 · 巢值</span>
        <span class="text-[10px] text-ink-muted">{{ store.assets.length }} 项 · {{ assetGroups.length }} 类</span>
      </div>

      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-[13px] text-ink-muted font-brand">¥</span>
        <span class="text-[30px] font-brand font-600 leading-none tracking-tight">
          {{ maskOrShow(formatMoney(store.totalNetWorth, { decimals: 0 })) }}
        </span>
      </div>

      <!-- 三个时间维度 KPI -->
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="bg-bg/70 rounded-icon px-2.5 py-2">
          <div class="text-[10px] text-ink-muted font-600">本月</div>
          <div class="font-brand font-600 text-[14px] mt-0.5"
               :class="monthChange.abs >= 0 ? 'text-pos' : 'text-neg'">
            {{ maskOrShow(formatMoney(monthChange.abs, { sign: true, decimals: 0 })) }}
          </div>
          <div class="text-[10px] font-600"
               :class="monthChange.pct >= 0 ? 'text-pos' : 'text-neg'">
            {{ formatPct(monthChange.pct, 1) }}
          </div>
        </div>
        <div class="bg-bg/70 rounded-icon px-2.5 py-2">
          <div class="text-[10px] text-ink-muted font-600">年内 YTD</div>
          <div class="font-brand font-600 text-[14px] mt-0.5"
               :class="ytdChange.abs >= 0 ? 'text-pos' : 'text-neg'">
            {{ maskOrShow(formatMoney(ytdChange.abs, { sign: true, decimals: 0 })) }}
          </div>
          <div class="text-[10px] font-600"
               :class="ytdChange.pct >= 0 ? 'text-pos' : 'text-neg'">
            {{ formatPct(ytdChange.pct, 1) }}
          </div>
        </div>
        <button class="tap bg-bg/70 rounded-icon px-2.5 py-2 text-left" @click="router.push('/goals')">
          <div class="text-[10px] text-ink-muted font-600">距目标</div>
          <template v-if="goalGap">
            <div class="font-brand font-600 text-[14px] mt-0.5 text-orange">
              {{ goalGap.pct.toFixed(0) }}%
            </div>
            <div class="text-[10px] font-600 text-ink-muted truncate">
              差 {{ formatCompact(goalGap.remaining) }}
            </div>
          </template>
          <template v-else>
            <div class="font-brand font-600 text-[14px] mt-0.5 text-ink-muted">—</div>
            <div class="text-[10px] text-ink-muted">设目标</div>
          </template>
        </button>
      </div>

      <!-- 月份迷你柱状图 -->
      <div class="mt-3 flex items-end justify-between gap-2 h-16">
        <div v-for="(b, i) in monthBars" :key="i" class="flex-1 h-full flex flex-col items-center justify-end gap-1">
          <div class="w-full rounded-t-sm transition-all"
               :style="{ height: (b.pct * 52) + 'px' }"
               :class="b.isCurrent ? 'bg-brand' : 'bg-brand/25'" />
          <span class="text-[9px] font-600 leading-none"
                :class="b.isCurrent ? 'text-brand' : 'text-ink-muted'">{{ b.label }}</span>
        </div>
      </div>
    </section>

    <!-- 资产分组聚合 -->
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between px-1">
        <h3 class="font-700 text-[14px]">资产分布</h3>
        <button class="text-[11px] text-brand font-600 tap" @click="router.push('/assets')">全部明细 →</button>
      </div>

      <AssetGroupCard
        v-for="g in assetGroups" :key="g.key"
        :category="g.key" :items="g.items" :total="g.total"
        :net-worth="store.totalNetWorth"
        :privacy-mode="store.settings.privacyMode"
        @click="openEditor"
      />

      <div v-if="assetGroups.length === 0" class="text-center text-ink-muted text-sm py-8">
        还没有资产，点下方"手动添加"开始记录吧
      </div>
    </section>

    <!-- 添加入口（移到最下方） -->
    <section class="grid grid-cols-2 gap-2.5 mt-1">
      <button class="tap card-base flex items-center gap-2.5 !p-3" @click="importerOpen = true">
        <div class="w-9 h-9 rounded-icon bg-brand/15 text-brand flex items-center justify-center">
          <span class="i-ph-camera-duotone text-lg" />
        </div>
        <div class="text-left">
          <div class="font-700 text-[13px]">截图识别</div>
          <div class="text-[10px] text-ink-muted">AI 自动入账</div>
        </div>
      </button>
      <button class="tap card-base flex items-center gap-2.5 !p-3" @click="openEditor(null)">
        <div class="w-9 h-9 rounded-icon bg-orange/15 text-orange flex items-center justify-center">
          <span class="i-ph-plus-bold text-lg" />
        </div>
        <div class="text-left">
          <div class="font-700 text-[13px]">手动添加</div>
          <div class="text-[10px] text-ink-muted">新增资产项</div>
        </div>
      </button>
    </section>
  </div>

  <AssetEditor :open="editorOpen" :initial="editing" @close="editorOpen = false" @save="onSave" @delete="onDelete" />
  <ScreenshotImporter :open="importerOpen" @close="importerOpen = false" @import="onImport" />
</template>
