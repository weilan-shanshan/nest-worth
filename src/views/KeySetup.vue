<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '../store/assets';
import { trackCta } from '../lib/analytics';

onMounted(() => trackCta('setup_key_start'));

const router = useRouter();
const route = useRoute();
const store = useAppStore();

const apiKey = ref(store.settings.apiKey || '');
const showKey = ref(false);
const verifying = ref(false);
const verifyResult = ref<'idle' | 'success' | 'fail'>('idle');
const verifyError = ref<string | null>(null);
const completedSteps = ref<Set<number>>(new Set());

const returnTo = computed(() => (route.query.from as string) || '/');

function markComplete(n: number) {
  completedSteps.value.add(n);
  completedSteps.value = new Set(completedSteps.value);
}

async function verifyAndSave() {
  const key = apiKey.value.trim();
  if (!key) {
    verifyResult.value = 'fail';
    verifyError.value = '请先粘贴 API Key';
    return;
  }
  if (!key.startsWith('sk-')) {
    verifyResult.value = 'fail';
    verifyError.value = 'Key 应该以 sk- 开头，请检查是否复制完整';
    return;
  }

  verifying.value = true;
  verifyResult.value = 'idle';
  verifyError.value = null;

  try {
    // 用最便宜的纯文本模型做 1 次最小调用验证 key
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      })
    });

    if (res.status === 401) {
      throw new Error('Key 无效（401 未授权）。请确认完整复制了 sk- 开头的字符串。');
    }
    if (res.status === 403) {
      throw new Error('Key 没有权限（403）。请确认已在百炼控制台开通服务。');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`百炼返回 ${res.status}：${text.slice(0, 150)}`);
    }
    const data = await res.json();
    if (!data?.choices) throw new Error('返回格式异常，可能 Key 不正确');

    // 验证通过 → 保存
    await store.setApiKey(key);
    trackCta('setup_key_done');
    verifyResult.value = 'success';
    setTimeout(() => router.push(returnTo.value), 1500);
  } catch (e: any) {
    verifyResult.value = 'fail';
    verifyError.value = e.message || '验证失败，请检查 Key 或网络';
  } finally {
    verifying.value = false;
  }
}

function skipForNow() {
  router.push(returnTo.value);
}
</script>

