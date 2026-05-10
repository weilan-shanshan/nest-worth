<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../store/assets';
import { db, updateAnalystConfig } from '../db';
import { MODEL_CHAIN, ANALYST_CHAIN, resetExhaustedModels, setPreferredModel } from '../lib/recognize';
import { clearAdviceCache } from '../lib/advisor';

const router = useRouter();

const store = useAppStore();

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
const ensembleSize = computed({
  get: () => store.settings.ensembleSize || 1,
  set: (v) => {
    updateAnalystConfig({ ensembleSize: v }).then(() => store.refreshSettings());
    clearAdviceCache();   // 配置变了清缓存
  }
});

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

function toast(msg: string) {
  message.value = msg;
  setTimeout(() => (message.value = null), 1800);
}
</script>

<template>
  <div class="px-5 pt-12 flex flex-col gap-5">
    <header>
      <h1 class="font-brand font-600 text-2xl">设置</h1>
      <p class="text-xs text-ink-muted mt-1">数据全部保存在本设备 IndexedDB，不上传任何服务器</p>
    </header>

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

    <!-- API Key -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-key-duotone text-brand text-lg" />
        <h3 class="font-700 text-[15px]">Qwen-VL API Key</h3>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3">
        用于截图识别。<a href="https://bailian.console.aliyun.com/" target="_blank" class="text-brand underline">阿里云百炼控制台</a> 申请，按量付费，¥0.004/张。
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
                  class="tap flex-1 h-9 rounded-icon text-xs font-700 border transition-all"
                  :class="ensembleSize === n
                    ? 'bg-brand text-white border-brand'
                    : 'bg-card border-border text-ink-muted'"
                  @click="ensembleSize = n">
            <div>{{ n === 1 ? '单模型' : n === 2 ? '2 模型' : '3 模型' }}</div>
            <div class="text-[9px] mt-0.5 font-400 opacity-80">
              {{ n === 1 ? '最快 / 1×成本' : n === 2 ? '推荐 / 3×成本' : '严谨 / 4×成本' }}
            </div>
          </button>
        </div>
        <div v-if="ensembleSize > 1" class="mt-2 text-[10px] text-ink-muted leading-relaxed">
          ✨ 前 {{ ensembleSize }} 个启用模型并行回答 → 第 {{ ensembleSize + 1 }} 次调用让最强模型综合 → 输出最终方案
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
            <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  :style="{ transform: m.enabled ? 'translateX(18px)' : 'translateX(2px)' }" />
          </button>
        </div>
      </div>

      <button class="tap mt-3 w-full h-9 rounded-icon border border-border text-[11px] text-ink-muted font-600"
              @click="resetAnalystConfig">
        恢复默认顺序和启用
      </button>
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
        <span class="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform"
              :style="{ transform: store.settings.privacyMode ? 'translateX(22px)' : 'translateX(2px)' }" />
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
        本地优先，零服务器存储。<br/>
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
