<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store/assets';
import { useAccountStore } from '../store/account';
import { db, updateAnalystConfig, updateSettings } from '../db';
import { MODEL_CHAIN, ANALYST_CHAIN, resetExhaustedModels, setPreferredModel } from '../lib/recognize';
import { clearAdviceCache } from '../lib/advisor';
import InstallEntryCard from '../components/InstallEntryCard.vue';
import QuotaBar from '../components/QuotaBar.vue';
import { pickLlmMode } from '../lib/llm-client';
import { isQuoteProxyConfigured } from '../lib/quotes';
import { trackCta } from '../lib/analytics';
import type { DeriveMode } from '../types';

const router = useRouter();

const store = useAppStore();
const accountStore = useAccountStore();

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  studio: 'Studio'
};

const tierLabel = computed(() => TIER_LABEL[accountStore.tier] ?? 'Free');
const periodEnd = computed(() => {
  const raw = accountStore.me?.currentPeriodEnd;
  if (!raw) return null;
  try { return new Date(raw).toISOString().slice(0, 10); }
  catch { return null; }
});

onMounted(() => {
  // Sprint 0: 仅在已存 JWT 的设备上拉一次状态；无 JWT 时静默不发请求
  void accountStore.refresh();
});

const apiKey = ref(store.settings.apiKey || '');
const showKey = ref(false);
const saved = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const message = ref<string | null>(null);

async function saveKey() {
  await store.setApiKey(apiKey.value.trim());
  saved.value = true;
  setTimeout(() => (saved.value = false), 1500);
}

async function exportData() {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nestworth-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出备份文件');
}

