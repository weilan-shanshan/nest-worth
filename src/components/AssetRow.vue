<script setup lang="ts">
import { computed } from 'vue';
import type { Asset } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact, formatPct } from '../lib/format';
import {
  daysToMaturity, computeMaturityProfit,
  fundReturnPct, fundReturnAbs, holdingDays
} from '../lib/asset-calc';

const props = defineProps<{ asset: Asset; privacyMode?: boolean }>();
const emit = defineEmits<{ (e: 'click'): void }>();

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

interface LeftSeg { text: string; emphasis?: 'orange' }

interface Display {
  leftSegs: LeftSeg[];
  rightText?: string;
  rightEmphasis?: 'pos' | 'neg' | 'orange';
}

const display = computed<Display>(() => {
  const a = props.asset;
  const leftSegs: LeftSeg[] = [];
  let rightText: string | undefined;
  let rightEmphasis: 'pos' | 'neg' | 'orange' | undefined;

  if (a.category === 'deposit' || a.category === 'wealth') {
    if (a.termMonths) leftSegs.push({ text: termText(a.termMonths) });
    if (a.interestRate) leftSegs.push({ text: `${a.interestRate}%` });
    const days = daysToMaturity(a);
    if (days !== null) {
      leftSegs.push({
        text: days === 0 ? '已到期' : `还剩 ${days} 天`,
        emphasis: days <= 30 ? 'orange' : undefined
      });
    }
    const profit = computeMaturityProfit(a);
    if (profit && profit > 0) {
      rightText = `+¥${mask(formatCompact(profit))}`;
      rightEmphasis = 'pos';
    }
  } else if (a.category === 'fund') {
    const ret = fundReturnAbs(a);
    if (ret !== null && Math.abs(ret) > 0.01) {
      leftSegs.push({ text: `${ret >= 0 ? '+' : '-'}¥${mask(formatCompact(Math.abs(ret)))}` });
    }
    if (a.annualizedReturn !== undefined) {
      leftSegs.push({ text: `年化 ${formatPct(a.annualizedReturn, 1)}` });
    }
    const days = holdingDays(a);
    if (days !== null && days > 0) leftSegs.push({ text: holdingText(days) });

    const today = a.dailyChangePct;
    if (today !== undefined && today !== 0) {
      rightText = `今 ${formatPct(today, 2)}`;
      rightEmphasis = today > 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'stock') {
    if (a.cost) {
      const pnl = a.balance - a.cost;
      const pnlPct = (pnl / a.cost) * 100;
      leftSegs.push({ text: `浮盈 ${formatPct(pnlPct, 2)}` });
    }
    const today = a.dailyChangePct;
    if (today !== undefined && today !== 0) {
      rightText = `今 ${formatPct(today, 2)}`;
      rightEmphasis = today > 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'realestate') {
    if (a.platform) leftSegs.push({ text: a.platform });
    const days = holdingDays(a);
    if (days !== null && days > 0) leftSegs.push({ text: holdingText(days) });

    if (a.cost && a.cost !== a.balance) {
      const pnl = a.balance - a.cost;
      const pnlPct = (pnl / a.cost) * 100;
      rightText = formatPct(pnlPct, 1);
      rightEmphasis = pnl >= 0 ? 'pos' : 'neg';
    }
  } else if (a.category === 'cash') {
    if (a.platform) leftSegs.push({ text: a.platform });
  } else {
    // insurance / receivable / other
    if (a.platform) leftSegs.push({ text: a.platform });
    const days = holdingDays(a);
    if (days !== null && days > 30) leftSegs.push({ text: holdingText(days) });
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

    <!-- 副行：左核心 + 右涨跌（右对齐与金额同栏，min-h 保 2 行高度） -->
    <div class="flex items-center gap-2 min-h-[14px]">
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
    </div>
  </button>
</template>
