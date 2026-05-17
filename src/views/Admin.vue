<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));

const endpoint = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) || '';
const loading = ref(false);
const error = ref<string | null>(null);
const overview = ref<any>(null);
const funnel = ref<any>(null);
const retention = ref<any[]>([]);
const range = ref<'7d' | '30d' | '90d'>('30d');

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      'X-Admin-Token': token.value,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {})
    }
  });
  if (res.status === 401) throw new Error('Token 无效（请检查 URL 中的 token 段）');
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

async function load() {
  if (!endpoint) {
    error.value = '未配置 VITE_ANALYTICS_ENDPOINT，无法连接后端。';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const [ov, fn, rt] = await Promise.all([
      fetchJson(`/admin/overview?range=${range.value}`),
      fetchJson(`/admin/funnel?range=${range.value}`),
      fetchJson(`/admin/retention?range=${range.value}`)
    ]);
    overview.value = ov;
    funnel.value = fn;
    retention.value = rt.cohorts || [];
  } catch (e: any) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // 给页面加 noindex 元标记
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
  load();
});

function fmt(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toLocaleString();
}

function fmtMs(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// ===== 用户管理（Sprint 3 Day 3）=====

type Tier = 'free' | 'plus' | 'pro' | 'max' | 'studio';
type Status = 'active' | 'trialing' | 'cancelled' | 'expired' | 'past_due';

interface AdminUser {
  id: string;
  emailHashPrefix: string;
  tier: Tier;
  status: Status;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentPeriod: { ocrQuota: number; ocrUsed: number; analysisQuota: number; analysisUsed: number } | null;
}

const usersLoading = ref(false);
const usersError = ref<string | null>(null);
const users = ref<AdminUser[]>([]);
const usersTotal = ref(0);
const usersPage = ref(1);
const usersPageSize = 20;
const usersFilterTier = ref<Tier | ''>('');

const grant = ref({
  email: '',
  tier: 'pro' as Tier,
  status: 'active' as Status,
  periodEndDays: 30,
  createIfMissing: true
});
const grantSubmitting = ref(false);
const grantMessage = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

async function loadUsers() {
  if (!endpoint) return;
  usersLoading.value = true;
  usersError.value = null;
  try {
    const q = new URLSearchParams();
    q.set('page', String(usersPage.value));
    q.set('pageSize', String(usersPageSize));
    if (usersFilterTier.value) q.set('tier', usersFilterTier.value);
    const r = await fetchJson(`/admin/list-users?${q.toString()}`);
    users.value = r.users;
    usersTotal.value = r.total;
  } catch (e: any) {
    usersError.value = e.message;
  } finally {
    usersLoading.value = false;
  }
}

async function submitGrant() {
  if (!grant.value.email || !grant.value.email.includes('@')) {
    grantMessage.value = { kind: 'err', text: '请输入合法邮箱' };
    return;
  }
  grantSubmitting.value = true;
  grantMessage.value = null;
  try {
    // 计算 periodEnd ISO
    let periodEnd: string | null = null;
    if (grant.value.periodEndDays > 0) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + Math.floor(grant.value.periodEndDays));
      periodEnd = d.toISOString();
    }
    const body = {
      email: grant.value.email.trim(),
      tier: grant.value.tier,
      status: grant.value.status,
      periodEnd,
      createIfMissing: grant.value.createIfMissing
    };
    const r = await fetchJson('/admin/grant-tier', { method: 'POST', body: JSON.stringify(body) });
    grantMessage.value = {
      kind: 'ok',
      text: `✓ ${grant.value.email} ${r.previousTier ?? '(new)'} → ${r.tier} · 到期 ${periodEnd?.slice(0, 10) ?? '无'}`
    };
    grant.value.email = '';   // 清空避免误提交
    await loadUsers();
  } catch (e: any) {
    grantMessage.value = { kind: 'err', text: e.message };
  } finally {
    grantSubmitting.value = false;
  }
}

