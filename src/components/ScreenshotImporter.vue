<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Modal from './Modal.vue';
import AssetIcon from './AssetIcon.vue';
import { recognizeAssetScreenshot, MODEL_CHAIN, type RecognizedAsset } from '../lib/recognize';
import { matchRecognized, type MatchResult } from '../lib/asset-match';
import { useAppStore } from '../store/assets';
import { trackCta } from '../lib/analytics';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact } from '../lib/format';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  // 老接口保留兼容；现在直接调用 store 的方法
  (e: 'import', items: RecognizedAsset[]): void;
}>();

const router = useRouter();
const store = useAppStore();

const files = ref<File[]>([]);
const previewUrls = ref<string[]>([]);
const loading = ref(false);
const progress = ref<{ current: number; total: number } | null>(null);
const error = ref<string | null>(null);

interface DecoratedItem extends MatchResult {
  selected: boolean;
  fileIndex: number;     // 来自第几张图
  modelUsed?: string;
}
const items = ref<DecoratedItem[]>([]);
const newlyExhausted = ref<Set<string>>(new Set());

function pick(e: Event) {
  const fl = (e.target as HTMLInputElement).files;
  if (!fl) return;
  reset();
  files.value = Array.from(fl);
  previewUrls.value = files.value.map(f => URL.createObjectURL(f));
  error.value = null;
}

async function recognize() {
  if (files.value.length === 0) return;
  trackCta('import_screenshot');
  loading.value = true;
  error.value = null;
  items.value = [];
  newlyExhausted.value = new Set();
  progress.value = { current: 0, total: files.value.length };

  try {
    for (let i = 0; i < files.value.length; i++) {
      progress.value = { current: i + 1, total: files.value.length };
      const f = files.value[i];
      const res = await recognizeAssetScreenshot(f);
      const matches = matchRecognized(res.items, store.assets);
      const decorated: DecoratedItem[] = matches.map(m => ({
        ...m,
        selected: true,
        fileIndex: i,
        modelUsed: res.modelUsed
      }));
      items.value = [...items.value, ...decorated];
      for (const m of res.newlyExhausted || []) newlyExhausted.value.add(m);
    }
    if (newlyExhausted.value.size) await store.refreshSettings();
    if (items.value.length === 0) error.value = '未从任何图片中识别到资产';
  } catch (e: any) {
    error.value = e.message || '识别失败';
    await store.refreshSettings();
  } finally {
    loading.value = false;
    progress.value = null;
  }
}

const updateCount = computed(() => items.value.filter(x => x.selected && x.matchedAssetId).length);
const newCount = computed(() => items.value.filter(x => x.selected && !x.matchedAssetId).length);

async function confirmImport() {
  const selected = items.value.filter(x => x.selected);
  if (selected.length === 0) return;

  // 分流：命中现有 → bulkUpdate；未命中 → addAsset
  const updates: { id: number; patch: any }[] = [];
  const news: RecognizedAsset[] = [];

  for (const it of selected) {
    // 截图里只给"已持有 N 天"没给具体起息日 → 反算 startDate
    const r = { ...it.recognized };
    if (!r.startDate && r.holdingDays !== undefined && r.holdingDays >= 0) {
      const t = new Date();
      t.setDate(t.getDate() - Math.floor(r.holdingDays));
      r.startDate = t.toISOString().slice(0, 10);
    }

    if (it.matchedAssetId) {
      // 透传所有识别到的基础事实字段（不仅金额），供 LLM 派生计算用
      const patch: any = {
        balance: r.balance,
        currency: r.currency || 'CNY',
        dailyChange: r.dailyChange,
        dailyChangePct: r.dailyChangePct
      };
      if (r.platform) patch.platform = r.platform;
      if (r.cost !== undefined) patch.cost = r.cost;
      if (r.tickerSymbol) {
        patch.tickerSymbol = r.tickerSymbol;
        patch.tickerType = r.tickerType;
      }
      if (r.shares !== undefined) patch.shares = r.shares;
      if (r.termMonths !== undefined) patch.termMonths = r.termMonths;
      if (r.interestRate !== undefined) patch.interestRate = r.interestRate;
      if (r.startDate) patch.startDate = r.startDate;
      if (r.maturityDate) patch.maturityDate = r.maturityDate;
      if (r.transferredInterest !== undefined) patch.transferredInterest = r.transferredInterest;
      if (r.note) patch.note = r.note;
      updates.push({ id: it.matchedAssetId, patch });
    } else {
      news.push(r);
    }
  }

  if (updates.length) await store.bulkUpdate(updates);
  for (const n of news) {
    await store.addAsset({
      name: n.name,
      platform: n.platform,
      category: n.category,
      balance: n.balance,
      currency: n.currency || 'CNY',
      cost: n.cost,
      dailyChange: n.dailyChange,
      dailyChangePct: n.dailyChangePct,
      note: n.note,
      tickerSymbol: n.tickerSymbol,
      tickerType: n.tickerType === 'forex' || n.tickerType === 'metal' ? undefined : n.tickerType,
      shares: n.shares,
      termMonths: n.termMonths,
      interestRate: n.interestRate,
      startDate: n.startDate,
      maturityDate: n.maturityDate,
      transferredInterest: n.transferredInterest
    });
  }
  reset();
  emit('close');

  // 入库完毕 → 整库重算派生（不 await，让 modal 立刻关闭；UI 监听 store.deriving 显示进度）
  store.recomputeDerived().catch(() => { /* 静默 */ });
}

