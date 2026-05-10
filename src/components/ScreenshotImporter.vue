<script setup lang="ts">
import { ref } from 'vue';
import Modal from './Modal.vue';
import AssetIcon from './AssetIcon.vue';
import { recognizeAssetScreenshot, MODEL_CHAIN, type RecognizedAsset } from '../lib/recognize';
import { useAppStore } from '../store/assets';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatMoney } from '../lib/format';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'import', items: RecognizedAsset[]): void;
}>();

const file = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<RecognizedAsset[]>([]);
const checked = ref<boolean[]>([]);
const modelUsed = ref<string | null>(null);
const newlyExhausted = ref<string[]>([]);
const store = useAppStore();

function modelLabel(name: string) {
  return MODEL_CHAIN.find(m => m.name === name)?.label || name;
}

function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  file.value = f;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = URL.createObjectURL(f);
  items.value = [];
  error.value = null;
}

async function recognize() {
  if (!file.value) return;
  loading.value = true;
  error.value = null;
  modelUsed.value = null;
  newlyExhausted.value = [];
  try {
    const result = await recognizeAssetScreenshot(file.value);
    items.value = result.items;
    checked.value = result.items.map(() => true);
    modelUsed.value = result.modelUsed;
    newlyExhausted.value = result.newlyExhausted;
    if (newlyExhausted.value.length) await store.refreshSettings();
    if (result.items.length === 0) error.value = '未从图片中识别到任何资产';
  } catch (e: any) {
    error.value = e.message || '识别失败';
    await store.refreshSettings();   // 即使全失败，也持久化了 exhausted 列表
  } finally {
    loading.value = false;
  }
}

function confirmImport() {
  const selected = items.value.filter((_, i) => checked.value[i]);
  if (selected.length === 0) return;
  emit('import', selected);
  reset();
}

function reset() {
  file.value = null;
  if (previewUrl.value) { URL.revokeObjectURL(previewUrl.value); previewUrl.value = null; }
  items.value = [];
  checked.value = [];
  error.value = null;
  modelUsed.value = null;
  newlyExhausted.value = [];
}

function close() {
  reset();
  emit('close');
}
</script>

<template>
  <Modal :open="open" title="截图识别资产" @close="close">
    <div class="flex flex-col gap-4">
      <p class="text-xs text-ink-muted leading-relaxed">
        上传银行/支付宝/券商 App 截图，AI 自动识别资产并填入。需先在「设置」配置 Qwen-VL API Key。
      </p>

      <label class="block tap rounded-card border-2 border-dashed border-border bg-brand-50/40 p-6 text-center cursor-pointer">
        <input type="file" accept="image/*" class="hidden" @change="pick" />
        <div v-if="!previewUrl" class="flex flex-col items-center gap-2 text-ink-muted">
          <span class="i-ph-image-square-duotone text-4xl text-brand" />
          <span class="text-sm font-600">选择截图</span>
          <span class="text-[11px]">支持 JPG / PNG · 单张</span>
        </div>
        <img v-else :src="previewUrl" class="max-h-48 mx-auto rounded-icon" />
      </label>

      <button
        v-if="file && items.length === 0"
        class="tap h-12 rounded-icon bg-brand text-white font-700 disabled:opacity-50"
        :disabled="loading"
        @click="recognize"
      >
        <span v-if="!loading">开始识别</span>
        <span v-else class="flex items-center justify-center gap-2">
          <span class="i-ph-spinner-gap-bold text-lg animate-spin" />
          识别中…
        </span>
      </button>

      <div v-if="error" class="text-xs text-neg bg-neg/10 px-3 py-2 rounded-icon whitespace-pre-wrap leading-relaxed">
        {{ error }}
      </div>

      <div v-if="newlyExhausted.length" class="text-[11px] text-orange bg-orange/10 px-3 py-2 rounded-icon leading-relaxed">
        ⚡ 自动跳过了已耗尽免费额度的模型：<br/>
        {{ newlyExhausted.map(modelLabel).join('、') }}
      </div>

      <div v-if="modelUsed && items.length" class="text-[11px] text-ink-muted px-1">
        ✓ 由 <span class="text-brand font-600">{{ modelLabel(modelUsed) }}</span> 识别
      </div>

      <div v-if="items.length" class="flex flex-col gap-2">
        <div class="text-xs text-ink-muted font-600">识别到 {{ items.length }} 项，勾选要导入的：</div>
        <label
          v-for="(it, i) in items" :key="i"
          class="tap flex items-center gap-3 p-3 rounded-row border border-border bg-white"
        >
          <input type="checkbox" v-model="checked[i]" class="w-4 h-4 accent-brand" />
          <AssetIcon :category="it.category" :size="36" />
          <div class="flex-1 min-w-0">
            <div class="font-600 text-sm truncate">{{ it.name }}</div>
            <div class="text-[11px] text-ink-muted">{{ it.platform || CATEGORY_MAP[it.category].label }}</div>
          </div>
          <div class="font-brand text-base">{{ formatMoney(it.balance) }}</div>
        </label>

        <button
          class="tap mt-2 h-12 rounded-icon bg-brand text-white font-700"
          @click="confirmImport"
        >导入 {{ checked.filter(Boolean).length }} 项</button>
      </div>
    </div>
  </Modal>
</template>
