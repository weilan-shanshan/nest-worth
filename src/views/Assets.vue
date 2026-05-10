<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/assets';
import AssetIcon from '../components/AssetIcon.vue';
import AssetEditor from '../components/AssetEditor.vue';
import ScreenshotImporter from '../components/ScreenshotImporter.vue';
import AssetBatchEditor from '../components/AssetBatchEditor.vue';
import { CATEGORIES, CATEGORY_MAP } from '../lib/asset-meta';
import { formatMoney, formatPct, formatCompact } from '../lib/format';
import type { Asset, AssetCategory } from '../types';

const store = useAppStore();
const filter = ref<AssetCategory | 'all'>('all');
const editorOpen = ref(false);
const editing = ref<Asset | null>(null);
const importerOpen = ref(false);
const batchOpen = ref(false);

const visibleCats = computed(() => {
  const used = new Set(store.assets.map(a => a.category));
  return CATEGORIES.filter(c => used.has(c.key));
});

const filtered = computed(() => {
  const arr = filter.value === 'all'
    ? [...store.assets]
    : store.assets.filter(a => a.category === filter.value);
  return arr.sort((a, b) => b.balance - a.balance);
});

const filteredTotal = computed(() => filtered.value.reduce((s, a) => s + a.balance, 0));

function openEditor(a: Asset | null = null) {
  editing.value = a;
  editorOpen.value = true;
}

async function onSave(data: any) {
  if (editing.value?.id) {
    await store.updateAsset(editing.value.id, data);
  } else {
    await store.addAsset(data);
  }
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

function mask(text: string) {
  return store.settings.privacyMode ? text.replace(/[\d.,]/g, '•') : text;
}
</script>

<template>
  <div class="px-5 pt-12 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="font-brand font-600 text-2xl">资产</h1>
      <div class="flex gap-2">
        <button v-if="store.assets.length > 0"
                class="tap h-10 px-3 rounded-full bg-card border border-border flex items-center gap-1.5 text-brand text-[12px] font-700"
                @click="batchOpen = true">
          <span class="i-ph-list-numbers-duotone text-base" />
          批量更新
        </button>
        <button class="tap w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-brand"
                @click="importerOpen = true">
          <span class="i-ph-camera-duotone text-lg" />
        </button>
        <button class="tap w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center"
                @click="openEditor(null)">
          <span class="i-ph-plus-bold text-lg" />
        </button>
      </div>
    </header>

    <!-- 当前筛选合计 -->
    <div class="card-base">
      <div class="text-xs text-ink-muted font-600">
        {{ filter === 'all' ? '全部资产合计' : CATEGORY_MAP[filter as AssetCategory].label + ' 合计' }}
      </div>
      <div class="mt-1 font-brand font-600 text-2xl">
        ¥ {{ mask(formatMoney(filteredTotal)) }}
      </div>
      <div class="text-[11px] text-ink-muted mt-0.5">{{ filtered.length }} 项</div>
    </div>

    <!-- 分类筛选 -->
    <div class="flex gap-2 overflow-x-auto scroll-hide -mx-5 px-5">
      <button
        class="tap shrink-0 h-9 px-4 rounded-full text-xs font-600 transition-all border"
        :class="filter === 'all' ? 'bg-brand text-white border-brand' : 'bg-card text-ink-muted border-border'"
        @click="filter = 'all'"
      >全部 · {{ store.assets.length }}</button>
      <button
        v-for="c in visibleCats" :key="c.key"
        class="tap shrink-0 h-9 px-4 rounded-full text-xs font-600 transition-all border flex items-center gap-1.5"
        :class="filter === c.key ? 'bg-brand text-white border-brand' : 'bg-card text-ink-muted border-border'"
        @click="filter = c.key"
      >
        <span :class="c.icon" class="text-sm" />
        {{ c.label }}
      </button>
    </div>

    <!-- 资产列表（突出名称 + 金额 + 类型 chip） -->
    <div class="flex flex-col gap-2">
      <div v-for="a in filtered" :key="a.id"
           class="card-base tap !p-3.5"
           @click="openEditor(a)">
        <div class="flex items-start gap-3">
          <AssetIcon :category="a.category" :size="44" />
          <div class="flex-1 min-w-0">
            <div class="font-700 text-[15px] truncate leading-tight">{{ a.name }}</div>
            <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center px-1.5 h-4.5 rounded text-[10px] font-600"
                    :style="{ background: CATEGORY_MAP[a.category].color + '22', color: CATEGORY_MAP[a.category].color }">
                {{ CATEGORY_MAP[a.category].label }}
              </span>
              <span v-if="a.platform" class="text-[10px] text-ink-muted truncate">{{ a.platform }}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-brand font-600 text-lg leading-none">
              ¥{{ mask(formatCompact(a.balance)) }}
            </div>
            <div v-if="a.dailyChangePct !== undefined && a.dailyChangePct !== 0"
                 class="mt-1 text-[11px] font-600"
                 :class="a.dailyChangePct >= 0 ? 'text-pos' : 'text-neg'">
              {{ formatPct(a.dailyChangePct) }}
            </div>
            <div v-else-if="a.cost" class="mt-1 text-[10px] text-ink-muted">
              成本 ¥{{ formatCompact(a.cost) }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="text-center text-ink-muted text-sm py-12">
        当前筛选下无资产
      </div>
    </div>
  </div>

  <AssetEditor :open="editorOpen" :initial="editing" @close="editorOpen = false" @save="onSave" @delete="onDelete" />
  <ScreenshotImporter :open="importerOpen" @close="importerOpen = false" @import="onImport" />
  <AssetBatchEditor :open="batchOpen" @close="batchOpen = false" />
</template>
