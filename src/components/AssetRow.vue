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

interface InfoLine {
  text: string;
  emphasis?: 'pos' | 'neg' | 'orange' | 'muted' | 'ink';
  /** 是否右对齐放到副行右侧（如收益、到期日，单独一栏） */
  right?: boolean;
}

const infoLines = computed<InfoLine[]>(() => {
  const a = props.asset;
  const lines: InfoLine[] = [];

  if (a.category === 'deposit' || a.category === 'wealth') {
    // 第 1 行：年限 · 利率
    if (a.termMonths || a.interestRate) {
      const parts: string[] = [];
      if (a.termMonths) {
        parts.push(a.termMonths >= 12 && a.termMonths % 12 === 0
          ? `${a.termMonths / 12} 年`
          : `${a.termMonths} 个月`);
      }
      if (a.interestRate) parts.push(`年化 ${a.interestRate}%`);
      lines.push({ text: parts.join(' · '), emphasis: 'ink' });
    }
    // 第 2 行：到期日 + 倒计时
    const matDate = computeMaturityDate(a);
    if (matDate) {
      const days = daysToMaturity(a);
      const tail = days !== null ? (days === 0 ? '已到期' : `还剩 ${days} 天`) : '';
      lines.push({
        text: `到期 ${matDate}${tail ? ` · ${tail}` : ''}`,
        emphasis: days !== null && days <= 30 ? 'orange' : 'muted'
      });
    }
    // 第 3 行：到期收益（突出显示）
    const profit = computeMaturityProfit(a);
    if (profit && profit > 0) {
      lines.push({ text: `到期收益 +¥${mask(formatCompact(profit))}`, emphasis: 'pos' });
    }
    // 平台兜底
    if (lines.length === 0 && a.platform) {
      lines.push({ text: a.platform, emphasis: 'muted' });
    }
  } else if (a.category === 'fund') {
    // 第 1 行：累计收益（金额 + 百分比）
    const ret = fundReturnAbs(a);
    const retPct = fundReturnPct(a);
    if (ret !== null) {
      const text = retPct !== null
        ? `累计 ${ret >= 0 ? '+' : ''}¥${mask(formatCompact(Math.abs(ret)))} (${formatPct(retPct, 2)})`
        : `累计 ${ret >= 0 ? '+' : ''}¥${mask(formatCompact(Math.abs(ret)))}`;
      lines.push({ text, emphasis: ret >= 0 ? 'pos' : 'neg' });
    }
    // 第 2 行：年化 + 当日
    const tail2: string[] = [];
    if (a.annualizedReturn !== undefined) tail2.push(`年化 ${formatPct(a.annualizedReturn, 2)}`);
    if (a.dailyChangePct !== undefined && a.dailyChangePct !== 0) tail2.push(`今日 ${formatPct(a.dailyChangePct, 2)}`);
    if (tail2.length) {
      const positive = (a.annualizedReturn ?? 1) >= 0 && (a.dailyChangePct ?? 1) >= 0;
      lines.push({ text: tail2.join(' · '), emphasis: positive ? 'muted' : 'muted' });
    }
    if (a.platform && lines.length < 2) {
      lines.push({ text: a.platform, emphasis: 'muted' });
    }
  } else if (a.category === 'stock') {
    // 第 1 行：成本 + 浮盈
    if (a.cost) {
      const pnl = a.balance - a.cost;
      const pnlPct = (pnl / a.cost) * 100;
      const sharesPart = a.shares ? `${a.shares} 股 · ` : '';
      lines.push({
        text: `${sharesPart}成本 ¥${mask(formatCompact(a.cost))} · 浮盈 ${pnl >= 0 ? '+' : ''}¥${mask(formatCompact(Math.abs(pnl)))} (${formatPct(pnlPct, 2)})`,
        emphasis: pnl >= 0 ? 'pos' : 'neg'
      });
    }
    // 第 2 行：今日
    if (a.dailyChangePct !== undefined && a.dailyChangePct !== 0) {
      lines.push({
        text: `今日 ${formatPct(a.dailyChangePct, 2)}${a.tickerSymbol ? ` · ${a.tickerSymbol}` : ''}`,
        emphasis: a.dailyChangePct >= 0 ? 'pos' : 'neg'
      });
    } else if (a.platform) {
      lines.push({ text: a.platform, emphasis: 'muted' });
    }
  } else {
    // 现金/房产/保险/借出/其他：平台 / 备注
    if (a.platform) lines.push({ text: a.platform, emphasis: 'muted' });
    if (a.note && lines.length < 2) lines.push({ text: a.note, emphasis: 'muted' });
  }

  return lines.slice(0, 3);
});

const emphasisClass = (e?: string) => {
  switch (e) {
    case 'pos': return 'text-pos';
    case 'neg': return 'text-neg';
    case 'orange': return 'text-orange';
    case 'ink': return 'text-ink';
    default: return 'text-ink-muted';
  }
};
</script>

<template>
  <button class="tap card-base !p-3 w-full text-left flex flex-col gap-1.5"
          @click="emit('click')">
    <!-- 主行：chip 内嵌名称前 + 金额 -->
    <div class="flex items-center gap-2">
      <span class="px-1.5 h-4.5 inline-flex items-center rounded text-[10px] font-700 shrink-0"
            :style="{ background: meta.color + '20', color: meta.color }">
        {{ meta.label }}
      </span>
      <span class="flex-1 min-w-0 font-700 text-[14px] leading-tight truncate">
        {{ asset.name }}
      </span>
      <span class="font-brand font-700 text-[15px] leading-none whitespace-nowrap shrink-0">
        ¥{{ mask(formatCompact(asset.balance)) }}
      </span>
    </div>

    <!-- 副信息：与左 chip 对齐缩进 -->
    <div v-if="infoLines.length" class="flex flex-col gap-0.5 ml-0">
      <div v-for="(line, i) in infoLines" :key="i"
           class="text-[11px] leading-tight"
           :class="[emphasisClass(line.emphasis), line.right ? 'text-right' : '']">
        {{ line.text }}
      </div>
    </div>
  </button>
</template>
