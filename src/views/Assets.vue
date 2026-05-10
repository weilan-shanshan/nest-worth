<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/assets';
import AssetEditor from '../components/AssetEditor.vue';
import ScreenshotImporter from '../components/ScreenshotImporter.vue';
import AssetBatchEditor from '../components/AssetBatchEditor.vue';
import AssetRow from '../components/AssetRow.vue';
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

// 长列表自动按类型分组（filter=all 时启用，避免单分类下重复 chip）
const grouped = computed(() => {
  if (filter.value !== 'all') return null;
  const map = new Map<AssetCategory, Asset[]>();
  for (const a of filtered.value) {
    const list = map.get(a.category) || [];
    list.push(a);
    map.set(a.category, list);
  }
  return CATEGORIES
    .filter(c => map.has(c.key))
    .map(c => ({
      key: c.key,
      label: c.label,
      color: c.color,
      items: map.get(c.key)!,
      total: map.get(c.key)!.reduce((s, x) => s + x.balance, 0)
    }))
    .sort((a, b) => b.total - a.total);
});

// 折叠状态（默认展开），按 group key 存
const collapsed = ref<Record<string, boolean>>({});
function toggleGroup(key: string) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
}

// 大列表（>= 6）默认折叠，给用户一眼看到的能力
function defaultCollapsed(count: number) {
  return count >= 6;
}

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

    <!-- 资产列表 -->
    <!-- 全部视图：按类型自动分组（同类多项可折叠） -->
    <div v-if="grouped" class="flex flex-col gap-3">
      <div v-for="g in grouped" :key="g.key" class="flex flex-col gap-2">
        <button class="tap flex items-center gap-2 px-1 -mx-1"
                @click="toggleGroup(g.key)">
          <span class="px-1.5 h-4.5 inline-flex items-center rounded text-[10px] font-700"
                :style="{ background: g.color + '20', color: g.color }">
            {{ g.label }}
          </span>
          <span class="text-[11px] text-ink-muted">
            {{ g.items.length }} 项 · ¥{{ mask(formatCompact(g.total)) }}
          </span>
          <span class="ml-auto text-ink-muted text-xs i-ph-caret-down-bold transition-transform"
                :class="(collapsed[g.key] ?? defaultCollapsed(g.items.length)) ? '-rotate-90' : ''" />
        </button>
        <Transition name="fade">
          <div v-if="!(collapsed[g.key] ?? defaultCollapsed(g.items.length))"
               class="flex flex-col gap-1.5">
            <AssetRow v-for="a in g.items" :key="a.id"
                      :asset="a"
                      :privacy-mode="store.settings.privacyMode"
                      @click="openEditor(a)" />
          </div>
        </Transition>
      </div>
    </div>

    <!-- 单类型视图：纯列表 -->
    <div v-else class="flex flex-col gap-1.5">
      <AssetRow v-for="a in filtered" :key="a.id"
                :asset="a"
                :privacy-mode="store.settings.privacyMode"
                @click="openEditor(a)" />
    </div>

    <div v-if="filtered.length === 0" class="text-center text-ink-muted text-sm py-12">
      当前筛选下无资产
    </div>
  </div>

  <AssetEditor :open="editorOpen" :initial="editing" @close="editorOpen = false" @save="onSave" @delete="onDelete" />
  <ScreenshotImporter :open="importerOpen" @close="importerOpen = false" @import="onImport" />
  <AssetBatchEditor :open="batchOpen" @close="batchOpen = false" />
</template>
