/**
 * 把 LLM 识别出的 RecognizedAsset 与现有库存的 Asset 做匹配。
 * 如果命中 → 返回现有 asset.id 用于"更新余额"
 * 否则 → null，走"新建"
 */
import type { Asset } from '../types';
import type { RecognizedAsset } from './recognize';

export interface MatchResult {
  recognized: RecognizedAsset;
  matchedAssetId?: number;
  matchedAsset?: Asset;
  confidence: number;       // 0-1
  reason: string;           // 调试用
}

export function matchRecognized(
  recognized: RecognizedAsset[],
  existing: Asset[]
): MatchResult[] {
  return recognized.map(r => matchOne(r, existing));
}

function matchOne(r: RecognizedAsset, existing: Asset[]): MatchResult {
  let best: { asset: Asset; score: number; reason: string } | null = null;

  for (const a of existing) {
    if (a.category !== r.category) continue;   // 类型必须相同

    let score = 0;
    const reasons: string[] = [];

    // 1) 完全相同 name
    if (a.name && r.name && normalizeName(a.name) === normalizeName(r.name)) {
      score += 0.6;
      reasons.push('name match');
    } else if (a.name && r.name) {
      const sim = stringSim(normalizeName(a.name), normalizeName(r.name));
      if (sim > 0.5) {
        score += 0.4 * sim;
        reasons.push(`name similar(${sim.toFixed(2)})`);
      }
    }

    // 2) platform 相同
    if (a.platform && r.platform && normalizeName(a.platform) === normalizeName(r.platform)) {
      score += 0.3;
      reasons.push('platform match');
    } else if (a.platform && r.platform) {
      const sim = stringSim(normalizeName(a.platform), normalizeName(r.platform));
      if (sim > 0.5) {
        score += 0.15 * sim;
        reasons.push(`platform similar(${sim.toFixed(2)})`);
      }
    }

    // 3) 行情代码完全一致（最强）
    if (a.tickerSymbol && r.tickerSymbol &&
        a.tickerSymbol.toUpperCase() === r.tickerSymbol.toUpperCase()) {
      score += 0.5;
      reasons.push('ticker exact');
    }

    if (!best || score > best.score) {
      best = { asset: a, score, reason: reasons.join(' + ') };
    }
  }

  // 阈值：>= 0.55 视为命中
  if (best && best.score >= 0.55) {
    return {
      recognized: r,
      matchedAssetId: best.asset.id,
      matchedAsset: best.asset,
      confidence: Math.min(1, best.score),
      reason: best.reason
    };
  }
  return { recognized: r, confidence: 0, reason: 'no match' };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '')   // 去括号内说明
    .replace(/[.,。、·-]/g, '')
    .trim();
}

/** 简化的字符相似度（dice coefficient on bigrams） */
function stringSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = new Set<string>();
  const bBigrams = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) aBigrams.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bBigrams.add(b.slice(i, i + 2));
  let inter = 0;
  for (const g of aBigrams) if (bBigrams.has(g)) inter++;
  return (2 * inter) / (aBigrams.size + bBigrams.size);
}
