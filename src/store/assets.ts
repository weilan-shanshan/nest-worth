import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db, getOrInitSettings, updateSettings } from '../db';
import type { Asset, AssetCategory, Goal, Settings, Snapshot } from '../types';
import { todayStr } from '../lib/format';
import { refreshAssetQuotes } from '../lib/quotes';

export const useAppStore = defineStore('app', () => {
  const assets = ref<Asset[]>([]);
  const snapshots = ref<Snapshot[]>([]);
  const goals = ref<Goal[]>([]);
  const settings = ref<Settings>({ baseCurrency: 'CNY', privacyMode: false });
  const ready = ref(false);

  async function load() {
    const [a, s, g, st] = await Promise.all([
      db.assets.toArray(),
      db.snapshots.orderBy('date').toArray(),
      db.goals.toArray(),
      getOrInitSettings()
    ]);
    assets.value = a;
    snapshots.value = s;
    goals.value = g;
    settings.value = st;
    ready.value = true;

    if (a.length === 0) {
      await seedDemo();
    }
    await ensureTodaySnapshot();
  }

  const totalNetWorth = computed(() =>
    assets.value.reduce((sum, x) => sum + x.balance, 0)
  );

  const hasApiKey = computed(() => {
    const k = settings.value.apiKey?.trim() || (import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined)?.trim();
    return !!(k && k.startsWith('sk-'));
  });

  const dailyChange = computed(() =>
    assets.value.reduce((sum, x) => sum + (x.dailyChange || 0), 0)
  );

  const dailyChangePct = computed(() => {
    const t = totalNetWorth.value;
    return t ? (dailyChange.value / t) * 100 : 0;
  });

  const byCategory = computed(() => {
    const map = new Map<AssetCategory, number>();
    for (const a of assets.value) {
      map.set(a.category, (map.get(a.category) || 0) + a.balance);
    }
    return map;
  });

  async function addAsset(a: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = Date.now();
    const full: Asset = { ...a, createdAt: now, updatedAt: now };
    full.id = await db.assets.add(full);
    assets.value = [...assets.value, full];
    await ensureTodaySnapshot(true);
    return full;
  }

  async function updateAsset(id: number, patch: Partial<Asset>) {
    const next = { ...patch, updatedAt: Date.now() };
    await db.assets.update(id, next);
    const idx = assets.value.findIndex(x => x.id === id);
    if (idx >= 0) assets.value[idx] = { ...assets.value[idx], ...next };
    await ensureTodaySnapshot(true);
  }

  async function deleteAsset(id: number) {
    await db.assets.delete(id);
    assets.value = assets.value.filter(x => x.id !== id);
    await ensureTodaySnapshot(true);
  }

  async function bulkUpdate(updates: { id: number; patch: Partial<Asset> }[]) {
    if (updates.length === 0) return;
    const now = Date.now();
    await db.transaction('rw', db.assets, async () => {
      for (const u of updates) {
        await db.assets.update(u.id, { ...u.patch, updatedAt: now });
      }
    });
    // 内存同步
    const map = new Map(updates.map(u => [u.id, u.patch]));
    assets.value = assets.value.map(a => {
      const p = map.get(a.id!);
      return p ? { ...a, ...p, updatedAt: now } : a;
    });
    await ensureTodaySnapshot(true);
  }

  async function ensureTodaySnapshot(force = false) {
    const today = todayStr();
    const existing = await db.snapshots.where('date').equals(today).first();
    const total = totalNetWorth.value;
    const byCat: Record<string, number> = {};
    for (const a of assets.value) byCat[a.category] = (byCat[a.category] || 0) + a.balance;

    if (existing) {
      if (force || existing.total !== total) {
        await db.snapshots.update(existing.id!, { total, byCategory: byCat as any });
      }
    } else {
      await db.snapshots.add({ date: today, total, byCategory: byCat as any });
    }
    snapshots.value = await db.snapshots.orderBy('date').toArray();
  }

  async function addGoal(g: Omit<Goal, 'id' | 'createdAt'>) {
    const full: Goal = { ...g, createdAt: Date.now() };
    full.id = await db.goals.add(full);
    goals.value = [...goals.value, full];
    return full;
  }

  async function updateGoal(id: number, patch: Partial<Goal>) {
    await db.goals.update(id, patch);
    const idx = goals.value.findIndex(x => x.id === id);
    if (idx >= 0) goals.value[idx] = { ...goals.value[idx], ...patch };
  }

  async function deleteGoal(id: number) {
    await db.goals.delete(id);
    goals.value = goals.value.filter(x => x.id !== id);
  }

  async function setApiKey(key: string) {
    settings.value = await updateSettings({ apiKey: key });
  }

  async function setPrivacy(p: boolean) {
    settings.value = await updateSettings({ privacyMode: p });
  }

  async function refreshSettings() {
    settings.value = await getOrInitSettings();
  }

  /** 拉所有有 ticker 的资产最新价 → 自动更新 balance */
  const quotesRefreshing = ref(false);
  const quotesLastResult = ref<{ updated: number; skipped: number; at: number } | null>(null);

  async function refreshQuotes(): Promise<{ updated: number; skipped: number }> {
    if (quotesRefreshing.value) return { updated: 0, skipped: 0 };
    quotesRefreshing.value = true;
    try {
      const { updates, skipped } = await refreshAssetQuotes(assets.value);
      if (updates.length) await bulkUpdate(updates);
      const result = { updated: updates.length, skipped: skipped.length };
      quotesLastResult.value = { ...result, at: Date.now() };
      return result;
    } finally {
      quotesRefreshing.value = false;
    }
  }

  /** 自动调用：每次 load 后，如果距上次刷新 > 4 小时则后台静默刷一次 */
  async function maybeRefreshQuotes() {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const last = quotesLastResult.value?.at || 0;
    if (Date.now() - last < FOUR_HOURS) return;
    refreshQuotes().catch(() => { /* 静默失败 */ });
  }

  async function exportAll() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets: await db.assets.toArray(),
      snapshots: await db.snapshots.toArray(),
      goals: await db.goals.toArray(),
      settings: { baseCurrency: settings.value.baseCurrency, privacyMode: settings.value.privacyMode }
    };
    return data;
  }

  async function importAll(data: any) {
    if (!data || data.version !== 1) throw new Error('备份文件格式不兼容');
    await db.transaction('rw', db.assets, db.snapshots, db.goals, async () => {
      await db.assets.clear();
      await db.snapshots.clear();
      await db.goals.clear();
      if (Array.isArray(data.assets)) await db.assets.bulkAdd(data.assets.map(stripId));
      if (Array.isArray(data.snapshots)) await db.snapshots.bulkAdd(data.snapshots.map(stripId));
      if (Array.isArray(data.goals)) await db.goals.bulkAdd(data.goals.map(stripId));
    });
    await load();
  }

  async function seedDemo() {
    const now = Date.now();
    // 起息日按"今天往前 8 个月"算，让到期倒计时合理
    const today = new Date();
    const startDate8mAgo = new Date(today.getFullYear(), today.getMonth() - 8, today.getDate())
      .toISOString().slice(0, 10);
    const startDate3mAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
      .toISOString().slice(0, 10);

    const demo: Omit<Asset, 'id'>[] = [
      { name: '招行储蓄卡', platform: '招商银行', category: 'cash', balance: 38420.55, currency: 'CNY',
        dailyChange: 0, dailyChangePct: 0, createdAt: now, updatedAt: now },
      { name: '余额宝', platform: '支付宝', category: 'cash', balance: 12300.18, currency: 'CNY',
        dailyChange: 1.23, dailyChangePct: 0.01, createdAt: now, updatedAt: now },

      { name: '易方达蓝筹精选', platform: '蚂蚁财富', category: 'fund',
        balance: 56800.42, currency: 'CNY', cost: 50000,
        totalReturn: 6800.42, annualizedReturn: 13.6,
        startDate: new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
                    .toISOString().slice(0, 10),
        dailyChange: 234.5, dailyChangePct: 0.41,
        tickerSymbol: '005827', tickerType: 'cn-fund',
        createdAt: now, updatedAt: now },

      { name: '贵州茅台 600519', platform: '富途证券', category: 'stock',
        balance: 86230.0, currency: 'CNY', cost: 78000,
        shares: 50,
        dailyChange: -1240.0, dailyChangePct: -1.42,
        tickerSymbol: '600519', tickerType: 'cn-stock',
        createdAt: now, updatedAt: now },

      { name: '招行三年定期', platform: '招商银行', category: 'deposit',
        balance: 100000, currency: 'CNY',
        termMonths: 36, interestRate: 3.5, startDate: startDate8mAgo,
        createdAt: now, updatedAt: now },

      { name: '招银理财月月利', platform: '招商银行', category: 'wealth',
        balance: 80000, currency: 'CNY',
        termMonths: 12, interestRate: 3.2, startDate: startDate3mAgo,
        createdAt: now, updatedAt: now },

      { name: '北京回龙观房产', platform: '北京·回龙观', category: 'realestate',
        balance: 4800000, currency: 'CNY', cost: 3800000,
        startDate: '2020-06-15',
        createdAt: now, updatedAt: now }
    ];
    const ids = await db.assets.bulkAdd(demo as any, { allKeys: true });
    assets.value = demo.map((d, i) => ({ ...d, id: ids[i] as number })) as Asset[];

    // 7 个月历史快照（用于柱状图）
    const months = 7;
    const historic: Snapshot[] = [];
    let base = 4800000 + 280000;
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 15);
      const total = base + (Math.sin(i * 0.7) + (months - i) * 0.06) * 60000;
      historic.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`, total: Math.round(total) });
      base = total;
    }
    await db.snapshots.bulkAdd(historic);
    snapshots.value = await db.snapshots.orderBy('date').toArray();

    await db.goals.add({
      name: '年底总净值 600 万',
      target: 6000000,
      current: totalNetWorth.value,
      deadline: `${new Date().getFullYear()}-12-31`,
      createdAt: now
    });
    goals.value = await db.goals.toArray();
  }

  return {
    assets, snapshots, goals, settings, ready,
    totalNetWorth, dailyChange, dailyChangePct, byCategory, hasApiKey,
    load, addAsset, updateAsset, deleteAsset, bulkUpdate,
    addGoal, updateGoal, deleteGoal,
    setApiKey, setPrivacy, refreshSettings, exportAll, importAll,
    refreshQuotes, maybeRefreshQuotes, quotesRefreshing, quotesLastResult
  };
});

function stripId<T extends { id?: number }>(x: T): T {
  const { id, ...rest } = x;
  return rest as T;
}
