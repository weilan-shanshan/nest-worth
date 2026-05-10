/**
 * 实时市场数据抓取（仅免费 + CORS 友好的接口）。
 *
 * 已接入：
 *   - 加密货币：CoinGecko (https://api.coingecko.com/api/v3)
 *   - 法币汇率：Frankfurter ECB (https://api.frankfurter.app)
 *   - 黄金：metals.live free
 *
 * 待接入（需 Cloudflare Worker 代理）：
 *   - A 股 / 美股 / 港股 / 指数（腾讯/新浪不给 CORS）
 */

import { db } from '../db';

export interface MarketSnapshot {
  fetchedAt: number;
  fetchedAtIso: string;
  fxRates: Record<string, number>;          // 1 USD = X CNY/HKD/EUR/JPY ...
  fxBase: string;                            // 'USD'
  crypto: { symbol: string; price: number; change24h: number }[];
  metals: { symbol: string; price: number }[];
  notes: string[];                           // 抓取过程中的提示/失败信息
  sources: string[];                         // 实际成功的数据源
}

const CACHE_KEY = 'market-snapshot';
const CACHE_TTL = 30 * 60 * 1000;   // 30 分钟

interface CacheRow {
  id?: number;
  key: string;
  fingerprint: string;
  payload: string;
  createdAt: number;
}

export async function fetchMarketSnapshot(forceRefresh = false): Promise<MarketSnapshot> {
  if (!forceRefresh) {
    const cached = await readCache();
    if (cached) return cached;
  }

  const snapshot: MarketSnapshot = {
    fetchedAt: Date.now(),
    fetchedAtIso: new Date().toISOString(),
    fxRates: {},
    fxBase: 'USD',
    crypto: [],
    metals: [],
    notes: [],
    sources: []
  };

  // 并行抓取，任一失败不影响其他
  const tasks = [
    fetchFx(snapshot),
    fetchCrypto(snapshot),
    fetchMetals(snapshot)
  ];
  await Promise.allSettled(tasks);

  await writeCache(snapshot);
  return snapshot;
}

/* ---------- 法币汇率 (多源 fallback) ---------- */
async function fetchFx(snap: MarketSnapshot) {
  const targets = ['CNY', 'HKD', 'EUR', 'JPY', 'GBP'];
  const sources = [
    {
      name: 'open.er-api.com',
      url: 'https://open.er-api.com/v6/latest/USD',
      pick: (d: any) => d?.rates
    },
    {
      name: 'exchangerate-api.com',
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      pick: (d: any) => d?.rates
    },
    {
      name: 'Frankfurter (ECB)',
      url: 'https://api.frankfurter.app/latest?from=USD&to=' + targets.join(','),
      pick: (d: any) => d?.rates
    }
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rates = src.pick(data);
      if (!rates) throw new Error('空响应');
      const filtered: Record<string, number> = { USD: 1 };
      for (const t of targets) {
        if (typeof rates[t] === 'number') filtered[t] = rates[t];
      }
      if (Object.keys(filtered).length <= 1) throw new Error('未含目标币种');
      snap.fxRates = filtered;
      snap.sources.push(src.name);
      return;
    } catch (e: any) {
      // 试下一个源
      continue;
    }
  }
  snap.notes.push(`汇率：所有数据源都不可达（可能网络受限）`);
}

/* ---------- 加密货币 (CoinGecko) ---------- */
async function fetchCrypto(snap: MarketSnapshot) {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,solana&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const map: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT', solana: 'SOL' };
    for (const [k, v] of Object.entries(data) as any) {
      snap.crypto.push({
        symbol: map[k] || k.toUpperCase(),
        price: v.usd,
        change24h: v.usd_24h_change || 0
      });
    }
    if (snap.crypto.length) snap.sources.push('CoinGecko');
  } catch (e: any) {
    snap.notes.push(`加密货币：${e.message || '请求失败'}`);
  }
}

/* ---------- 贵金属 (CoinGecko 也有 PAXG/XAUT 锚定黄金的 token，可作代理) ---------- */
async function fetchMetals(snap: MarketSnapshot) {
  // CoinGecko 提供两种黄金代币：PAXG / XAUT，价格约等于实物金每盎司价格
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold,tether-gold&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const px = data['pax-gold']?.usd ?? data['tether-gold']?.usd;
    if (px && Number.isFinite(px)) {
      snap.metals.push({ symbol: 'GOLD', price: Number(px) });
      snap.sources.push('CoinGecko (PAXG)');
    }
  } catch (e: any) {
    snap.notes.push(`贵金属：${e.message || '请求失败'}`);
  }
}

/* ---------- IndexedDB cache ---------- */
async function readCache(): Promise<MarketSnapshot | null> {
  try {
    const row = await db.advice.where('key').equals(CACHE_KEY).first();
    if (!row) return null;
    if (Date.now() - row.createdAt > CACHE_TTL) return null;
    return JSON.parse(row.payload);
  } catch { return null; }
}

async function writeCache(snap: MarketSnapshot): Promise<void> {
  try {
    const existing = await db.advice.where('key').equals(CACHE_KEY).first();
    const row: CacheRow = {
      id: existing?.id,
      key: CACHE_KEY,
      fingerprint: 'market',
      payload: JSON.stringify(snap),
      createdAt: Date.now()
    };
    if (existing?.id) await db.advice.put(row);
    else await db.advice.add(row);
  } catch { /* swallow */ }
}

/* ---------- 给 LLM 用的人类可读摘要 ---------- */
export function formatSnapshotForPrompt(snap: MarketSnapshot): string {
  const lines: string[] = [];
  lines.push(`【市场快照 · 截至 ${new Date(snap.fetchedAt).toLocaleString('zh-CN')}】`);

  if (Object.keys(snap.fxRates).length) {
    const fx = Object.entries(snap.fxRates)
      .filter(([c]) => c !== 'USD')
      .map(([c, r]) => `1 USD = ${r.toFixed(4)} ${c}`)
      .join('，');
    lines.push(`汇率：${fx}`);
  }

  if (snap.crypto.length) {
    const c = snap.crypto.map(x => `${x.symbol} $${x.price.toLocaleString()} (24h ${x.change24h >= 0 ? '+' : ''}${x.change24h.toFixed(2)}%)`).join('；');
    lines.push(`加密货币：${c}`);
  }

  if (snap.metals.length) {
    const m = snap.metals.map(x => `${x.symbol} $${x.price.toFixed(2)}/oz`).join('；');
    lines.push(`贵金属：${m}`);
  }

  if (snap.notes.length) {
    lines.push(`（注：${snap.notes.join('；')}）`);
  }

  if (snap.sources.length) {
    lines.push(`数据源：${snap.sources.join(' / ')}`);
  }

  return lines.join('\n');
}
