<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../lib/api';

interface PlanInfo {
  key: 'plus' | 'pro' | 'max' | 'studio';
  name: string;
  priceMonth: number | null;
  priceYear: number | null;
  oneTime?: number;
}

const props = defineProps<{
  open: boolean;
  plan: PlanInfo | null;
  initialBilling: 'month' | 'year';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const billing = ref<'month' | 'year' | 'lifetime'>('year');
const paymentMethod = ref<'wechat' | 'alipay' | 'other'>('wechat');
// 用变量避开 Vite 的静态资源解析（编译时若图片未保存会编译失败）
// 运行时图片不存在会触发 img.onerror 显示 fallback 文案
const wechatQrUrl = '/payment-wechat.png';
const note = ref('');
const submitting = ref(false);
const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

watch(() => props.open, (val) => {
  if (val) {
    // 重置状态
    submitting.value = false;
    message.value = null;
    note.value = '';
    paymentMethod.value = 'wechat';
    // Studio 默认 lifetime
    billing.value = props.plan?.key === 'studio' ? 'lifetime' : props.initialBilling;
  }
});

const amount = computed(() => {
  if (!props.plan) return null;
  if (props.plan.key === 'studio') return props.plan.oneTime ?? 199;
  if (billing.value === 'year') return props.plan.priceYear;
  return props.plan.priceMonth;
});

const amountLabel = computed(() => {
  if (amount.value === null) return '—';
  if (billing.value === 'lifetime') return `¥${amount.value} 一次性`;
  if (billing.value === 'year') return `¥${amount.value}/年`;
  return `¥${amount.value}/月`;
});

async function submit() {
  if (!props.plan || submitting.value) return;
  submitting.value = true;
  message.value = null;
  try {
    await api('/me/upgrade-request', {
      body: {
        targetTier: props.plan.key,
        billing: billing.value,
        paymentMethod: paymentMethod.value,
        note: note.value.trim() || undefined
      }
    });
    message.value = {
      kind: 'ok',
      text: '✓ 已通知作者。请同时把付款截图发到 huoqilei.hql@alibaba-inc.com（含你的登录邮箱），24h 内人工开通。'
    };
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) {
      message.value = { kind: 'err', text: '登录已过期，请重新登录' };
    } else {
      message.value = { kind: 'err', text: err.message || '提交失败，请重试' };
    }
  } finally {
    submitting.value = false;
  }
}

function close() {
  if (submitting.value) return;
  emit('close');
}

