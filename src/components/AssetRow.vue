<script setup lang="ts">
import { computed } from 'vue';
import type { Asset } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';
import { formatCompact, formatPct } from '../lib/format';
import {
  computeMaturityDate, daysToMaturity, computeMaturityProfit,
  fundReturnPct, fundReturnAbs
} from '../lib/asset-calc';

const props = defineProps<{ asset: Asset; privacyMode?: boolean }>();
const emit = defineEmits<{ (e: 'click'): void }>();

const meta = computed(() => CATEGORY_MAP[props.asset.category]);

function mask(s: string) {
  return props.privacyMode ? s.replace(/[\d.,]/g, '•') : s;
}

/** 紧凑文案（去掉"年化"、"今日"等冗余词，用 / 节省空间） */
function termText(months: number) {
  return months >= 12 && months % 12 === 0 ? `${months / 12}年` : `${months}月`;
}

interface InfoSegment { text: string; emphasis?: 'pos' | 'neg' | 'orange' }

// 副信息分段（用 · 拼接渲染）
const segments = computed<InfoSegment[]>(() => {
  const a = props.asset;
  const segs: InfoSegment[] = [];

  if (a.category === 'deposit' || a.category === 'wealth') {
    if (a.termMonths) segs.push({ text: termText(a.termMonths) });
    if (a.interestRate) segs.push({ text: `${a.interestRate}%` });
    const days = daysToMaturity(a);
    if (days !== null) {
      segs.push({
        text: days === 0 ? '已到期' : `还剩${days}天`,
        emphasis: days <= 30 ? 'orange' : undefined
      });
    }
    const profit = computeMaturityProfit(a);
    if (profit && profit > 0) {
      segs.push({ text: `+¥${mask(formatCompact(profit))}`, emphasis: 'pos' });
    }
    if (segs.length === 0 && a.platform) segs.push({ text: a.platform });
  } else if (a.category === 'fund') {
    const ret = fundReturnAbs(a);
    const retPct = fundReturnPct(a);
    if (ret !== null && retPct !== null) {
      segs.push({
        text: `累计 ${formatPct(retPct, 2)}`,
        emphasis: ret >= 0 ? 'pos' : 'neg'
      });
    }
    if (a.annualizedReturn !== undefined) {
      segs.push({
        text: `年化 ${formatPct(a.annualizedReturn, 1)}`,
        emphasis: a.annualizedReturn >= 0 ? 'pos' : 'neg'
      });
    }
  } else if (a.category === 'stock') {
    if (a.shares) segs.push({ text: `${a.shares}股` });
    if (a.cost) {
      const pnl = a.balance - a.cost;
      const pnlPct = (pnl / a.cost) * 100;
      segs.push({ text: `¥${mask(formatCompact(a.cost))}成本` });
      segs.push({
        text: `浮盈 ${formatPct(pnlPct, 2)}`,
        emphasis: pnl >= 0 ? 'pos' : 'neg'
      });
    }
    if (a.tickerSymbol && segs.length < 4) segs.push({ text: a.tickerSymbol });
  } else {
    if (a.platform) segs.push({ text: a.platform });
    if (a.note) segs.push({ text: a.note });
  }

  return segs;
});

// 主行右上角：当日涨跌（基金/股票才有）
const dailyDelta = computed(() => {
  const p = props.asset.dailyChangePct;
  if (p === undefined || p === 0) return null;
  return { text: formatPct(p, 2), positive: p > 0 };
});

const emphasisClass = (e?: string) => {
  switch (e) {
    case 'pos': return 'text-pos';
    case 'neg': return 'text-neg';
    case 'orange': return 'text-orange';
    default: return 'text-ink-muted';
  }
};
</script>

<template>
  <button class="tap card-base !p-2.5 w-full text-left flex flex-col gap-1"
          @click="emit('click')">
    <!-- 主行：chip + 名称 + 金额 + 当日涨跌 -->
    <div class="flex items-center gap-2">
      <span class="px-1.5 h-4.5 inline-flex items-center rounded text-[10px] font-700 shrink-0"
            :style="{ background: meta.color + '20', color: meta.color }">
        {{ meta.label }}
      </span>
      <span class="flex-1 min-w-0 font-700 text-[14px] leading-tight truncate">
        {{ asset.name }}
      </span>
      <div class="flex flex-col items-end shrink-0 leading-none">
        <span class="font-brand font-700 text-[15px]">
          ¥{{ mask(formatCompact(asset.balance)) }}
        </span>
        <span v-if="dailyDelta"
              class="text-[10px] font-700 mt-0.5"
              :class="dailyDelta.positive ? 'text-pos' : 'text-neg'">
          今 {{ dailyDelta.text }}
        </span>
      </div>
    </div>

    <!-- 副行：单行紧凑，· 分隔 -->
    <div v-if="segments.length"
         class="text-[11px] leading-tight text-ink-muted flex flex-wrap gap-x-1.5 gap-y-0.5">
      <template v-for="(s, i) in segments" :key="i">
        <span :class="emphasisClass(s.emphasis)">{{ s.text }}</span>
        <span v-if="i < segments.length - 1" class="text-ink-muted/40">·</span>
      </template>
    </div>
  </button>
</template>