async function importData(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    if (!confirm('导入会覆盖当前所有数据，确认继续？')) return;
    await store.importAll(data);
    toast('导入成功');
  } catch (err: any) {
    toast(err.message || '导入失败');
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function clearAll() {
  if (!confirm('真的要清空全部资产/快照/目标吗？此操作不可撤销。')) return;
  await db.assets.clear();
  await db.snapshots.clear();
  await db.goals.clear();
  await store.load();
  toast('已清空');
}

const exhaustedSet = computed(() => new Set(store.settings.exhaustedModels || []));
const availableCount = computed(() => MODEL_CHAIN.length - exhaustedSet.value.size);

async function pickPreferred(name: string) {
  const next = store.settings.preferredModel === name ? undefined : name;
  await setPreferredModel(next);
  await store.refreshSettings();
  toast(next ? '已设为首选' : '已清除首选');
}

async function resetExhausted() {
  await resetExhaustedModels();
  await store.refreshSettings();
  toast('已重置，下次识别将重试全部模型');
}

/* ============== 理财分析模型配置 ============== */

const orderedAnalysts = computed(() => {
  const order = store.settings.analystModelOrder || [];
  const enabled = store.settings.analystEnabled || {};
  const list = [...ANALYST_CHAIN];
  // 按用户排序
  if (order.length) {
    list.sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return list.map(m => ({
    ...m,
    enabled: enabled[m.name] !== false
  }));
});

const enabledAnalystCount = computed(() => orderedAnalysts.value.filter(m => m.enabled).length);

// proxy 模式下按 tier 限制 ensembleSize 上限；BYOK / Studio 不限
const ensembleMaxN = computed(() => {
  if (pickLlmMode() === 'byok') return 3;
  const t = accountStore.tier;
  if (t === 'free' || t === 'plus') return 1;
  if (t === 'pro') return 2;
  return 3;
});

const ensembleSize = computed({
  get: () => Math.min(ensembleMaxN.value, store.settings.ensembleSize || 1),
  set: (v) => {
    const clamped = Math.max(1, Math.min(ensembleMaxN.value, v));
    updateAnalystConfig({ ensembleSize: clamped }).then(() => store.refreshSettings());
    clearAdviceCache();   // 配置变了清缓存
  }
});

// 当切到代付模式 / 退档后，把 IndexedDB 里残留的高档值自动 clamp 回 store
watch(ensembleMaxN, (mx) => {
  if ((store.settings.ensembleSize || 1) > mx) {
    updateAnalystConfig({ ensembleSize: mx }).then(() => store.refreshSettings());
    clearAdviceCache();
  }
}, { immediate: true });

async function toggleAnalyst(name: string, on: boolean) {
  const next = { ...(store.settings.analystEnabled || {}), [name]: on };
  await updateAnalystConfig({ analystEnabled: next });
  await store.refreshSettings();
  await clearAdviceCache();
}

async function moveAnalyst(name: string, dir: -1 | 1) {
  const list = orderedAnalysts.value.map(m => m.name);
  const idx = list.indexOf(name);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= list.length) return;
  [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
  await updateAnalystConfig({ analystModelOrder: list });
  await store.refreshSettings();
  await clearAdviceCache();
}

async function resetAnalystConfig() {
  if (!confirm('恢复默认顺序和全部启用？')) return;
  await updateAnalystConfig({
    analystModelOrder: ANALYST_CHAIN.map(m => m.name),
    analystEnabled: Object.fromEntries(ANALYST_CHAIN.map(m => [m.name, true])),
    ensembleSize: 1
  });
  await store.refreshSettings();
  await clearAdviceCache();
  toast('已恢复默认');
}

function ratingDots(n: number) {
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

const tickerCount = computed(() => store.assets.filter(a => a.tickerSymbol && a.tickerType !== 'none').length);
const proxyOn = isQuoteProxyConfigured();
const lastQuoteAt = computed(() => store.quotesLastResult?.at);

async function manualRefreshQuotes() {
  trackCta('refresh_quotes');
  const r = await store.refreshQuotes();
  toast(`已刷新 ${r.updated} 项${r.skipped ? ` · ${r.skipped} 项失败` : ''}`);
}

function formatRel(ts?: number) {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)} 小时前`;
  return `${Math.round(diff / 86400_000)} 天前`;
}

/* ============== 派生计算模式 ============== */

const deriveMode = computed<DeriveMode>(() => store.settings.deriveMode || 'batch');

async function setDeriveMode(mode: DeriveMode) {
  await updateSettings({ deriveMode: mode });
  await store.refreshSettings();
  toast(mode === 'batch' ? '已切换：整库一次 LLM' : '已切换：每条并发 LLM');
}

async function manualRecomputeDerived() {
  trackCta('recompute_derived');
  await store.recomputeDerived();
  toast('派生数据已重算');
}

function toast(msg: string) {
  message.value = msg;
  setTimeout(() => (message.value = null), 1800);
}
</script>

<template>
  <div class="px-5 pt-12 flex flex-col gap-5">
    <header>
      <h1 class="font-brand font-600 text-2xl">设置</h1>
      <p class="text-xs text-ink-muted mt-1">个人资产数据 100% 本地，绝不上传服务器</p>
    </header>

    <!-- 安装到主屏（PWA 入口） -->
    <InstallEntryCard />

    <!-- 账号 · Sprint 0 状态卡（登录交互流 Sprint 1 上线） -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-user-circle-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">账号</h3>
      </div>
      <div v-if="accountStore.isAuthed">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="min-w-0">
            <div class="text-[13px] font-600">{{ tierLabel }}</div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              <span v-if="accountStore.me?.status === 'trialing'">试用中</span>
              <span v-else>{{ accountStore.me?.status === 'active' ? '订阅中' : accountStore.me?.status }}</span>
              <span v-if="periodEnd"> · 到期 {{ periodEnd }}</span>
            </div>
          </div>
          <button
            class="tap text-[11px] text-ink-muted px-2.5 py-1 rounded border border-line"
            @click="accountStore.signOut()"
          >
            退出
          </button>
        </div>

        <!-- 当月配额进度条 -->
        <div v-if="accountStore.quota" class="space-y-2.5 pt-2.5 border-t border-line">
          <QuotaBar
            label="截图识别"
            :used="accountStore.quota.ocr.used"
            :quota="accountStore.quota.ocr.quota"
          />
          <QuotaBar
            label="AI 分析"
            :used="accountStore.quota.analysis.used"
            :quota="accountStore.quota.analysis.quota"
          />
          <div class="text-[10px] text-ink-muted">
            本月配额 · {{ accountStore.quota.periodStart }} 起算 · 每月 1 号刷新
          </div>
        </div>
      </div>
      <div v-else>
        <div class="flex items-center justify-between gap-3 mb-2">
          <div class="text-[13px] font-600">Free · 未登录</div>
          <button
            class="tap text-[12px] font-600 px-3 py-1.5 rounded bg-brand text-white"
            @click="router.push('/auth/login')"
          >
            登录
          </button>
        </div>
        <div class="text-[11px] text-ink-muted leading-relaxed">
          商业化档位（Plus / Pro / Max / Studio）即将上线；登录后才能使用平台代付的 LLM 配额、复盘 PDF 等服务。
          账号只存订阅状态，<span class="font-600 text-ink">永不存任何资产数据</span>。
        </div>
      </div>
    </section>

    <!-- 使用说明（顶置入口）-->
    <button
      class="tap rounded-card p-4 text-left bg-gradient-to-br from-brand to-brand-600 text-white shadow-[0_8px_24px_rgba(46,158,96,0.18)] flex items-center gap-3.5"
      @click="router.push('/about')"
    >
      <div class="w-11 h-11 rounded-icon bg-white/20 flex items-center justify-center shrink-0">
        <span class="i-ph-book-open-text-duotone text-2xl" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-brand font-700 text-base leading-tight">了解 Nestworth 怎么帮你</div>
        <div class="text-[11px] opacity-85 mt-0.5 leading-relaxed">
          一屏总览 · 截图秒识 · 推理 AI · 多模型交叉验证 · 100% 本地
        </div>
      </div>
      <span class="i-ph-caret-right-bold text-base opacity-70 shrink-0" />
    </button>

    <!-- API Key 状态卡 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-key-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">Qwen-VL API Key</h3>
        <span v-if="store.hasApiKey"
              class="ml-auto inline-flex items-center gap-1 px-2 h-5 rounded-full bg-pos/15 text-pos text-[10px] font-700">
          <span class="i-ph-check-circle-duotone" />已配置
        </span>
        <span v-else
              class="ml-auto inline-flex items-center gap-1 px-2 h-5 rounded-full bg-orange/15 text-orange text-[10px] font-700">
          <span class="i-ph-warning-circle-duotone" />未配置
        </span>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        用于截图识别 + AI 理财分析。如果不会申请，
        <button class="text-brand font-700 underline" @click="router.push({ path: '/setup-key', query: { from: '/settings' } })">
          看保姆级引导 →
        </button>
      </p>
      <div class="relative">
        <input
          v-model="apiKey"
          :type="showKey ? 'text' : 'password'"
          placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
          class="w-full h-11 pl-3 pr-20 rounded-icon bg-bg border border-border text-sm focus:border-brand focus:bg-white outline-none transition-colors font-mono"
        />
        <button class="absolute right-2 top-1/2 -translate-y-1/2 px-2 h-7 text-[11px] text-ink-muted tap"
                @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
      </div>
      <button class="tap mt-3 w-full h-11 rounded-icon bg-brand text-white font-600 text-sm relative"
              @click="saveKey">
        {{ saved ? '已保存' : '保存' }}
      </button>
    </section>

    <!-- 理财分析模型 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-1">
        <span class="i-ph-brain-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">理财分析模型</h3>
        <span class="ml-auto text-[11px] text-ink-muted">{{ enabledAnalystCount }} 启用</span>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        分析（走势 / 目标）使用的模型链。可启用/禁用、调整顺序，或开启<b class="text-brand">交叉验证</b>用多个模型综合答案提升可信度。
      </p>

      <!-- 交叉验证档位 -->
      <div class="mb-3 p-2.5 rounded-icon bg-brand/8">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-700">每次交叉验证模型数</span>
          <span class="text-[11px] text-brand font-700">N = {{ ensembleSize }}</span>
        </div>
        <div class="flex gap-1.5">
          <button v-for="n in 3" :key="n"
                  :disabled="n > ensembleMaxN"
                  :title="n > ensembleMaxN ? `当前档位最高 N=${ensembleMaxN}，升级解锁` : ''"
                  class="tap flex-1 h-9 rounded-icon text-xs font-700 border transition-all"
                  :class="n > ensembleMaxN
                    ? 'bg-line/30 border-line text-ink-muted/40 cursor-not-allowed'
                    : ensembleSize === n
                      ? 'bg-brand text-white border-brand'
                      : 'bg-card border-border text-ink-muted'"
                  @click="n <= ensembleMaxN && (ensembleSize = n)">
            <div>{{ n === 1 ? '单模型' : n === 2 ? '2 模型' : '3 模型' }}</div>
            <div class="text-[9px] mt-0.5 font-400 opacity-80">
              {{ n === 1 ? '最快 / 1×成本' : n === 2 ? '推荐 / 3×成本' : '严谨 / 4×成本' }}
            </div>
          </button>
        </div>
        <div v-if="ensembleSize > 1" class="mt-2 text-[10px] text-ink-muted leading-relaxed">
          ✨ 前 {{ ensembleSize }} 个启用模型并行回答 → 第 {{ ensembleSize + 1 }} 次调用让最强模型综合 → 输出最终方案
        </div>
        <!-- proxy 模式且非顶档 → 提示升级路径 -->
        <div v-if="ensembleMaxN < 3 && accountStore.isAuthed" class="mt-2 text-[10px] text-ink-muted leading-relaxed">
          <span v-if="ensembleMaxN === 1">当前 {{ tierLabel }} 档仅支持 N=1，升级 <b class="text-brand">Pro</b> 解锁 N=2，<b class="text-brand">Max</b> 解锁 N=3</span>
          <span v-else>当前 {{ tierLabel }} 档支持 N=1/2，升级 <b class="text-brand">Max</b> 解锁 N=3</span>
        </div>
      </div>

      <!-- 模型列表 -->
      <div class="flex flex-col gap-1.5">
        <div v-for="(m, i) in orderedAnalysts" :key="m.name"
             class="flex items-center gap-2 px-2 py-2 rounded-icon transition-colors"
             :class="m.enabled ? 'bg-bg' : 'bg-bg/40 opacity-50'">
          <!-- 序号 + 启用标识 -->
          <button class="tap w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-700 shrink-0"
                  :class="m.enabled
                    ? (i < ensembleSize ? 'bg-brand text-white' : 'bg-brand/20 text-brand')
                    : 'bg-ink-muted/15 text-ink-muted'"
                  @click="toggleAnalyst(m.name, !m.enabled)">
            {{ i + 1 }}
          </button>

          <!-- 模型信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-700 text-[12px]">{{ m.label }}</span>
              <span v-if="m.enabled && i < ensembleSize" class="px-1.5 h-3.5 inline-flex items-center rounded bg-brand text-white text-[8px] font-700">
                参与本次
              </span>
            </div>
            <div class="text-[10px] text-ink-muted truncate">{{ m.desc }}</div>
            <div class="flex gap-2 mt-0.5 text-[9px] text-ink-muted font-mono">
              <span>质量 <span class="text-pos">{{ ratingDots(m.quality) }}</span></span>
              <span>速度 <span class="text-blue">{{ ratingDots(m.speed) }}</span></span>
              <span>性价比 <span class="text-orange">{{ ratingDots(m.cost) }}</span></span>
            </div>
          </div>

          <!-- 排序按钮 -->
          <div class="flex flex-col gap-0.5 shrink-0">
            <button class="tap w-6 h-5 rounded text-ink-muted disabled:opacity-30"
                    :disabled="i === 0"
                    @click="moveAnalyst(m.name, -1)">
              <span class="i-ph-caret-up-bold text-[10px]" />
            </button>
            <button class="tap w-6 h-5 rounded text-ink-muted disabled:opacity-30"
                    :disabled="i === orderedAnalysts.length - 1"
                    @click="moveAnalyst(m.name, 1)">
              <span class="i-ph-caret-down-bold text-[10px]" />
            </button>
          </div>

          <!-- 启用 toggle -->
          <button class="tap w-9 h-5 rounded-full transition-colors relative shrink-0"
                  :class="m.enabled ? 'bg-brand' : 'bg-border'"
                  @click="toggleAnalyst(m.name, !m.enabled)">
            <span class="absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  :style="{ transform: m.enabled ? 'translateX(18px)' : 'translateX(2px)' }" />
          </button>
        </div>
      </div>

      <button class="tap mt-3 w-full h-9 rounded-icon border border-border text-[11px] text-ink-muted font-600"
              @click="resetAnalystConfig">
        恢复默认顺序和启用
      </button>
    </section>

    <!-- 派生数据计算 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-calculator-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">派生数据计算</h3>
        <span class="ml-auto text-[10px] text-ink-muted">
          上次 {{ formatRel(store.settings.derivedAllAt) }}
        </span>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        收益、距到期天数、年化、浮盈等<b class="text-brand">全部由 AI 自动计算</b>，绝不让你自己算。
        每次打开 app 若超过 12 小时未算会自动重算；也可手动触发。
      </p>

      <div class="mb-3 p-2.5 rounded-icon bg-brand/8">
        <div class="text-[11px] font-700 mb-1.5">计算模式</div>
        <div class="flex gap-1.5">
          <button
            class="tap flex-1 h-12 rounded-icon text-xs font-700 border transition-all"
            :class="deriveMode === 'batch'
              ? 'bg-brand text-white border-brand'
              : 'bg-card border-border text-ink-muted'"
            @click="setDeriveMode('batch')"
          >
            <div>整库一次</div>
            <div class="text-[9px] mt-0.5 font-400 opacity-80">省 token / 默认</div>
          </button>
          <button
            class="tap flex-1 h-12 rounded-icon text-xs font-700 border transition-all"
            :class="deriveMode === 'parallel'
              ? 'bg-brand text-white border-brand'
              : 'bg-card border-border text-ink-muted'"
            @click="setDeriveMode('parallel')"
          >
            <div>每条并发</div>
            <div class="text-[9px] mt-0.5 font-400 opacity-80">更稳 / 多 token</div>
          </button>
        </div>
      </div>

      <button class="tap w-full h-10 rounded-icon bg-brand text-white text-[13px] font-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
              :disabled="store.deriving.running || !store.hasApiKey"
              @click="manualRecomputeDerived">
        <span :class="store.deriving.running ? 'i-ph-spinner-gap-bold animate-spin' : 'i-ph-arrows-clockwise-bold'" class="text-base" />
        {{ store.deriving.running ? '正在重算…' : '立即重算所有派生数据' }}
      </button>
      <div v-if="store.deriving.lastModelUsed" class="text-[10px] text-ink-muted mt-1.5 text-center">
        模型：{{ store.deriving.lastModelUsed }}
        <span v-if="store.deriving.lastLlmFailed" class="text-orange ml-1">（LLM 失败已用兜底公式）</span>
      </div>
    </section>

    <!-- 自动行情同步 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-currency-circle-dollar-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">自动行情同步</h3>
        <span class="ml-auto inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-700"
              :class="proxyOn ? 'bg-pos/15 text-pos' : 'bg-orange/15 text-orange'">
          <span :class="proxyOn ? 'i-ph-check-circle-duotone' : 'i-ph-warning-circle-duotone'" />
          {{ proxyOn ? 'Worker 已配' : '未配 Worker' }}
        </span>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        给资产配「行情代码」后系统每天自动拉最新价 × 持仓数 = 余额。
        当前 <b class="text-brand">{{ tickerCount }}</b> 项资产已绑定代码 · 上次刷新 {{ formatRel(lastQuoteAt) }}
      </p>

      <button class="tap w-full h-10 rounded-icon bg-brand text-white text-[13px] font-700 flex items-center justify-center gap-1.5 mb-2 disabled:opacity-50"
              :disabled="store.quotesRefreshing"
              @click="manualRefreshQuotes">
        <span :class="store.quotesRefreshing ? 'i-ph-spinner-gap-bold animate-spin' : 'i-ph-arrows-clockwise-bold'" class="text-base" />
        {{ store.quotesRefreshing ? '刷新中…' : '立即刷新所有行情' }}
      </button>

      <div v-if="!proxyOn" class="bg-orange/8 rounded-icon p-2.5 text-[11px] leading-relaxed">
        <div class="font-700 text-orange mb-1">⚙️ 想自动拉 A 股 / 港股 / 美股 / 国内基金价</div>
        <div class="text-ink-muted">
          需要部署一个 Cloudflare Worker 代理（绕过 CORS）。
          <b class="text-ink">5 分钟搞定，免费</b>：
        </div>
        <ol class="text-ink-muted mt-1.5 ml-3 list-decimal space-y-0.5">
          <li>仓库的 <code class="font-mono text-[10px] bg-bg/60 px-1 rounded">worker/quotes-proxy.js</code> 整个粘到 CF Workers 部署</li>
          <li>拿到 Worker URL（如 https://xxx.workers.dev）</li>
          <li>CF Pages 项目环境变量加 <code class="font-mono text-[10px] bg-bg/60 px-1 rounded">VITE_QUOTE_PROXY=&lt;Worker URL&gt;</code></li>
          <li>Pages 触发 redeploy 即可</li>
        </ol>
      </div>
    </section>

    <!-- 识别模型链 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-1">
        <span class="i-ph-stack-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">识别模型链</h3>
        <span class="ml-auto text-[11px] text-ink-muted">{{ availableCount }} / {{ MODEL_CHAIN.length }} 可用</span>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        每个模型 100 万 token 免费额度（约 ¥0 / 500 张）。用完一个自动切下一个。点击设为首选，长按式优先调用。
      </p>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="(m, i) in MODEL_CHAIN" :key="m.name"
          class="tap flex items-center gap-2.5 py-2 px-2 rounded-icon text-left transition-colors"
          :class="store.settings.preferredModel === m.name ? 'bg-brand/10' : ''"
          @click="pickPreferred(m.name)"
        >
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-700 shrink-0"
               :class="exhaustedSet.has(m.name)
                 ? 'bg-ink-muted/15 text-ink-muted line-through'
                 : (store.settings.preferredModel === m.name ? 'bg-brand text-white' : 'bg-brand/15 text-brand')">
            {{ i + 1 }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-600 truncate"
                 :class="exhaustedSet.has(m.name) ? 'text-ink-muted line-through' : ''">
              {{ m.label }}
            </div>
            <div class="text-[10px] text-ink-muted font-mono truncate">{{ m.name }}</div>
          </div>
          <span v-if="store.settings.preferredModel === m.name"
                class="i-ph-star-fill text-orange text-sm shrink-0" />
          <span v-else-if="exhaustedSet.has(m.name)"
                class="text-[10px] text-ink-muted shrink-0">已用完</span>
        </button>
      </div>
      <button v-if="exhaustedSet.size"
              class="tap mt-3 w-full h-10 rounded-icon border border-border text-[13px] text-brand font-600"
              @click="resetExhausted">
        重置已耗尽（每月 1 号阿里云会自动刷新）
      </button>
    </section>

    <!-- 隐私模式 -->
    <section class="card-base flex items-center justify-between">
      <div>
        <div class="font-700 text-[14px]">隐私模式</div>
        <div class="text-[11px] text-ink-muted mt-0.5">隐藏所有金额数字</div>
      </div>
      <button
        class="tap w-12 h-7 rounded-full transition-colors relative"
        :class="store.settings.privacyMode ? 'bg-brand' : 'bg-border'"
        @click="store.setPrivacy(!store.settings.privacyMode)"
      >
        <span class="absolute top-0.5 left-0 w-6 h-6 bg-white rounded-full shadow transition-transform"
              :style="{ transform: store.settings.privacyMode ? 'translateX(22px)' : 'translateX(2px)' }" />
      </button>
    </section>

    <!-- 网站访问统计 -->
    <section class="card-base flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="font-700 text-[14px]">网站访问统计</div>
        <div class="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
          只统计<b class="text-ink">有多少人来用、点了哪些按钮、停留多久</b>，<br/>
          用来判断哪些功能受欢迎、哪里要改进。<b class="text-pos">绝不上传你的资产、金额、Key</b>。
        </div>
      </div>
      <button
        class="tap w-12 h-7 rounded-full transition-colors relative shrink-0 mt-0.5"
        :class="store.settings.analyticsEnabled !== false ? 'bg-brand' : 'bg-border'"
        @click="store.setAnalyticsEnabled(store.settings.analyticsEnabled === false)"
      >
        <span class="absolute top-0.5 left-0 w-6 h-6 bg-white rounded-full shadow transition-transform"
              :style="{ transform: store.settings.analyticsEnabled !== false ? 'translateX(22px)' : 'translateX(2px)' }" />
      </button>
    </section>

    <!-- 数据管理 -->
    <section class="card-base flex flex-col gap-1">
      <h3 class="font-700 text-[15px] mb-1">数据管理</h3>
      <button class="tap flex items-center gap-3 py-3 border-t border-border first:border-t-0" @click="exportData">
        <span class="i-ph-download-simple-duotone text-brand text-lg" />
        <div class="flex-1 text-left">
          <div class="text-sm font-600">导出备份</div>
          <div class="text-[11px] text-ink-muted">JSON 文件，建议存到 iCloud/网盘</div>
        </div>
        <span class="i-ph-caret-right-bold text-ink-muted text-xs" />
      </button>
      <button class="tap flex items-center gap-3 py-3 border-t border-border" @click="fileInput?.click()">
        <span class="i-ph-upload-simple-duotone text-brand text-lg" />
        <div class="flex-1 text-left">
          <div class="text-sm font-600">导入备份</div>
          <div class="text-[11px] text-ink-muted">将覆盖现有数据</div>
        </div>
        <span class="i-ph-caret-right-bold text-ink-muted text-xs" />
      </button>
      <button class="tap flex items-center gap-3 py-3 border-t border-border" @click="clearAll">
        <span class="i-ph-trash-duotone text-neg text-lg" />
        <div class="flex-1 text-left">
          <div class="text-sm font-600 text-neg">清空全部数据</div>
          <div class="text-[11px] text-ink-muted">不可撤销</div>
        </div>
      </button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importData" />
    </section>

    <!-- 关于 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-info-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">关于 Nestworth</h3>
      </div>
      <p class="text-xs text-ink-muted leading-relaxed">
        把分散在各处的资产汇总到一处。<br/>
        资产数据本地存储，不上传服务器。<br/>
        v0.1.0 · made with care
      </p>
    </section>

    <Transition name="fade">
      <div v-if="message" class="fixed bottom-24 left-1/2 -translate-x-1/2 bg-ink/90 text-white text-xs px-4 py-2 rounded-full">
        {{ message }}
      </div>
    </Transition>
  </div>
</template>
