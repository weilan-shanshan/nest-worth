<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useAppStore } from '../store/assets';
import AssetEditor from '../components/AssetEditor.vue';
import ScreenshotImporter from '../components/ScreenshotImporter.vue';
import AssetBatchEditor from '../components/AssetBatchEditor.vue';
import AssetRow from '../components/AssetRow.vue';
import SupplementInfoModal from '../components/SupplementInfoModal.vue';
import { CATEGORIES, CATEGORY_MAP } from '../lib/asset-meta';
import { formatMoney, formatPct, formatCompact } from '../lib/format';
import type { Asset, AssetCategory } from '../types';
import { trackCta } from '../lib/analytics';

const store = useAppStore();
const filter = ref<AssetCategory | 'all'>('all');
const editorOpen = ref(false);
const editing = ref<Asset | null>(null);
const importerOpen = ref(false);
const batchOpen = ref(false);
const supplementOpen = ref(false);
const supplementing = ref<Asset | null>(null);

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

// 锚点导航：sticky chip 跳到对应分组
const sectionRefs = ref<Record<string, HTMLElement | null>>({});
const activeGroup = ref<string>('');
let observer: IntersectionObserver | null = null;

function setSectionRef(key: string, el: any) {
  sectionRefs.value[key] = el;
}

function scrollToGroup(key: string) {
  activeGroup.value = key;
  const el = sectionRefs.value[key];
  if (!el) return;
  // 给 sticky 锚点条留出空间
  const top = el.getBoundingClientRect().top + (document.querySelector('main')?.scrollTop || 0) - 110;
  document.querySelector('main')?.scrollTo({ top, behavior: 'smooth' });
}

// 滚动监听：高亮当前可见分组
function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      // 找最靠近视口顶部、且在视口内的 section
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) {
        const key = (visible[0].target as HTMLElement).dataset.group;
        if (key) activeGroup.value = key;
      }
    },
    { root: document.querySelector('main'), rootMargin: '-100px 0px -60% 0px' }
  );
  Object.values(sectionRefs.value).forEach(el => el && observer!.observe(el));
}

onMounted(() => {
  // 等 DOM 渲染完
  setTimeout(setupObserver, 100);
});

watch(grouped, () => {
  setTimeout(setupObserver, 100);
});

onBeforeUnmount(() => observer?.disconnect());

function openEditor(a: Asset | null = null) {
  editing.value = a;
  editorOpen.value = true;
}

async function onSave(data: any) {
  let id: number | undefined;
  if (editing.value?.id) {
    await store.updateAsset(editing.value.id, data);
    id = editing.value.id;
  } else {
    const a = await store.addAsset(data);
    id = a.id;
    trackCta('add_asset_manual');
  }
  editorOpen.value = false;
  // 编辑保存后立刻重算单条派生
  if (id) store.recomputeDerived([id]).catch(() => { /* 静默 */ });
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

function openSupplement(a: Asset) {
  supplementing.value = a;
  supplementOpen.value = true;
}

async function onSupplementSave(patch: Partial<Asset>) {
  const id = supplementing.value?.id;
  supplementOpen.value = false;
  if (!id) return;
  await store.updateAsset(id, patch);
  store.recomputeDerived([id]).catch(() => { /* 静默 */ });
}

async function manualRecompute() {
  trackCta('recompute_derived');
  await store.recomputeDerived();
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
                class="tap w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-brand disabled:opacity-50"
                :disabled="store.deriving.running"
                :title="store.deriving.running ? '正在重算派生数据…' : '重新计算收益/天数/年化'"
                @click="manualRecompute">
          <span :class="store.deriving.running ? 'i-ph-spinner-gap-bold animate-spin' : 'i-ph-arrows-clockwise-bold'" class="text-lg" />
        </button>
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
    <!-- 全部视图：按类型分组 + 顶部 sticky 锚点 -->
    <template v-if="grouped">
      <!-- Sticky 锚点导航条：横向滚动，点击跳到对应分组 -->
      <div class="sticky top-0 z-10 -mx-4 px-4 py-2 bg-bg/90 backdrop-blur-sm">
        <div class="flex gap-1.5 overflow-x-auto scroll-hide">
          <button
            v-for="g in grouped" :key="g.key"
            class="tap shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-700 border transition-colors"
            :class="activeGroup === g.key
              ? 'bg-brand text-white border-brand'
              : 'bg-card border-border text-ink-muted hover:text-ink'"
            @click="scrollToGroup(g.key)"
          >
            <span class="w-1.5 h-1.5 rounded-full"
                  :style="{ background: activeGroup === g.key ? '#fff' : g.color }" />
            {{ g.label }}
            <span class="opacity-75 font-mono text-[10px]">¥{{ mask(formatCompact(g.total)) }}</span>
          </button>
        </div>
      </div>

      <!-- 分组列表（始终全展开） -->
      <div class="flex flex-col gap-5">
        <section v-for="g in grouped" :key="g.key"
                 :ref="el => setSectionRef(g.key, el as any)"
                 :data-group="g.key"
                 class="flex flex-col gap-2">
          <!-- 分组头：左侧彩色 dot + 名称，右侧合计金额 -->
          <div class="flex items-center gap-2 px-1">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: g.color }" />
            <span class="font-700 text-[13px]" :style="{ color: g.color }">
              {{ g.label }}
            </span>
            <span class="text-[11px] text-ink-muted">{{ g.items.length }} 项</span>
            <span class="ml-auto font-brand font-700 text-[13px] text-ink">
              ¥{{ mask(formatCompact(g.total)) }}
            </span>
          </div>

          <div class="flex flex-col gap-1.5">
            <AssetRow v-for="a in g.items" :key="a.id"
                      :asset="a"
                      :privacy-mode="store.settings.privacyMode"
                      @click="openEditor(a)"
                      @supplement="openSupplement(a)" />
          </div>
        </section>
      </div>
    </template>

    <!-- 单类型视图：纯列表 -->
    <div v-else class="flex flex-col gap-1.5">
      <AssetRow v-for="a in filtered" :key="a.id"
                :asset="a"
                :privacy-mode="store.settings.privacyMode"
                @click="openEditor(a)"
                @supplement="openSupplement(a)" />
    </div>

    <div v-if="filtered.length === 0" class="text-center text-ink-muted text-sm py-12">
      当前筛选下无资产
    </div>
  </div>

  <AssetEditor :open="editorOpen" :initial="editing" @close="editorOpen = false" @save="onSave" @delete="onDelete" />
  <ScreenshotImporter :open="importerOpen" @close="importerOpen = false" @import="onImport" />
  <AssetBatchEditor :open="batchOpen" @close="batchOpen = false" />
  <SupplementInfoModal :open="supplementOpen" :asset="supplementing"
                       @close="supplementOpen = false" @save="onSupplementSave" />
</template>
