<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAccountStore } from '../store/account';

const router = useRouter();
const accountStore = useAccountStore();
const billing = ref<'month' | 'year'>('year');

onMounted(() => { void accountStore.refresh(); });

interface Plan {
  key: 'free' | 'plus' | 'pro' | 'max' | 'studio';
  name: string;
  tagline: string;
  // 价格：null = 不展示该计价周期
  priceMonth: number | null;
  priceYear: number | null;
  oneTime?: number;
  oneTimeNote?: string;
  yearSaving?: string;
  highlight?: boolean;
  ocr: number | string;
  analysis: number | string;
  models: string;
  crossN: string;
  reports: string;
  notes?: string[];
  ctaPrimary?: boolean;
}

const plans = computed<Plan[]>(() => [
  {
    key: 'free', name: 'Free', tagline: '试用 · 0 门槛',
    priceMonth: 0, priceYear: 0,
    ocr: 30, analysis: 5,
    models: '单模型 V3', crossN: '不支持',
    reports: '不含'
  },
  {
    key: 'plus', name: 'Plus', tagline: '轻度记账 · 省事派',
    priceMonth: 9.9, priceYear: 98,
    yearSaving: '省 19%（≈ 2 个月免费）',
    ocr: 300, analysis: 30,
    models: '单模型 V3', crossN: '不支持',
    reports: '季度复盘 PDF'
  },
  {
    key: 'pro', name: 'Pro', tagline: '中度玩家 · 主推',
    priceMonth: 25, priceYear: 228,
    yearSaving: '省 24%（≈ 3 个月免费）',
    highlight: true,
    ocr: 1500, analysis: 80,
    models: 'R1 + 可选 V3', crossN: 'N=2（80 次中前 30 次）',
    reports: '季度 + 年度',
    ctaPrimary: true
  },
  {
    key: 'max', name: 'Max', tagline: '高净值 · 顶配',
    priceMonth: 59, priceYear: 528,
    yearSaving: '省 25%（≈ 3 个月免费）',
    ocr: 5000, analysis: '300（软上限）',
    models: 'R1 + Qwen-Max + V3', crossN: 'N=3 → N=2 → 限速',
    reports: '月 + 季 + 年',
    notes: ['高级目标规划（税务 / 汇率 / 多情景）', '新模型首发体验']
  },
  {
    key: 'studio', name: 'Studio', tagline: '极客 / 控制欲 · 一次买断',
    priceMonth: null, priceYear: null,
    oneTime: 199, oneTimeNote: '+ ¥29/年 维护订阅（可选）',
    ocr: '自配额上限', analysis: '自配额上限',
    models: '自定义模型链', crossN: '自由 N=1/2/3',
    reports: '月 + 季 + 年',
    notes: ['BYOK：用你自己的 API Key', '14 天试用全功能', '4 年后自动转 AGPL（许可证条款）']
  }
]);

const tierLabel: Record<string, string> = {
  free: 'Free', plus: 'Plus', pro: 'Pro', max: 'Max', studio: 'Studio'
};

function isCurrent(key: string): boolean {
  return accountStore.isAuthed && accountStore.tier === key;
}

function priceLine(p: Plan): string {
  if (p.oneTime !== undefined) return `¥${p.oneTime} 一次性`;
  if (p.priceMonth === 0) return '永久免费';
  if (billing.value === 'year' && p.priceYear !== null) return `¥${p.priceYear}/年`;
  if (p.priceMonth !== null) return `¥${p.priceMonth}/月`;
  return '—';
}

function pricePerMonth(p: Plan): string | null {
  if (p.priceMonth === 0 || p.oneTime !== undefined) return null;
  if (billing.value === 'year' && p.priceYear !== null && p.priceYear > 0) {
    return `折合 ¥${(p.priceYear / 12).toFixed(1)}/月`;
  }
  return null;
}

function ctaLabel(p: Plan): string {
  if (isCurrent(p.key)) return '当前档位';
  if (p.key === 'free') return accountStore.isAuthed ? '已包含' : '直接使用';
  if (p.key === 'studio') return '联系作者购买';
  return '升级到 ' + p.name;
}

function onCta(p: Plan) {
  if (isCurrent(p.key)) return;
  if (p.key === 'free') {
    if (!accountStore.isAuthed) router.push('/auth/login');
    return;
  }
  // Sprint 3 Day 1：所有付费档暂时都跳「联系作者」 fallback；Day 4 加邮件 + 收款码 modal
  alert(`升级 ${p.name}\n\n商业化通道正在搭建（自动支付 Sprint 3 Day 4 上线）。\n暂时请联系作者：huoqilei.hql@alibaba-inc.com\n附上邮箱 + 想升级的档位 + 月/年付，作者人工开通。`);
}
</script>

