/**
 * 阿里云百炼模型计费表（2026-05）。
 *
 * 精度策略：用 "cent × 10000 / 1K-token" 整数避免浮点累计；最后 ceil 到 cent。
 *   公式：cost_cents = ceil((tokens_in * inX10K + tokens_out * outX10K) / 10000)
 *
 * 举例 qwen-vl-plus 输入输出同价 ¥0.008/1K = 0.0008 cents/token：
 *   inX10K = 0.0008 * 1000 / 0.0001 = 8
 *
 * 季度回校：阿里云官方价格页有变就更新这张表（不改业务代码）。
 */

export interface ModelPrice {
  inX10K: number;   // cents × 10000 per 1K input tokens
  outX10K: number;  // cents × 10000 per 1K output tokens
}

const PRICE_TABLE: Record<string, ModelPrice> = {
  // 视觉模型
  'qwen-vl-plus':              { inX10K: 8,  outX10K: 8  },
  'qwen-vl-max':               { inX10K: 30, outX10K: 90 },
  'qwen2.5-vl-7b-instruct':    { inX10K: 2,  outX10K: 5  },
  'qwen2.5-vl-32b-instruct':   { inX10K: 5,  outX10K: 10 },
  'qwen2.5-vl-72b-instruct':   { inX10K: 10, outX10K: 20 },
  'qvq-max':                   { inX10K: 30, outX10K: 90 },
  'qvq-72b-preview':           { inX10K: 10, outX10K: 20 },

  // 文本/推理模型（分析用）
  'deepseek-r1':               { inX10K: 4,  outX10K: 16 },
  'deepseek-v3':               { inX10K: 1,  outX10K: 2  },
  'qwen-max-latest':           { inX10K: 20, outX10K: 60 },
  'qwen-max':                  { inX10K: 20, outX10K: 60 },
  'qwen-plus':                 { inX10K: 8,  outX10K: 20 },
  'qwen2.5-72b-instruct':      { inX10K: 10, outX10K: 20 },
  'qwen2.5-32b-instruct':      { inX10K: 5,  outX10K: 10 },
  'qwen-turbo':                { inX10K: 3,  outX10K: 6  }
};

const FALLBACK_PRICE: ModelPrice = { inX10K: 10, outX10K: 20 };

/** 单次调用的成本（cents），ceil 取整。 */
export function computeCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICE_TABLE[model] ?? FALLBACK_PRICE;
  const cents_x10k = tokensIn * price.inX10K + tokensOut * price.outX10K;
  return Math.ceil(cents_x10k / 10000);
}

export function knownModel(model: string): boolean {
  return model in PRICE_TABLE;
}