<template>
  <div class="px-4 pt-10 pb-6 flex flex-col gap-4">
    <!-- 顶栏 -->
    <header class="flex items-center gap-3">
      <button class="tap w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-ink-muted"
              @click="router.back()">
        <span class="i-ph-caret-left-bold text-base" />
      </button>
      <h1 class="font-brand font-600 text-xl">配置 AI</h1>
    </header>

    <!-- Hero -->
    <section class="rounded-card bg-gradient-to-br from-brand to-brand-600 text-white p-5 shadow-[0_12px_32px_rgba(46,158,96,0.25)]">
      <div class="flex items-center gap-2 mb-1">
        <span class="i-ph-rocket-launch-duotone text-xl" />
        <span class="font-700 text-sm">5 分钟开启完整 AI 能力</span>
      </div>
      <p class="text-[13px] opacity-90 leading-relaxed mt-2">
        Nestworth 的截图识别、持仓分析、目标方案都依赖一个 AI 模型 Key。<br/>
        阿里云百炼新用户每个模型送 100 万 token，够用很久 — <b>完全免费起步</b>。
      </p>
    </section>

    <!-- Step 1: 打开百炼 -->
    <section class="card-base !p-4">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-700 shrink-0"
             :class="completedSteps.has(1) ? 'bg-pos' : 'bg-brand'">
          <span v-if="completedSteps.has(1)" class="i-ph-check-bold text-sm" />
          <span v-else>1</span>
        </div>
        <h3 class="font-700 text-[14px]">打开阿里云百炼控制台</h3>
      </div>
      <p class="text-[12px] text-ink-muted leading-relaxed mb-2 ml-9">
        阿里云的官方大模型平台，国内可直连。
        没有阿里云账号会先弹出登录/注册（用支付宝/淘宝账号即可）。
      </p>
      <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener"
         class="tap ml-9 inline-flex items-center gap-1.5 px-3 h-9 rounded-icon bg-brand text-white text-[12px] font-600"
         @click="markComplete(1)">
        <span class="i-ph-arrow-square-out-duotone text-base" />
        打开百炼控制台
      </a>
    </section>

    <!-- Step 2: 开通服务 -->
    <section class="card-base !p-4">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-700 shrink-0"
             :class="completedSteps.has(2) ? 'bg-pos' : 'bg-brand'">
          <span v-if="completedSteps.has(2)" class="i-ph-check-bold text-sm" />
          <span v-else>2</span>
        </div>
        <h3 class="font-700 text-[14px]">开通模型服务</h3>
      </div>
      <div class="ml-9 flex flex-col gap-2">
        <p class="text-[12px] text-ink-muted leading-relaxed">
          首次进入百炼会有「服务开通」提示：
        </p>
        <div class="bg-bg/60 rounded-icon p-2.5 text-[12px] leading-relaxed">
          <div class="flex gap-1.5">
            <span class="text-brand font-700 shrink-0">①</span>
            <span>勾选「我已阅读并同意服务协议」</span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <span class="text-brand font-700 shrink-0">②</span>
            <span>点击「立即开通」按钮</span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <span class="text-brand font-700 shrink-0">③</span>
            <span>开通后默认是<b class="text-pos">按量付费</b>（不用预充值，免费额度用完再扣）</span>
          </div>
        </div>
        <div class="bg-orange/10 rounded-icon p-2.5 text-[11px] text-ink leading-relaxed">
          <span class="i-ph-info-duotone text-orange align-middle mr-1" />
          <b class="text-orange">放心：</b>新用户 7 个视觉模型 + 4 个文本模型每个都送 100 万 token 免费额度，够你用几千次。
        </div>
        <button class="tap self-start px-3 h-8 rounded-icon border border-border text-[12px] text-ink-muted font-600 mt-1"
                @click="markComplete(2)">
          已开通 ✓
        </button>
      </div>
    </section>

    <!-- Step 3: 创建 API-KEY -->
    <section class="card-base !p-4">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-700 shrink-0"
             :class="completedSteps.has(3) ? 'bg-pos' : 'bg-brand'">
          <span v-if="completedSteps.has(3)" class="i-ph-check-bold text-sm" />
          <span v-else>3</span>
        </div>
        <h3 class="font-700 text-[14px]">创建并复制 API-KEY</h3>
      </div>
      <div class="ml-9 flex flex-col gap-2">
        <div class="bg-bg/60 rounded-icon p-2.5 text-[12px] leading-relaxed">
          <div class="flex gap-1.5">
            <span class="text-brand font-700 shrink-0">①</span>
            <span>控制台右上角点 <b>头像</b>，下拉菜单选 <b>「API-KEY 管理」</b></span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <span class="text-brand font-700 shrink-0">②</span>
            <span>点 <b class="text-brand">「创建我的 API-KEY」</b> 按钮</span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <span class="text-brand font-700 shrink-0">③</span>
            <span>系统生成形如 <span class="font-mono text-[11px]">sk-xxxxxxxx...</span> 的字符串</span>
          </div>
          <div class="flex gap-1.5 mt-1">
            <span class="text-brand font-700 shrink-0">④</span>
            <span>点击 <b>「复制」</b> 按钮（重要：完整复制）</span>
          </div>
        </div>
        <div class="bg-neg/10 rounded-icon p-2.5 text-[11px] text-ink leading-relaxed">
          <span class="i-ph-warning-circle-duotone text-neg align-middle mr-1" />
          <b class="text-neg">⚠️ 只显示一次：</b>
          百炼出于安全考虑，Key 创建后<b>只完整显示这一次</b>。如果忘了复制，需要删除重建。<b>建议先粘贴到下面再继续。</b>
        </div>
      </div>
    </section>

    <!-- Step 4: 粘贴 + 验证 -->
    <section class="card-base !p-4 border-2 border-brand">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-700 shrink-0"
             :class="verifyResult === 'success' ? 'bg-pos' : 'bg-brand'">
          <span v-if="verifyResult === 'success'" class="i-ph-check-bold text-sm" />
          <span v-else>4</span>
        </div>
        <h3 class="font-700 text-[14px]">粘贴 Key 并验证</h3>
      </div>
      <div class="flex flex-col gap-2.5">
        <div class="relative">
          <input
            v-model="apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="粘贴 sk-xxxxxxxxxxxxxxxxxxxxx"
            autocomplete="off"
            spellcheck="false"
            class="w-full h-11 pl-3 pr-20 rounded-icon bg-bg border border-border text-[13px] focus:border-brand focus:bg-white outline-none transition-colors font-mono"
          />
          <button class="absolute right-2 top-1/2 -translate-y-1/2 px-2 h-7 text-[11px] text-ink-muted tap"
                  @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>

        <button
          class="tap h-11 rounded-icon font-700 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          :class="verifyResult === 'success' ? 'bg-pos text-white' : 'bg-brand text-white'"
          :disabled="verifying"
          @click="verifyAndSave"
        >
          <span v-if="verifying" class="i-ph-spinner-gap-bold text-base animate-spin" />
          <span v-else-if="verifyResult === 'success'" class="i-ph-check-circle-duotone text-base" />
          <span v-else class="i-ph-paper-plane-tilt-duotone text-base" />
          {{ verifying ? '验证中…'
             : verifyResult === 'success' ? '验证通过！正在跳转…'
             : '保存并验证 Key' }}
        </button>

        <div v-if="verifyResult === 'success'"
             class="text-[11px] text-pos bg-pos/10 px-3 py-2 rounded-icon leading-relaxed">
          ✅ Key 有效，已保存到本设备。可以开始用截图识别 + AI 分析了。
        </div>
        <div v-if="verifyResult === 'fail'"
             class="text-[11px] text-neg bg-neg/10 px-3 py-2 rounded-icon leading-relaxed whitespace-pre-wrap">
          ❌ {{ verifyError }}
        </div>

        <p class="text-[10px] text-ink-muted leading-relaxed">
          💡 验证会调用一次 qwen-turbo（约消耗 10 token，免费额度内）。
          Key 验证通过后会保存在你浏览器 IndexedDB，不上传到任何服务器。
        </p>
      </div>
    </section>

    <!-- 跳过 -->
    <button class="tap text-[12px] text-ink-muted font-600 py-3"
            @click="skipForNow">
      跳过，先逛逛 →
    </button>
  </div>
</template>