function selectUserToEdit(u: AdminUser) {
  // 已知前 8 位哈希，admin 仍需手动填邮箱（哈希不可逆）；只回填 tier/status/period
  grant.value.tier = u.tier;
  grant.value.status = u.status;
  if (u.currentPeriodEnd) {
    const days = Math.max(0, Math.round((new Date(u.currentPeriodEnd).getTime() - Date.now()) / 86400000));
    grant.value.periodEndDays = days;
  }
  grantMessage.value = { kind: 'ok', text: `已回填 ${u.tier}/${u.status} · 请补完邮箱后提交` };
  // 滚到表单顶部
  document.getElementById('user-mgmt-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const usersTotalPages = computed(() => Math.max(1, Math.ceil(usersTotal.value / usersPageSize)));

onMounted(() => loadUsers());
</script>

<template>
  <div class="px-5 pt-12 pb-10 flex flex-col gap-4 max-w-4xl mx-auto">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="font-brand font-700 text-2xl">运营后台</h1>
        <p class="text-[11px] text-ink-muted mt-1">只看访问人数 / 按钮点击 / 停留时长 · 不含任何资产信息</p>
      </div>
      <div class="flex gap-1.5">
        <button v-for="r in (['7d','30d','90d'] as const)" :key="r"
                class="tap h-8 px-3 rounded-icon text-[11px] font-700"
                :class="range === r ? 'bg-brand text-white' : 'bg-card text-ink-muted border border-border'"
                @click="range = r; load()">
          {{ r }}
        </button>
      </div>
    </header>

    <div v-if="error" class="card-base bg-neg/10 text-neg text-xs leading-relaxed">{{ error }}</div>
    <div v-if="loading" class="card-base text-ink-muted text-sm flex items-center gap-2">
      <span class="i-ph-spinner-gap-bold animate-spin text-lg" /> 加载中…
    </div>

    <!-- Overview -->
    <section v-if="overview" class="grid grid-cols-2 gap-3">
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">UV（独立设备）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmt(overview.uv) }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">PV（总访问）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmt(overview.pv) }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">人均 PV</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ overview.pvPerUv?.toFixed(1) ?? '-' }}</div>
      </div>
      <div class="card-base">
        <div class="text-[11px] text-ink-muted">平均停留（p50）</div>
        <div class="font-brand font-700 text-2xl mt-1">{{ fmtMs(overview.dwellP50Ms) }}</div>
      </div>
    </section>

    <!-- Path breakdown -->
    <section v-if="overview?.byPath?.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">各页面 PV / 停留</h3>
      <div class="flex flex-col gap-1 text-[12px]">
        <div v-for="p in overview.byPath" :key="p.path"
             class="flex items-center justify-between py-1.5 border-t border-border first:border-t-0">
          <span class="font-mono">{{ p.path }}</span>
          <span class="flex gap-3 text-ink-muted">
            <span>PV {{ fmt(p.pv) }}</span>
            <span>停留 p50 {{ fmtMs(p.dwellP50Ms) }}</span>
          </span>
        </div>
      </div>
    </section>

    <!-- Funnel / CTA -->
    <section v-if="funnel?.cta?.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">关键 CTA 点击</h3>
      <div class="flex flex-col gap-1 text-[12px]">
        <div v-for="c in funnel.cta" :key="c.cta"
             class="flex items-center justify-between py-1.5 border-t border-border first:border-t-0">
          <span>{{ c.cta }}</span>
          <span class="text-ink-muted">
            点击 {{ fmt(c.clicks) }} · 设备 {{ fmt(c.uniqDevices) }}
          </span>
        </div>
      </div>
    </section>

    <!-- User Management (Sprint 3 Day 3) -->
    <section id="user-mgmt-form" class="card-base">
      <h3 class="font-700 text-sm mb-3">用户管理 · 手动升档</h3>
      <div class="grid grid-cols-2 gap-2 text-[12px]">
        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-ink-muted text-[10px]">邮箱 *</span>
          <input v-model="grant.email" type="email" placeholder="user@example.com"
                 class="px-2.5 py-1.5 rounded border border-line bg-card focus:outline-none focus:border-brand" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ink-muted text-[10px]">档位</span>
          <select v-model="grant.tier" class="px-2 py-1.5 rounded border border-line bg-card">
            <option value="free">Free</option>
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
            <option value="studio">Studio</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ink-muted text-[10px]">状态</span>
          <select v-model="grant.status" class="px-2 py-1.5 rounded border border-line bg-card">
            <option value="active">active</option>
            <option value="trialing">trialing</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
            <option value="past_due">past_due</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ink-muted text-[10px]">到期（天后，0 = 无到期）</span>
          <input v-model.number="grant.periodEndDays" type="number" min="0" max="730"
                 class="px-2.5 py-1.5 rounded border border-line bg-card" />
        </label>
        <label class="flex items-center gap-2 text-[11px] mt-4">
          <input v-model="grant.createIfMissing" type="checkbox" />
          <span>邮箱不存在时自动创建</span>
        </label>
      </div>
      <button
        class="tap mt-3 w-full py-2 rounded font-700 text-[13px] transition-colors"
        :class="grantSubmitting ? 'bg-line text-ink-muted' : 'bg-brand text-white'"
        :disabled="grantSubmitting"
        @click="submitGrant"
      >
        {{ grantSubmitting ? '提交中…' : '提交升档' }}
      </button>
      <div v-if="grantMessage"
           class="mt-2 text-[11px] px-2.5 py-1.5 rounded"
           :class="grantMessage.kind === 'ok' ? 'bg-brand/10 text-brand' : 'bg-neg/10 text-neg'">
        {{ grantMessage.text }}
      </div>
    </section>

    <!-- User List -->
    <section class="card-base">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-700 text-sm">用户列表 · 共 {{ usersTotal }}</h3>
        <div class="flex items-center gap-1.5">
          <select v-model="usersFilterTier"
                  @change="usersPage = 1; loadUsers()"
                  class="text-[11px] px-2 py-1 rounded border border-line bg-card">
            <option value="">全部档位</option>
            <option value="free">Free</option>
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
            <option value="studio">Studio</option>
          </select>
          <button class="tap h-7 px-2 rounded-icon text-[10px] font-700 bg-card border border-border text-ink-muted"
                  @click="loadUsers">刷新</button>
        </div>
      </div>
      <div v-if="usersError" class="text-[11px] text-neg mb-2">{{ usersError }}</div>
      <div v-if="usersLoading" class="text-[11px] text-ink-muted">加载中…</div>
      <div v-else class="overflow-x-auto">
        <table class="text-[11px] w-full">
          <thead>
            <tr class="text-ink-muted">
              <th class="text-left py-1.5">email#</th>
              <th class="text-left">tier</th>
              <th class="text-left">status</th>
              <th class="text-right">OCR</th>
              <th class="text-right">分析</th>
              <th class="text-left">到期</th>
              <th class="text-left">建于</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-t border-border">
              <td class="py-1.5 font-mono text-[10px]">{{ u.emailHashPrefix }}</td>
              <td>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-700"
                      :class="{
                        'bg-line/40 text-ink-muted': u.tier === 'free',
                        'bg-blue/10 text-blue': u.tier === 'plus',
                        'bg-brand/15 text-brand': u.tier === 'pro',
                        'bg-orange/15 text-orange': u.tier === 'max',
                        'bg-pos/15 text-pos': u.tier === 'studio'
                      }">{{ u.tier }}</span>
              </td>
              <td>{{ u.status }}</td>
              <td class="text-right tabular-nums">
                <template v-if="u.currentPeriod">{{ u.currentPeriod.ocrUsed }}/{{ u.currentPeriod.ocrQuota }}</template>
                <template v-else>—</template>
              </td>
              <td class="text-right tabular-nums">
                <template v-if="u.currentPeriod">{{ u.currentPeriod.analysisUsed }}/{{ u.currentPeriod.analysisQuota }}</template>
                <template v-else>—</template>
              </td>
              <td class="text-[10px] text-ink-muted">{{ u.currentPeriodEnd?.slice(0, 10) ?? '-' }}</td>
              <td class="text-[10px] text-ink-muted">{{ u.createdAt.slice(0, 10) }}</td>
              <td class="text-right">
                <button class="tap text-[10px] text-brand underline" @click="selectUserToEdit(u)">回填</button>
              </td>
            </tr>
            <tr v-if="users.length === 0"><td colspan="8" class="text-center text-ink-muted py-4">无用户</td></tr>
          </tbody>
        </table>
      </div>
      <div v-if="usersTotalPages > 1" class="flex items-center justify-center gap-2 mt-3 text-[11px]">
        <button class="tap px-2 py-0.5 rounded border border-line"
                :disabled="usersPage <= 1"
                :class="usersPage <= 1 ? 'opacity-40' : ''"
                @click="usersPage--; loadUsers()">‹ 上一页</button>
        <span class="text-ink-muted">{{ usersPage }} / {{ usersTotalPages }}</span>
        <button class="tap px-2 py-0.5 rounded border border-line"
                :disabled="usersPage >= usersTotalPages"
                :class="usersPage >= usersTotalPages ? 'opacity-40' : ''"
                @click="usersPage++; loadUsers()">下一页 ›</button>
      </div>
    </section>

    <!-- Retention -->
    <section v-if="retention.length" class="card-base">
      <h3 class="font-700 text-sm mb-2">N 日留存（首访后回访比例）</h3>
      <div class="overflow-x-auto">
        <table class="text-[11px] w-full">
          <thead>
            <tr class="text-ink-muted">
              <th class="text-left py-1.5">首访日</th>
              <th class="text-right">新用户</th>
              <th class="text-right">D1</th>
              <th class="text-right">D3</th>
              <th class="text-right">D7</th>
              <th class="text-right">D14</th>
              <th class="text-right">D30</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in retention" :key="c.date" class="border-t border-border">
              <td class="py-1.5">{{ c.date }}</td>
              <td class="text-right">{{ fmt(c.newUsers) }}</td>
              <td class="text-right">{{ c.d1Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d3Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d7Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d14Pct?.toFixed(0) ?? '-' }}%</td>
              <td class="text-right">{{ c.d30Pct?.toFixed(0) ?? '-' }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
