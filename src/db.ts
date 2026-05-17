import Dexie, { type Table } from 'dexie';
import type { Asset, Snapshot, Goal, Settings } from './types';

interface AdviceRow {
  id?: number;
  key: string;
  fingerprint: string;
  payload: string;
  createdAt: number;
}

class NestworthDB extends Dexie {
  assets!: Table<Asset, number>;
  snapshots!: Table<Snapshot, number>;
  goals!: Table<Goal, number>;
  settings!: Table<Settings, number>;
  advice!: Table<AdviceRow, number>;

  constructor() {
    super('nestworth');
    this.version(1).stores({
      assets: '++id, category, updatedAt',
      snapshots: '++id, &date',
      goals: '++id, deadline',
      settings: '++id'
    });
    this.version(2).stores({
      assets: '++id, category, updatedAt',
      snapshots: '++id, &date',
      goals: '++id, deadline',
      settings: '++id',
      advice: '++id, &key'
    });
  }
}

export const db = new NestworthDB();

export async function getOrInitSettings(): Promise<Settings> {
  const existing = await db.settings.toCollection().first();
  if (existing) {
    // 兼容老数据：analyticsEnabled 未显式设过时按"默认开"处理
    if (existing.analyticsEnabled === undefined) existing.analyticsEnabled = true;
    return existing;
  }
  const s: Settings = { baseCurrency: 'CNY', privacyMode: false, analyticsEnabled: true };
  s.id = await db.settings.add(s);
  return s;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getOrInitSettings();
  const next = { ...cur, ...patch };
  await db.settings.put(next);
  return next;
}

export async function updateAnalystConfig(patch: {
  analystModelOrder?: string[];
  analystEnabled?: Record<string, boolean>;
  ensembleSize?: number;
}): Promise<Settings> {
  return updateSettings(patch);
}
