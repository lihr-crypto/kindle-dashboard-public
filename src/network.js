import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function fetchJson(url, timeoutMs = 10000) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['api.open-meteo.com','geocoding-api.open-meteo.com'].includes(parsed.hostname)) throw new Error('不支持的数据来源');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (first) {
    // macOS Python/Node trust or proxy configuration can differ from curl.
    try {
      const { stdout } = await run('curl', ['--fail','--silent','--show-error','--connect-timeout','6','--max-time',String(Math.ceil(timeoutMs / 1000)),url], { maxBuffer: 3 * 1024 * 1024, timeout: timeoutMs + 1000 });
      return JSON.parse(stdout);
    } catch { throw new Error('天气服务连接失败，请稍后刷新'); }
  }
}
