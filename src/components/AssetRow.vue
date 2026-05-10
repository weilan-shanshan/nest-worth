<script setup lang="ts">
import { computed } from 'vue';
import type { Asset } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact, formatPct } from '../lib/format';

const props = defineProps<{ asset: Asset; privacyMode?: boolean }>();
const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'supplement'): void;
}>();

const meta = computed(() => CATEGORY_MAP[props.asset.category]);

function mask(s: string) {
  return props.privacyMode ? s.replace(/[\d.,]/g, '•') : s;
}

function termText(months: number) {
  return months >= 12 && months % 12 === 0 ? `${months / 12}年期` : `${months}月期`;
}

function holdingText(days: number) {
  if (days >= 365) {
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return m > 0 ? `持有 ${y}年${m}月` : `持有 ${y}年`;
  }
  if (days >= 30) return `持有 ${Math.floor(days / 30)}个月`;
  return `持有 ${days}天`;
}

const FIELD_LABEL: Record<string, string> = {
  interestRate: '利率',
  startDate: '起息日 / 买入日',
  termMonths: '期限',
  cost: '成本',
  shares: '持仓数'
};

const missingLabels = computed(() =>
  (props.asset.missingFields || []).map(k => FIELD_LABEL[k] || k)
);

interface LeftSeg { text: string; emphasis?: 'orange' }

interface Display {
  leftSegs: LeftSeg[];
  rightText?: string;
  rightEmphasis?: 'pos' | 'neg' | 'orange';
}

const display = computed<Display>(() => {
  const a = props.asset;
  const d = a.derived || {};
  const leftSegs: LeftSeg[] = [];
  let rightText: string | undefined;
  let rightEmphasis: 'pos' | 'neg' | 'orange' | undefined;

  if (a.category === 'deposit' || a.category === 'wealth') {
    if (a.termMonths) leftSegs.push({ text: termText(a.termMonths) });
    if (d.annualized !== undefined) leftSegs.push({ text: `${d.annualized}%` });
    else if (a.interestRate) leftSegs.push({ text: `${a.interestRate}%` });
    if (d.daysToMaturity !== undefined) {
      leftSegs.push({
        text: d.daysToMaturity === 0 ? '已到期' : `还剩 ${d.daysToMaturity} 天`,
        emphasis: d.daysToMaturity <= 30 ? 'orange' : undefined
      });
    }
    if (d.maturityProfit && d.maturityProfit > 0) {
      rightText = `+¥${mask(formatCompact(d.maturityProfit))}`;
      rightEmphasis = 'pos';
    }
  } else if (a.category === 'fund') {
    if (d.fundReturnAbs !== undefined && Math.abs(d.fundReturnAbs) > 0.01) {
      leftSegs.push({ text: `${d.fundReturnAbs >= 0 ? '+' : '-'}¥${mask(formatCompact(Math.abs(d.fundReturnAbs)))}` });
    }
    if (d.annualized !== undefined) {
      leftSegs.push({ text: `年化 ${formatPct(d.annualized, 1)}` });
    }
    if (d.holdingDays !== undefined && d.holdingDays > 0) leftSegs.push({ text: holdingText(d.holdingDays) });

    const today = a.dailyChangePct;
    if (today !== undefined && today !== 0) {
      rightText = `今 ${formatPct(today, 2)}`;
      rightEmphasis = today > 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'stock') {
    if (d.pnlPct !== undefined) {
      leftSegs.push({ text: `浮盈 ${formatPct(d.pnlPct, 2)}` });
    }
    const today = a.dailyChangePct;
    if (today !== undefined && today !== 0) {
      rightText = `今 ${formatPct(today, 2)}`;
      rightEmphasis = today > 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'realestate') {
    if (a.platform) leftSegs.push({ text: a.platform });
    if (d.holdingDays !== undefined && d.holdingDays > 0) leftSegs.push({ text: holdingText(d.holdingDays) });

    if (d.pnlAbs !== undefined && d.pnlPct !== undefined) {
      rightText = formatPct(d.pnlPct, 1);
      rightEmphasis = d.pnlAbs >= 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'cash') {
    if (a.platform) leftSegs.push({ text: a.platform });
  } else {
    // insurance / receivable / other
    if (a.platform) leftSegs.push({ text: a.platform });
    if (d.holdingDays !== undefined && d.holdingDays > 30) leftSegs.push({ text: holdingText(d.holdingDays) });
    if (a.note && leftSegs.length < 2) leftSegs.push({ text: a.note });
  }

  return { leftSegs, rightText, rightEmphasis };
});

const rightColor = computed(() => {
  switch (display.value.rightEmphasis) {
    case 'pos': return 'text-pos';
    case 'neg': return 'text-neg';
    case 'orange': return 'text-orange';
    default: return 'text-ink';
  }
});

function onSupplement(e: MouseEvent) {
  e.stopPropagation();
  emit('supplement');
}
</script>

<template>
  <button class="tap card-base !p-3 w-full text-left flex flex-col gap-1.5"
          @click="emit('click')">
    <!-- 主行：名称 + chip 紧跟其后 + 金额最右 -->
    <div class="flex items-center gap-1.5">
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <span class="font-700 text-[14px] truncate">{{ asset.name }}</span>
        <span class="px-1.5 h-4 inline-flex items-center rounded text-[10px] font-700 leading-none shrink-0"
              :style="{ background: meta.color + '26', color: meta.color }">
          {{ meta.label }}
        </span>
      </div>
      <span class="font-brand font-700 text-[15px] shrink-0 leading-none">
        ¥{{ mask(formatCompact(asset.balance)) }}
      </span>
    </div>

    <!-- 副行 -->
    <div class="flex items-center gap-2 min-h-[14px]">
      <!-- 缺基础字段：显示橙色补充信息 chip（替换正常副行内容） -->
      <template v-if="missingLabels.length">
        <span
          class="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-orange/15 text-orange text-[10px] font-700"
          @click="onSupplement"
        >
          <span class="i-ph-warning-circle-duotone text-[12px]" />
          缺：{{ missingLabels.join('、') }} · 补充
        </span>
      </template>
      <!-- 正常派生展示 -->
      <template v-else>
        <div class="flex-1 min-w-0 text-[11px] leading-tight text-ink-muted truncate">
          <template v-for="(s, i) in display.leftSegs" :key="i">
            <span :class="s.emphasis === 'orange' ? 'text-orange font-600' : ''">{{ s.text }}</span>
            <span v-if="i < display.leftSegs.length - 1" class="text-ink-muted/40 mx-1">·</span>
          </template>
        </div>
        <span v-if="display.rightText"
              class="text-[11px] font-700 shrink-0 leading-tight"
              :class="rightColor">
          {{ display.rightText }}
        </span>
      </template>
    </div>
  </button>
</template>
