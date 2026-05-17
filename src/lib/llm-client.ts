/**
 * LLM 代付路径实现层（与 recognize.ts BYOK 路径并列）。
 *
 * 不做 mode dispatch；dispatch 由 recognize.ts 公开 API 完成。本文件只负责
 * "走 server proxy 时怎么做"。
 *
 * 未来 Sprint 2 advisor.ts 接入 proxy 时，runAnalysisViaProxy 也加在本文件。
 */

import { useAccountStore } from '../store/account';
import { api, ApiError } from './api';
import type { RecognizedAsset, RecognizeResult } from './recognize';

export type LlmMode = 'proxy' | 'byok';

/**
 * 决定当前应走哪条路径：
 *   - 已登录 且 tier !== 'studio' → proxy（享平台代付配额）
 *   - 其它（未登录 / Studio 用户）→ byok（用本地 Key）
 *
 * Studio 用户即便登录也走 BYOK，这是商业化方案里"Studio = 自带 Key"的核心定义。
 */
export function pickLlmMode(): LlmMode {
  const account = useAccountStore();
  if (account.isAuthed && account.tier !== 'studio') return 'proxy';
  return 'byok';
}

interface OcrProxyResponse {
  items: RecognizedAsset[];
  model: string;
  quota: { used: number; quota: number };
  trace: string;
}

/**
 * 走 server 代付路径调 OCR。
 * 行为差异 vs BYOK：
 *   - 只有一个模型（server 决定，Sprint 1 = qwen-vl-plus），不暴露模型链
 *   - 不写 IndexedDB exhaustedModels（server 端管自己的额度）
 *   - 配额耗尽抛具体错误（ocr_quota_exceeded），调用方可引导升级
 */
export async function recognizeViaProxy(file: File): Promise<RecognizeResult> {
  const dataUrl = await fileToDataUrl(file);
  try {
    const res = await api<OcrProxyResponse>('/llm/ocr', { body: { image: dataUrl } });
    return {
      items: res.items,
      modelUsed: res.model,
      modelsTried: [res.model],
      newlyExhausted: []
    };
  } catch (e) {
    const err = e as ApiError;
    if (err.code === 'ocr_quota_exceeded') {
      throw new Error('本月 OCR 配额已用完，升级或下月初自动刷新');
    }
    if (err.code === 'upstream_quota_exhausted') {
      throw new Error('平台 OCR 模型暂时额度耗尽，请稍后重试或切到 BYOK 模式（设置 → 高级）');
    }
    if (err.code === 'upstream_error') {
      throw new Error('截图识别失败，请确认图片清晰可读后重试');
    }
    if (err.status === 401) {
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(err.message || '截图识别失败，请稍后重试');
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
