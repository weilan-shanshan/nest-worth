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

export const useAccountStore = defineStore('account', () => {
  const me = ref<MeResponse | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  const isAuthed = computed(() => !!getSessionToken());
  const tier = computed<SubscriptionTier>(() => me.value?.tier ?? 'free');

  async function refresh(): Promise<void> {
    if (!isAuthed.value) {
      me.value = null;
      return;
    }
    loading.value = true;
    lastError.value = null;
    try {
      me.value = await api<MeResponse>('/me');
    } catch (e) {
      const err = e as ApiError;
      // 401 已在 api 层清掉 token
      if (err.status === 401) {
        me.value = null;
      } else {
        lastError.value = err.message;
      }
    } finally {
      loading.value = false;
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
  }

  return {
    me,
    loading,
    lastError,
    isAuthed,
    tier,
    refresh,
    requestMagicLink,
    verifyMagicLink,
    signOut
  };
});
