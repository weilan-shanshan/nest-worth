<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
import type { Asset } from '../types';
import Modal from './Modal.vue';
import Field from './Field.vue';

const props = defineProps<{ open: boolean; asset: Asset | null }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', patch: Partial<Asset>): void;
}>();

interface FormState {
  interestRate?: number;
  startDate?: string;
  termMonths?: number;
  maturityDate?: string;
  cost?: number;
  shares?: number;
}
const form = reactive<FormState>({});

watch(() => props.open, (o) => {
  if (o && props.asset) {
    form.interestRate = props.asset.interestRate;
    form.startDate = props.asset.startDate;
    form.termMonths = props.asset.termMonths;
    form.maturityDate = props.asset.maturityDate;
    form.cost = props.asset.cost;
    form.shares = props.asset.shares;
  }
}, { immediate: true });

const missing = computed(() => props.asset?.missingFields || []);
const labels = computed(() => {
  const map: Record<string, string> = {
    interestRate: '年化利率',
    startDate: props.asset?.category === 'fund' ? '买入日（首笔）' : '起息日',
    termMonths: '期限（月）',
    cost: '持仓成本',
    shares: '持仓数量'
  };
  return map;
});

const showInterest = computed(() => missing.value.includes('interestRate'));
const showStartDate = computed(() => missing.value.includes('startDate'));
const showTerm = computed(() => missing.value.includes('termMonths'));
const showCost = computed(() => missing.value.includes('cost'));
const showShares = computed(() => missing.value.includes('shares'));

function save() {
  const patch: Partial<Asset> = {};
  if (form.interestRate !== undefined && Number.isFinite(form.interestRate)) patch.interestRate = form.interestRate;
  if (form.startDate) patch.startDate = form.startDate;
  if (form.termMonths !== undefined && Number.isFinite(form.termMonths)) patch.termMonths = form.termMonths;
  if (form.maturityDate) patch.maturityDate = form.maturityDate;
  if (form.cost !== undefined && Number.isFinite(form.cost)) patch.cost = form.cost;
  if (form.shares !== undefined && Number.isFinite(form.shares)) patch.shares = form.shares;
  emit('save', patch);
}
</script>

<template>
  <Modal :open="open" title="补充基础信息" @close="emit('close')">
    <div v-if="asset" class="flex flex-col gap-4">
      <div class="rounded-icon bg-brand/8 p-3">
        <div class="flex items-center gap-1.5 text-[12px] font-700 text-brand">
          <span class="i-ph-info-duotone text-base" />
          {{ asset.name }}
        </div>
        <p class="text-[11px] text-ink-muted leading-relaxed mt-1">
          只需填写基础事实，AI 会自动算出收益、剩余天数、年化等。<br/>
          <b class="text-brand">无需自己计算。</b>
        </p>
      </div>

      <Field v-if="showInterest" :label="labels.interestRate + ' %'">
        <input v-model.number="form.interestRate" type="number" step="0.01"
               placeholder="3.5" class="field-input" />
      </Field>

      <div v-if="showStartDate || (asset.category === 'deposit' || asset.category === 'wealth')"
           class="grid grid-cols-2 gap-2">
        <Field v-if="showStartDate" :label="labels.startDate">
          <input v-model="form.startDate" type="date" class="field-input" />
        </Field>
        <Field v-if="(asset.category === 'deposit' || asset.category === 'wealth')" label="到期日（可选）">
          <input v-model="form.maturityDate" type="date" class="field-input" />
        </Field>
      </div>

      <Field v-if="showTerm" :label="labels.termMonths">
        <input v-model.number="form.termMonths" type="number" min="1" max="600"
               placeholder="12 / 36 / 60" class="field-input" />
      </Field>

      <Field v-if="showCost" :label="labels.cost + '（CNY）'">
        <input v-model.number="form.cost" type="number" step="0.01"
               placeholder="50000" class="field-input" />
      </Field>

      <Field v-if="showShares" :label="labels.shares + '（股 / 份）'">
        <input v-model.number="form.shares" type="number" step="0.0001"
               placeholder="100" class="field-input" />
      </Field>

      <div class="flex gap-3 mt-2">
        <button class="tap flex-1 h-12 rounded-icon border border-border text-ink-muted font-600"
                @click="emit('close')">取消</button>
        <button class="tap flex-1 h-12 rounded-icon bg-brand text-white font-700"
                @click="save">保存并自动计算</button>
      </div>
    </div>
  </Modal>
</template>

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
</style>
