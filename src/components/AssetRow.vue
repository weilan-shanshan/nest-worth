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

// 副信息（按 category 给不同字段）
interface InfoLine { text: string; emphasis?: 'pos' | 'neg' | 'orange' | 'muted' }

const infoLines = computed<InfoLine[]>(() => {
  const a = props.asset;
  const lines: InfoLine[] = [];

  if (a.category === 'deposit' || a.category === 'wealth') {
    // 存款/理财：年限 + 利率
    if (a.termMonths || a.interestRate) {
      const parts: string[] = [];
      if (a.termMonths) parts.push(`${a.termMonths >= 12 && a.termMonths % 12 === 0 ? `${a.termMonths / 12}年` : `${a.termMonths}月`}`);
      if (a.interestRate) parts.push(`${a.interestRate}%`);
      lines.push({ text: parts.join(' · '), emphasis: 'muted' });
    }
    // 到期日 + 倒计时
    const matDate = computeMaturityDate(a);
    if (matDate) {
      const days = daysToMaturity(a);
      const tail = days !== null ? (days === 0 ? '已到期' : `还剩 ${days} 天`) : '';
      lines.push({
        text: `到期 ${matDate}${tail ? ` · ${tail}` : ''}`,
        emphasis: days !== null && days < 30 ? 'orange' : 'muted'
      });
    }
    // 到期收益
    const profit = computeMaturityProfit(a);
    if (profit && profit > 0) {
      lines.push({ text: `到期收益 +¥${formatCompact(profit)}`, emphasis: 'pos' });
    }
  } else if (a.category === 'fund') {
    const ret = fundReturnAbs(a);
    const retPct = fundReturnPct(a);
    if (ret !== null) {
      const text = retPct !== null
        ? `累计 ${ret >= 0 ? '+' : ''}¥${formatCompact(Math.abs(ret))} (${formatPct(retPct, 2)})`
        : `累计 ${ret >= 0 ? '+' : ''}¥${formatCompact(Math.abs(ret))}`;
      lines.push({ text, emphasis: ret >= 0 ? 'pos' : 'neg' });
    }
    if (a.annualizedReturn !== undefined) {
      lines.push({
        text: `年化 ${formatPct(a.annualizedReturn, 2)}`,
        emphasis: a.annualizedReturn >= 0 ? 'pos' : 'neg'
      });
    }
    if (a.dailyChangePct !== undefined && a.dailyChangePct !== 0) {
      lines.push({
        text: `今日 ${formatPct(a.dailyChangePct, 2)}`,
        emphasis: a.dailyChangePct >= 0 ? 'pos' : 'neg'
      });
    }
  } else if (a.category === 'stock') {
    if (a.cost && a.shares) {
      const pnl = (a.balance - a.cost);
      const pnlPct = a.cost ? (pnl / a.cost) * 100 : 0;
      lines.push({
        text: `${a.shares} 股 · 成本 ¥${formatCompact(a.cost)} · 浮盈 ${pnl >= 0 ? '+' : ''}${formatPct(pnlPct, 2)}`,
        emphasis: pnl >= 0 ? 'pos' : 'neg'
      });
    } else if (a.cost) {
      const pnl = a.balance - a.cost;
      const pnlPct = (pnl / a.cost) * 100;
      lines.push({
        text: `成本 ¥${formatCompact(a.cost)} · 浮盈 ${formatPct(pnlPct, 2)}`,
        emphasis: pnl >= 0 ? 'pos' : 'neg'
      });
    }
    if (a.dailyChangePct !== undefined && a.dailyChangePct !== 0) {
      lines.push({
        text: `今日 ${formatPct(a.dailyChangePct, 2)}`,
        emphasis: a.dailyChangePct >= 0 ? 'pos' : 'neg'
      });
    }
  }

  // 平台信息（如果有 platform 且没占太多行）
  if (a.platform && lines.length < 2) {
    lines.push({ text: a.platform, emphasis: 'muted' });
  }

  return lines.slice(0, 3);
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
  <button class="tap card-base !p-3 w-full text-left flex items-start gap-2.5"
          @click="emit('click')">
    <!-- 类型 chip 替代 icon（去 icon 节省空间）-->
    <div class="flex flex-col items-center shrink-0 pt-0.5">
      <span class="px-1.5 py-0.5 rounded text-[10px] font-700 whitespace-nowrap"
            :style="{ background: meta.color + '20', color: meta.color }">
        {{ meta.label }}
      </span>
    </div>

    <div class="flex-1 min-w-0 flex flex-col gap-1">
      <div class="flex items-start justify-between gap-2">
        <div class="font-700 text-[14px] leading-tight truncate">{{ asset.name }}</div>
        <div class="font-brand font-700 text-[15px] leading-none whitespace-nowrap shrink-0">
          ¥{{ mask(formatCompact(asset.balance)) }}
        </div>
      </div>

      <!-- 副信息（按 category 不同）-->
      <div v-if="infoLines.length" class="flex flex-col gap-0.5">
        <div v-for="(line, i) in infoLines" :key="i"
             class="text-[11px] leading-tight truncate"
             :class="emphasisClass(line.emphasis)">
          {{ line.text }}
        </div>
      </div>
    </div>
  </button>
</template>
