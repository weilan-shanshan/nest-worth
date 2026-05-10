<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { Asset, AssetCategory } from '../types';
import { CATEGORIES } from '../lib/asset-meta';
import Modal from './Modal.vue';
import Field from './Field.vue';

const props = defineProps<{ open: boolean; initial?: Partial<Asset> | null }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', a: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): void;
  (e: 'delete'): void;
}>();

const form = reactive({
  name: '',
  platform: '',
  category: 'cash' as AssetCategory,
  balance: 0,
  currency: 'CNY',
  cost: undefined as number | undefined,
  dailyChange: undefined as number | undefined,
  dailyChangePct: undefined as number | undefined,
  note: ''
});

watch(() => props.open, (o) => {
  if (o) {
    Object.assign(form, {
      name: '', platform: '', category: 'cash',
      balance: 0, currency: 'CNY',
      cost: undefined, dailyChange: undefined, dailyChangePct: undefined,
      note: ''
    });
    if (props.initial) Object.assign(form, props.initial);
  }
}, { immediate: true });

function save() {
  if (!form.name.trim()) return;
  emit('save', {
    name: form.name.trim(),
    platform: form.platform?.trim() || undefined,
    category: form.category,
    balance: Number(form.balance) || 0,
    currency: form.currency || 'CNY',
    cost: form.cost,
    dailyChange: form.dailyChange,
    dailyChangePct: form.dailyChangePct,
    note: form.note?.trim() || undefined
  });
}
</script>

<template>
  <Modal :open="open" :title="initial?.id ? '编辑资产' : '添加资产'" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <Field label="名称">
        <input v-model="form.name" placeholder="例如：招行储蓄卡" class="field-input" />
      </Field>

      <Field label="所在平台 (可选)">
        <input v-model="form.platform" placeholder="招商银行 / 支付宝 / 富途 …" class="field-input" />
      </Field>

      <Field label="类型">
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="c in CATEGORIES" :key="c.key"
            class="tap py-2 rounded-icon text-xs border transition-all"
            :class="form.category === c.key
              ? 'bg-brand text-white border-brand'
              : 'bg-white border-border text-ink-muted'"
            @click="form.category = c.key"
          >{{ c.label }}</button>
        </div>
      </Field>

      <div class="grid grid-cols-2 gap-3">
        <Field label="当前金额">
          <input v-model.number="form.balance" type="number" step="0.01" class="field-input" />
        </Field>
        <Field label="货币">
          <input v-model="form.currency" class="field-input uppercase" maxlength="6" />
        </Field>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <Field label="当日涨跌 (可选)">
          <input v-model.number="form.dailyChange" type="number" step="0.01" placeholder="金额" class="field-input" />
        </Field>
        <Field label="当日涨跌幅 % (可选)">
          <input v-model.number="form.dailyChangePct" type="number" step="0.01" placeholder="如 1.23" class="field-input" />
        </Field>
      </div>

      <Field label="持仓成本 (可选)">
        <input v-model.number="form.cost" type="number" step="0.01" class="field-input" />
      </Field>

      <Field label="备注 (可选)">
        <textarea v-model="form.note" rows="2" class="field-input resize-none" />
      </Field>

      <div class="flex gap-3 mt-2">
        <button v-if="initial?.id" class="tap flex-1 h-12 rounded-icon border border-neg text-neg font-600" @click="emit('delete')">删除</button>
        <button class="tap flex-1 h-12 rounded-icon bg-brand text-white font-700" @click="save">保存</button>
      </div>
    </div>
  </Modal>
</template>

<script lang="ts">
export default { name: 'AssetEditor' };
</script>

<style scoped>
.field-input {
  width: 100%;
  height: 44px;
  background: #F5FAF6;
  border: 1px solid #E0EFE6;
  border-radius: 12px;
  padding: 0 14px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: #2E9E60; background: #fff; }
textarea.field-input { padding: 10px 14px; height: auto; line-height: 1.5; }
</style>