function maskedAmountForQr(): string {
  if (amount.value === null) return '';
  return `付款金额：¥${amount.value}（${billing.value === 'lifetime' ? '一次性' : billing.value === 'year' ? '年付' : '月付'}）`;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && plan"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="bg-card rounded-t-card sm:rounded-card w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <!-- 顶部 -->
        <div class="px-5 pt-5 pb-3 flex items-start justify-between gap-3 sticky top-0 bg-card z-10 border-b border-line">
          <div>
            <div class="text-[11px] text-ink-muted">升级到</div>
            <h2 class="font-brand font-700 text-xl">{{ plan.name }}</h2>
          </div>
          <button class="tap text-ink-muted" @click="close" aria-label="关闭">
            <span class="i-ph-x-bold text-xl" />
          </button>
        </div>

        <div class="px-5 py-4 flex flex-col gap-4">
          <!-- 付费周期切换（Studio 跳过） -->
          <div v-if="plan.key !== 'studio'" class="flex items-center gap-2">
            <button
              class="tap flex-1 py-2 rounded text-[12px] font-700 transition-colors"
              :class="billing === 'month' ? 'bg-brand text-white' : 'bg-line/40 text-ink-muted'"
              @click="billing = 'month'"
            >按月</button>
            <button
              class="tap flex-1 py-2 rounded text-[12px] font-700 transition-colors"
              :class="billing === 'year' ? 'bg-brand text-white' : 'bg-line/40 text-ink-muted'"
              @click="billing = 'year'"
            >按年 · 省 25%</button>
          </div>

          <!-- 付款方式切换 -->
          <div class="flex items-center gap-2">
            <button
              class="tap flex-1 py-1.5 rounded text-[11px] font-700 border transition-colors"
              :class="paymentMethod === 'wechat'
                ? 'bg-brand/10 border-brand text-brand'
                : 'bg-card border-line text-ink-muted'"
              @click="paymentMethod = 'wechat'"
            >微信支付</button>
            <button
              class="tap flex-1 py-1.5 rounded text-[11px] font-700 border transition-colors"
              :class="paymentMethod === 'alipay'
                ? 'bg-brand/10 border-brand text-brand'
                : 'bg-card border-line text-ink-muted'"
              @click="paymentMethod = 'alipay'"
            >支付宝</button>
            <button
              class="tap flex-1 py-1.5 rounded text-[11px] font-700 border transition-colors"
              :class="paymentMethod === 'other'
                ? 'bg-brand/10 border-brand text-brand'
                : 'bg-card border-line text-ink-muted'"
              @click="paymentMethod = 'other'"
            >其他</button>
          </div>

          <!-- 应付金额提示 -->
          <div class="text-center py-2 rounded bg-brand/8">
            <div class="text-[10px] text-ink-muted">应付</div>
            <div class="font-brand font-700 text-2xl text-brand">{{ amountLabel }}</div>
          </div>

          <!-- 收款码（WeChat） -->
          <div v-if="paymentMethod === 'wechat'" class="flex flex-col items-center gap-2">
            <img :src="wechatQrUrl" alt="微信支付收款码"
                 class="w-56 h-auto rounded border border-line"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />
            <div style="display:none" class="text-[11px] text-ink-muted text-center w-56 py-8 border border-dashed border-line rounded items-center justify-center">
              （收款码图片未配置：把图保存到 public/payment-wechat.png）
            </div>
            <div class="text-[10px] text-ink-muted">{{ maskedAmountForQr() }}</div>
          </div>

          <!-- 支付宝 placeholder -->
          <div v-else-if="paymentMethod === 'alipay'" class="text-center py-8 text-[12px] text-ink-muted border border-dashed border-line rounded">
            支付宝收款码即将开通<br />
            <span class="text-[10px]">暂时请使用微信支付或联系作者</span>
          </div>

          <!-- 其他付款方式 -->
          <div v-else class="text-[12px] text-ink-muted leading-relaxed bg-line/20 p-3 rounded">
            其他付款方式（银行转账 / PayPal 等）请直接邮件作者：<br />
            <span class="font-mono text-ink">huoqilei.hql@alibaba-inc.com</span>
          </div>

          <!-- 4 步说明 -->
          <ol class="text-[11px] text-ink-muted space-y-1.5 leading-relaxed">
            <li class="flex gap-1.5"><span class="font-700 text-brand">1.</span><span>扫上方二维码完成付款（金额必须精确，否则识别困难）</span></li>
            <li class="flex gap-1.5"><span class="font-700 text-brand">2.</span><span>把付款截图发邮件到 <span class="font-mono text-ink">huoqilei.hql@alibaba-inc.com</span>，含你的<b class="text-ink">登录邮箱</b></span></li>
            <li class="flex gap-1.5"><span class="font-700 text-brand">3.</span><span>点下方<b class="text-ink">「我已付款，通知作者」</b>让系统记录你的升档意向</span></li>
            <li class="flex gap-1.5"><span class="font-700 text-brand">4.</span><span>作者 24h 内（一般 30 分钟）人工开通；开通后这里会自动刷新 tier 和配额</span></li>
          </ol>

          <!-- 备注（可选） -->
          <textarea
            v-model="note"
            placeholder="备注（可选）：付款时间 / 流水号 / 特殊需求"
            rows="2"
            maxlength="500"
            class="w-full px-3 py-2 rounded border border-line bg-card text-[12px] focus:outline-none focus:border-brand resize-none"
          />

          <!-- 提交按钮 -->
          <button
            class="tap w-full py-2.5 rounded font-700 text-[13px] transition-colors"
            :class="submitting ? 'bg-line text-ink-muted' : 'bg-brand text-white'"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? '提交中…' : '我已付款，通知作者' }}
          </button>

          <!-- 结果提示 -->
          <div v-if="message"
               class="text-[11px] px-3 py-2 rounded leading-relaxed"
               :class="message.kind === 'ok' ? 'bg-brand/10 text-brand' : 'bg-neg/10 text-neg'">
            {{ message.text }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
