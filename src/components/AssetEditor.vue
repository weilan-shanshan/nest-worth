<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
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
  note: '',
  // 行情
  tickerSymbol: '',
  tickerType: 'none' as 'cn-stock' | 'hk-stock' | 'us-stock' | 'cn-fund' | 'none',
  shares: undefined as number | undefined,
  // 固收
  termMonths: undefined as number | undefined,
  interestRate: undefined as number | undefined,
  startDate: '',
  maturityDate: '',
  // 基金
  annualizedReturn: undefined as number | undefined,
  totalReturn: undefined as number | undefined
});

watch(() => props.open, (o) => {
  if (o) {
    Object.assign(form, {
      name: '', platform: '', category: 'cash',
      balance: 0, currency: 'CNY',
      cost: undefined, dailyChange: undefined, dailyChangePct: undefined,
      note: '',
      tickerSymbol: '', tickerType: 'none', shares: undefined,
      termMonths: undefined, interestRate: undefined, startDate: '', maturityDate: '',
      annualizedReturn: undefined, totalReturn: undefined
    });
    if (props.initial) Object.assign(form, props.initial);
  }
}, { immediate: true });

const isFixedIncome = computed(() => form.category === 'deposit' || form.category === 'wealth');
const isFund = computed(() => form.category === 'fund');
const isMarket = computed(() => form.category === 'fund' || form.category === 'stock');

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
    note: form.note?.trim() || undefined,
    tickerSymbol: form.tickerSymbol?.trim().toUpperCase() || undefined,
    tickerType: form.tickerType === 'none' ? undefined : form.tickerType as any,
    shares: form.shares,
    // 固收类
    termMonths: isFixedIncome.value ? form.termMonths : undefined,
    interestRate: isFixedIncome.value ? form.interestRate : undefined,
    startDate: isFixedIncome.value ? (form.startDate || undefined) : undefined,
    maturityDate: isFixedIncome.value ? (form.maturityDate || undefined) : undefined,
    // 基金类
    annualizedReturn: isFund.value ? form.annualizedReturn : undefined,
    totalReturn: isFund.value ? form.totalReturn : undefined
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

      <!-- 固收类（存款/理财）字段组 -->
      <div v-if="isFixedIncome" class="bg-bg/60 rounded-icon p-3 flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
          <span class="i-ph-bank-duotone text-brand text-sm" />
          {{ form.category === 'deposit' ? '存款细节' : '理财细节' }}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Field label="期限（月）">
            <input v-model.number="form.termMonths" type="number" min="1" max="600"
                   placeholder="12 / 36 / 60" class="field-input" />
          </Field>
          <Field label="年化利率 %">
            <input v-model.number="form.interestRate" type="number" step="0.01"
                   placeholder="3.5" class="field-input" />
          </Field>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Field label="起息日">
            <input v-model="form.startDate" type="date" class="field-input" />
          </Field>
          <Field label="到期日 (可选 · 自动算)">
            <input v-model="form.maturityDate" type="date" class="field-input" />
          </Field>
        </div>
        <p class="text-[10px] text-ink-muted leading-relaxed">
          填了起息日 + 期限会自动算到期日；填了利率会自动算到期收益。
        </p>
      </div>

      <!-- 基金字段组 -->
      <div v-if="isFund" class="bg-bg/60 rounded-icon p-3 flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
          <span class="i-ph-chart-pie-slice-duotone text-brand text-sm" />
          基金细节
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Field label="累计收益 ¥">
            <input v-model.number="form.totalReturn" type="number" step="0.01"
                   placeholder="3000" class="field-input" />
          </Field>
          <Field label="年化收益率 %">
            <input v-model.number="form.annualizedReturn" type="number" step="0.01"
                   placeholder="8.2" class="field-input" />
          </Field>
        </div>
      </div>

      <!-- 行情自动更新（基金/股票） -->
      <div v-if="isMarket" class="bg-bg/60 rounded-icon p-3 flex flex-col gap-3">
        <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
          <span class="i-ph-currency-circle-dollar-duotone text-brand text-sm" />
          自动行情同步（可选 · 留空就手动维护）
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Field label="行情代码">
            <input v-model="form.tickerSymbol" placeholder="600519 / AAPL / 008888"
                   class="field-input uppercase font-mono" maxlength="20" />
          </Field>
          <Field label="市场">
            <select v-model="form.tickerType" class="field-input">
              <option value="none">不启用</option>
              <option value="cn-stock">A 股</option>
              <option value="hk-stock">港股</option>
              <option value="us-stock">美股</option>
              <option value="cn-fund">国内基金</option>
            </select>
          </Field>
        </div>
        <Field v-if="form.tickerType !== 'none'" label="持仓数量（股 / 份）">
          <input v-model.number="form.shares" type="number" step="0.0001"
                 placeholder="100" class="field-input" />
        </Field>
        <p class="text-[10px] text-ink-muted leading-relaxed">
          配置后系统每天自动拉最新价 × 持仓数量 = 余额。
          A 股 / 港股 / 美股 / 国内基金需部署 Cloudflare Worker 代理。
        </p>
      </div>

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