function reset() {
  files.value = [];
  previewUrls.value.forEach(u => URL.revokeObjectURL(u));
  previewUrls.value = [];
  items.value = [];
  newlyExhausted.value = new Set();
  error.value = null;
  progress.value = null;
}

function close() {
  reset();
  emit('close');
}

function modelLabel(name?: string) {
  return MODEL_CHAIN.find(m => m.name === name)?.label || name || '';
}

function goSetup() {
  emit('close');
  router.push({ path: '/setup-key', query: { from: '/' } });
}

function hasMeta(r: RecognizedAsset): boolean {
  return r.interestRate !== undefined
      || r.termMonths !== undefined
      || !!r.startDate
      || !!r.maturityDate;
}
</script>

<template>
  <Modal :open="open" title="截图识别资产（支持多张）" @close="close">
    <!-- 未配置 Key 引导 -->
    <div v-if="!store.hasApiKey" class="flex flex-col gap-4">
      <div class="rounded-card bg-gradient-to-br from-orange to-[#E58A0F] text-white p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="i-ph-camera-duotone text-2xl" />
          <h3 class="font-700 text-base">截图识别需要 1 个 AI Key</h3>
        </div>
        <p class="text-[12px] opacity-90 leading-relaxed">
          阿里云百炼新用户每个视觉模型送 100 万 token 免费额度，<br/>
          约够识别 <b>3500+ 张</b>截图。
        </p>
      </div>
      <button class="tap h-12 rounded-icon bg-brand text-white font-700 text-sm flex items-center justify-center gap-2"
              @click="goSetup">
        <span class="i-ph-rocket-launch-duotone text-base" />
        开始配置（带保姆级引导）
      </button>
      <button class="tap text-[11px] text-ink-muted font-600 py-1" @click="close">先关闭</button>
    </div>

    <!-- 已配置：多图识别 + 智能合并 -->
    <div v-else class="flex flex-col gap-4">
      <p class="text-xs text-ink-muted leading-relaxed">
        一次可选多张截图（招行、支付宝、富途、币安都行）— AI 识别后自动匹配现有资产，
        <b class="text-brand">命中则更新余额</b>，未命中走<b class="text-orange">新建</b>。
      </p>

      <!-- 选图区 -->
      <label class="block tap rounded-card border-2 border-dashed border-border bg-brand-50/40 p-5 text-center cursor-pointer">
        <input type="file" accept="image/*" multiple class="hidden" @change="pick" />
        <div v-if="previewUrls.length === 0" class="flex flex-col items-center gap-2 text-ink-muted">
          <span class="i-ph-images-square-duotone text-4xl text-brand" />
          <span class="text-sm font-600">选择 1 张或多张截图</span>
          <span class="text-[11px]">JPG / PNG · 长按多选</span>
        </div>
        <div v-else class="flex gap-1.5 overflow-x-auto scroll-hide -mx-2 px-2">
          <img v-for="(u, i) in previewUrls" :key="i"
               :src="u" class="h-24 w-auto rounded-icon shrink-0" />
        </div>
        <div v-if="previewUrls.length > 1" class="text-[11px] text-brand font-600 mt-2">
          已选 {{ previewUrls.length }} 张
        </div>
      </label>

      <button v-if="files.length && items.length === 0"
              class="tap h-12 rounded-icon bg-brand text-white font-700 disabled:opacity-50"
              :disabled="loading"
              @click="recognize">
        <span v-if="!loading">开始识别 {{ files.length }} 张</span>
        <span v-else class="flex items-center justify-center gap-2">
          <span class="i-ph-spinner-gap-bold text-lg animate-spin" />
          识别中
          <span v-if="progress">({{ progress.current }}/{{ progress.total }})</span>
        </span>
      </button>

      <div v-if="error"
           class="text-xs text-neg bg-neg/10 px-3 py-2 rounded-icon whitespace-pre-wrap leading-relaxed">
        {{ error }}
      </div>

      <div v-if="newlyExhausted.size"
           class="text-[11px] text-orange bg-orange/10 px-3 py-2 rounded-icon leading-relaxed">
        ⚡ 自动跳过额度已耗尽：{{ Array.from(newlyExhausted).map(modelLabel).join('、') }}
      </div>

      <!-- 识别结果（含匹配状态） -->
      <div v-if="items.length" class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-[11px] text-ink-muted px-1">
          <span>共识别 {{ items.length }} 项</span>
          <span class="flex gap-2">
            <span class="text-brand">🔄 更新 {{ updateCount }}</span>
            <span class="text-orange">+ 新建 {{ newCount }}</span>
          </span>
        </div>

        <label v-for="(it, i) in items" :key="i"
               class="tap flex items-center gap-2.5 p-2.5 rounded-row border border-border bg-white">
          <input type="checkbox" v-model="it.selected" class="w-4 h-4 accent-brand shrink-0" />
          <AssetIcon :category="it.recognized.category" :size="34" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-700 text-[13px] truncate">{{ it.recognized.name }}</span>
              <span v-if="it.matchedAssetId"
                    class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700 bg-brand/15 text-brand">
                🔄 更新
              </span>
              <span v-else
                    class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700 bg-orange/15 text-orange">
                + 新建
              </span>
              <span v-if="it.recognized.tickerSymbol"
                    class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-mono bg-blue/10 text-blue">
                {{ it.recognized.tickerSymbol }}
              </span>
            </div>
            <div class="text-[10px] text-ink-muted truncate">
              {{ it.recognized.platform || CATEGORY_MAP[it.recognized.category].label }}
              <template v-if="it.matchedAsset">
                · 原 ¥{{ formatCompact(it.matchedAsset.balance) }}
              </template>
            </div>
            <div v-if="hasMeta(it.recognized)"
                 class="flex gap-x-2 gap-y-0.5 flex-wrap text-[10px] text-ink-muted mt-0.5">
              <span v-if="it.recognized.interestRate !== undefined">
                利率 <b class="text-brand font-700">{{ it.recognized.interestRate }}%</b>
              </span>
              <span v-if="it.recognized.termMonths !== undefined">
                期限 <b class="text-brand font-700">{{ it.recognized.termMonths }}个月</b>
              </span>
              <span v-if="it.recognized.startDate">
                起息 <b class="text-brand font-700">{{ it.recognized.startDate }}</b>
              </span>
              <span v-if="it.recognized.maturityDate">
                到期 <b class="text-brand font-700">{{ it.recognized.maturityDate }}</b>
              </span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-brand font-700 text-[13px]">¥{{ formatCompact(it.recognized.balance) }}</div>
            <div v-if="it.matchedAsset && it.matchedAsset.balance !== it.recognized.balance"
                 class="text-[9px] font-700"
                 :class="it.recognized.balance > it.matchedAsset.balance ? 'text-pos' : 'text-neg'">
              {{ it.recognized.balance > it.matchedAsset.balance ? '+' : '' }}{{ formatCompact(it.recognized.balance - it.matchedAsset.balance) }}
            </div>
          </div>
        </label>

        <button class="tap mt-2 h-12 rounded-icon bg-brand text-white font-700"
                @click="confirmImport">
          确认（{{ items.filter(x => x.selected).length }}）
        </button>
      </div>
    </div>
  </Modal>
</template>