<template>
  <div class="px-5 pt-12 pb-12 flex flex-col gap-5">
    <button
      class="tap inline-flex items-center gap-1 text-ink-muted text-sm w-fit"
      @click="router.back()"
    >
      <span class="i-ph-caret-left-bold text-base" />
      返回
    </button>

    <header>
      <h1 class="font-brand font-600 text-2xl">订阅档位</h1>
      <p class="text-xs text-ink-muted mt-1">
        平台代付：免去自申 API Key 麻烦 · Studio：自带 Key 极致控制 ·
        <span class="font-600 text-ink">永不存任何资产数据</span>
      </p>
    </header>

    <!-- 月/年 切换 -->
    <div class="flex items-center gap-2 self-start p-1 rounded-icon bg-brand/8">
      <button
        class="tap px-3 py-1.5 rounded text-[12px] font-700 transition-all"
        :class="billing === 'month' ? 'bg-card shadow-sm' : 'text-ink-muted'"
        @click="billing = 'month'"
      >按月</button>
      <button
        class="tap px-3 py-1.5 rounded text-[12px] font-700 transition-all"
        :class="billing === 'year' ? 'bg-card shadow-sm' : 'text-ink-muted'"
        @click="billing = 'year'"
      >按年 · 省 19-25%</button>
    </div>

    <!-- 已登录态：当前档位提示 -->
    <div v-if="accountStore.isAuthed" class="text-[12px] text-ink-muted px-1">
      你当前是 <span class="font-700 text-brand">{{ tierLabel[accountStore.tier] }}</span> 档
    </div>

    <!-- 档位卡列表 -->
    <section class="flex flex-col gap-3">
      <article
        v-for="p in plans"
        :key="p.key"
        class="card-base relative"
        :class="[
          p.highlight ? 'border-2 !border-brand' : '',
          isCurrent(p.key) ? 'bg-brand/5' : ''
        ]"
      >
        <span
          v-if="p.highlight"
          class="absolute -top-2.5 left-4 px-2 py-0.5 rounded text-[10px] font-700 bg-brand text-white"
        >🔥 多数人选</span>
        <span
          v-if="isCurrent(p.key)"
          class="absolute -top-2.5 right-4 px-2 py-0.5 rounded text-[10px] font-700 bg-pos text-white"
        >当前</span>

        <div class="flex items-baseline justify-between gap-3">
          <div class="min-w-0">
            <div class="font-brand font-700 text-lg">{{ p.name }}</div>
            <div class="text-[11px] text-ink-muted mt-0.5">{{ p.tagline }}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-700 text-base">{{ priceLine(p) }}</div>
            <div v-if="pricePerMonth(p)" class="text-[10px] text-ink-muted mt-0.5">
              {{ pricePerMonth(p) }}
            </div>
            <div v-if="p.oneTimeNote" class="text-[10px] text-ink-muted mt-0.5">
              {{ p.oneTimeNote }}
            </div>
            <div v-if="billing === 'year' && p.yearSaving" class="text-[10px] text-pos mt-0.5">
              {{ p.yearSaving }}
            </div>
          </div>
        </div>

        <div class="mt-3 pt-3 border-t border-line text-[12px] space-y-1.5">
          <div class="flex justify-between gap-3">
            <span class="text-ink-muted">截图识别 / 月</span>
            <span class="font-600 tabular-nums">{{ p.ocr }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-ink-muted">AI 分析 / 月</span>
            <span class="font-600 tabular-nums">{{ p.analysis }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-ink-muted">默认模型</span>
            <span class="font-600 text-right">{{ p.models }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-ink-muted">交叉验证</span>
            <span class="font-600 text-right">{{ p.crossN }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-ink-muted">复盘报告</span>
            <span class="font-600 text-right">{{ p.reports }}</span>
          </div>
          <ul v-if="p.notes" class="pt-1 space-y-1">
            <li v-for="n in p.notes" :key="n" class="flex gap-1.5 text-ink-muted">
              <span class="i-ph-check-bold text-brand text-[10px] mt-1 shrink-0" />
              <span>{{ n }}</span>
            </li>
          </ul>
        </div>

        <button
          class="tap mt-4 w-full py-2.5 rounded-lg font-700 text-[13px] transition-colors"
          :class="isCurrent(p.key)
            ? 'bg-line/40 text-ink-muted cursor-not-allowed'
            : p.ctaPrimary
              ? 'bg-brand text-white'
              : 'border border-line bg-card'"
          :disabled="isCurrent(p.key)"
          @click="onCta(p)"
        >
          {{ ctaLabel(p) }}
        </button>
      </article>
    </section>

    <p class="text-[10px] text-ink-muted text-center mt-2 leading-relaxed">
      AI 输出仅供个人参考，不构成投资建议<br />
      4 年后所有源码自动转 AGPL-3.0，详见
      <button class="underline text-brand" @click="router.push('/about')">关于</button>
    </p>
  </div>
</template>
