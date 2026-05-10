<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue';
import type { Asset } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact } from '../lib/format';
import { useAppStore } from '../store/assets';
import Modal from './Modal.vue';
import AssetIcon from './AssetIcon.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useAppStore();

// 草稿（key=id, value=新 balance）
const drafts = reactive<Record<number, string>>({});
const dirty = computed(() =>
  store.assets.filter(a => {
    const v = drafts[a.id!];
    if (v === undefined || v === '') return false;
    return Number(v) !== a.balance;
  })
);

watch(() => props.open, (o) => {
  if (o) {
    // 打开时把当前金额预填到输入框
    for (const a of store.assets) {
      drafts[a.id!] = String(a.balance);
    }
  }
});

const saving = ref(false);

async function saveAll() {
  if (dirty.value.length === 0) {
    emit('close');
    return;
  }
  saving.value = true;
  try {
    const updates = dirty.value.map(a => ({
      id: a.id!,
      patch: { balance: Number(drafts[a.id!]) }
    }));
    await store.bulkUpdate(updates);
    emit('close');
  } finally {
    saving.value = false;
  }
}

const sortedAssets = computed(() =>
  [...store.assets].sort((a, b) => b.balance - a.balance)
);

function diffOf(a: Asset): { delta: number; pct: number } {
  const v = Number(drafts[a.id!]);
  if (!Number.isFinite(v)) return { delta: 0, pct: 0 };
  const delta = v - a.balance;
  const pct = a.balance ? (delta / a.balance) * 100 : 0;
  return { delta, pct };
}

const totalNew = computed(() => {
  let s = 0;
  for (const a of store.assets) {
    const v = Number(drafts[a.id!]);
    s += Number.isFinite(v) ? v : a.balance;
  }
  return s;
});
const totalDiff = computed(() => totalNew.value - store.totalNetWorth);
</script>

<template>
  <Modal :open="open" title="批量更新资产金额" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <p class="text-xs text-ink-muted leading-relaxed">
        逐行改余额一次保存。空白或无变化的会跳过。
      </p>

      <!-- 总览 -->
      <div class="card-base !p-3 bg-bg/60 flex items-center gap-3">
        <div class="flex-1">
          <div class="text-[11px] text-ink-muted">新总净值</div>
          <div class="font-brand text-lg font-600">¥ {{ formatCompact(totalNew) }}</div>
        </div>
        <div class="text-right">
          <div class="text-[11px] text-ink-muted">变化</div>
          <div class="text-[13px] font-700"
               :class="totalDiff > 0 ? 'text-pos' : totalDiff < 0 ? 'text-neg' : 'text-ink-muted'">
            {{ totalDiff > 0 ? '+' : '' }}{{ formatCompact(totalDiff) }}
          </div>
        </div>
      </div>

      <!-- 资产逐行 -->
      <div class="flex flex-col gap-2 max-h-[55dvh] overflow-y-auto scroll-hide">
        <div v-for="a in sortedAssets" :key="a.id"
             class="bg-bg/40 rounded-icon px-3 py-2 flex items-center gap-2.5">
          <AssetIcon :category="a.category" :size="32" />
          <div class="flex-1 min-w-0">
            <div class="font-700 text-[13px] truncate">{{ a.name }}</div>
            <div class="flex items-center gap-1 mt-0.5">
              <span class="px-1 h-3.5 inline-flex items-center rounded text-[9px] font-600"
                    :style="{ background: CATEGORY_MAP[a.category].color + '22', color: CATEGORY_MAP[a.category].color }">
                {{ CATEGORY_MAP[a.category].label }}
              </span>
              <span class="text-[10px] text-ink-muted truncate">原 ¥{{ formatCompact(a.balance) }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end shrink-0 w-26">
            <input
              v-model="drafts[a.id!]"
              type="number"
              step="0.01"
              class="w-full h-9 px-2 text-right rounded-icon bg-white border border-border focus:border-brand outline-none text-[13px] font-mono"
              :placeholder="String(a.balance)"
            />
            <div v-if="Number(drafts[a.id!]) !== a.balance && drafts[a.id!] !== '' && Number.isFinite(Number(drafts[a.id!]))"
                 class="text-[10px] font-700 mt-0.5"
                 :class="diffOf(a).delta > 0 ? 'text-pos' : 'text-neg'">
              {{ diffOf(a).delta > 0 ? '+' : '' }}{{ formatCompact(diffOf(a).delta) }}
              ({{ diffOf(a).pct > 0 ? '+' : '' }}{{ diffOf(a).pct.toFixed(1) }}%)
            </div>
          </div>
        </div>
      </div>

      <!-- 提交 -->
      <div class="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 bg-card/90 backdrop-blur border-t border-border flex gap-2">
        <button class="tap flex-1 h-12 rounded-icon border border-border text-ink-muted font-600"
                @click="emit('close')">取消</button>
        <button class="tap flex-1 h-12 rounded-icon bg-brand text-white font-700 disabled:opacity-50"
                :disabled="saving || dirty.length === 0"
                @click="saveAll">
          <span v-if="saving" class="i-ph-spinner-gap-bold text-base animate-spin inline-block align-middle mr-1" />
          {{ dirty.length === 0 ? '无变化' : `保存 ${dirty.length} 项变更` }}
        </button>
      </div>
    </div>
  </Modal>
</template>
