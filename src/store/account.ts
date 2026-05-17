/**
 * 商业化账号 Pinia store（Sprint 0+）
 *
 * 持有：
 *   - JWT session token（localStorage）
 *   - 当前用户订阅信息（tier/status/到期时间）
 *
 * 不持有：任何资产数据。资产仍在 useAppStore + IndexedDB。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, getSessionToken, setSessionToken, ApiError } from '../lib/api';

export type SubscriptionTier = 'free' | 'plus' | 'pro' | 'max' | 'studio';
export type SubscriptionStatus = 'active' | 'trialing' | 'cancelled' | 'expired' | 'past_due';

export interface MeResponse {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface QuotaState {
  periodStart: string;
  ocr: { quota: number; used: number };
  analysis: { quota: number; used: number };
}

export const useAccountStore = defineStore('account', () => {
  const me = ref<MeResponse | null>(null);
  const quota = ref<QuotaState | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  const isAuthed = computed(() => !!getSessionToken());
  const tier = computed<SubscriptionTier>(() => me.value?.tier ?? 'free');

  const ocrRemaining = computed(() => {
    if (!quota.value) return null;
    return Math.max(0, quota.value.ocr.quota - quota.value.ocr.used);
  });
  const analysisRemaining = computed(() => {
    if (!quota.value) return null;
    return Math.max(0, quota.value.analysis.quota - quota.value.analysis.used);
  });

  async function refresh(): Promise<void> {
    if (!isAuthed.value) {
      me.value = null;
      quota.value = null;
      return;
    }
    loading.value = true;
    lastError.value = null;
    try {
      // /me 和 /quota 并行；任一 401 都会触发 token 清理
      const [meRes, quotaRes] = await Promise.all([
        api<MeResponse>('/me'),
        api<QuotaState>('/quota')
      ]);
      me.value = meRes;
      quota.value = quotaRes;
    } catch (e) {
      const err = e as ApiError;
      // 401 已在 api 层清掉 token
      if (err.status === 401) {
        me.value = null;
        quota.value = null;
      } else {
        lastError.value = err.message;
      }
    } finally {
      loading.value = false;
    }
  }

  /** 仅刷 quota，不重拉 /me（截图识别成功后调用） */
  async function refreshQuota(): Promise<void> {
    if (!isAuthed.value) return;
    try {
      quota.value = await api<QuotaState>('/quota');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        me.value = null;
        quota.value = null;
      }
      // 其它错静默；下次 OCR 之后会再刷新
    }
  }

  async function requestMagicLink(email: string): Promise<void> {
    await api('/auth/request-link', { body: { email }, auth: false });
  }

  async function verifyMagicLink(token: string): Promise<void> {
    const res = await api<{ token: string; tier: SubscriptionTier }>(
      '/auth/verify',
      { body: { token }, auth: false }
    );
    setSessionToken(res.token);
    await refresh();
  }

  function signOut(): void {
    setSessionToken(null);
    me.value = null;
    quota.value = null;
  }

  return {
    me,
    quota,
    loading,
    lastError,
    isAuthed,
    tier,
    ocrRemaining,
    analysisRemaining,
    refresh,
    refreshQuota,
    requestMagicLink,
    verifyMagicLink,
    signOut
  };
});
