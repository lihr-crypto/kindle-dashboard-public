import { createRequire } from 'node:module';
const { readCodexRateLimits } = createRequire(import.meta.url)('./vendor/codex.cjs');
export function normalizeQuota(payload) {
  const bucket = payload.rateLimitsByLimitId?.codex || (payload.rateLimits && (!payload.rateLimits.limitId || payload.rateLimits.limitId === 'codex') ? payload.rateLimits : null);
  if (!bucket) throw new Error('未取得 Codex 额度窗口');
  const windows = [];
  for (const key of ['primary','secondary']) {
    const item = bucket[key];
    if (!item || typeof item.usedPercent !== 'number' || !Number.isFinite(item.usedPercent)) continue;
    const minutes = item.windowDurationMins;
    windows.push({ key, durationMinutes: minutes, label: minutes === 300 ? '5 小时窗口' : minutes === 10080 ? '本周窗口' : typeof minutes === 'number' ? `${minutes / 60} 小时窗口` : '额度窗口', usedPct: item.usedPercent, remainingPct: Math.min(100, Math.max(0, 100 - item.usedPercent)), resetAt: typeof item.resetsAt === 'number' && item.resetsAt > 0 ? new Date(item.resetsAt * 1000).toISOString() : null });
  }
  if (!windows.length) throw new Error('额度暂不可用');
  return { windows };
}
export async function collectQuota(executable = process.env.DASHBOARD_CODEX_PATH || 'codex') { return normalizeQuota(await readCodexRateLimits(executable, 20000)); }
