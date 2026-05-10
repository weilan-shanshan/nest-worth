/**
 * 行情拉取：基金 / 股票 的最新单价。
 *
 * 走 Cloudflare Worker 代理（绕过 CORS）：
 *   - A 股 / 港股 / 美股 / 国内基金
 *   - Worker URL 通过 `VITE_QUOTE_PROXY` 环境变量配置
 *   - Worker 代码模板见 worker/quotes-proxy.js
 *
 * 用户没配 Worker 时，自动跳过（不报错）。
 */

import type { Asset, TickerType } from '../types';

const PROXY = (import.meta.env.VITE_QUOTE_PROXY as string | undefined)?.replace(/\/$/, '');

export interface Quote {
  symbol: string;
  type: TickerType;
  price: number;             // 单位价格（CNY for 国内 / USD for 美股+加密）
  currency: string;
  prevClose?: number;
  change?: number;
  changePct?: number;
  fetchedAt: number;
}

export async function fetchQuote(symbol: string, type: TickerType): Promise<Quote | null> {
  if (!symbol || type === 'none') return null;
  if (!PROXY) return null;
  try {
    return await fetchViaProxy(symbol, type);
  } catch {
    return null;
  }
}

/** A 股 / 港股 / 美股 / 国内基金：通过 Cloudflare Worker 代理 */
async function fetchViaProxy(symbol: string, type: TickerType): Promise<Quote | null> {
  const url = `${PROXY}/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.price) return null;
  return {
    symbol: symbol.toUpperCase(),
    type,
    price: Number(data.price),
    currency: data.currency || (type === 'us-stock' ? 'USD' : 'CNY'),
    prevClose: data.prevClose ? Number(data.prevClose) : undefined,
    change: data.change ? Number(data.change) : undefined,
    changePct: data.changePct ? Number(data.changePct) : undefined,
    fetchedAt: Date.now()
  };
}

/**
 * 给定一组资产，拉取所有有 ticker 的报价，更新 balance（= shares × price）。
 * 返回更新清单 + 失败清单。
 */
export async function refreshAssetQuotes(
  assets: Asset[]
): Promise<{ updates: { id: number; patch: any }[]; skipped: Asset[] }> {
  const candidates = assets.filter(a => a.tickerSymbol && a.tickerType && a.tickerType !== 'none');
  const updates: { id: number; patch: any }[] = [];
  const skipped: Asset[] = [];

  await Promise.all(candidates.map(async (a) => {
    const q = await fetchQuote(a.tickerSymbol!, a.tickerType!);
    if (!q) { skipped.push(a); return; }

    const newPrice = q.price;
    let newBalance = a.balance;
    if (a.shares && a.shares > 0) {
      newBalance = newPrice * a.shares;
      // 简化：美股 USD 价 → CNY 余额，临时按 7 估算（建议 Worker 自己换汇返回 CNY）
      if (q.currency === 'USD' && (a.currency === 'CNY' || !a.currency)) {
        newBalance = newPrice * a.shares * 7;
      }
    }

    updates.push({
      id: a.id!,
      patch: {
        lastQuoteAt: q.fetchedAt,
        lastQuotePrice: newPrice,
        ...(a.shares ? { balance: newBalance } : {}),
        ...(q.changePct !== undefined ? { dailyChangePct: q.changePct } : {})
      }
    });
  }));

  return { updates, skipped };
}

export const isQuoteProxyConfigured = () => !!PROXY;
