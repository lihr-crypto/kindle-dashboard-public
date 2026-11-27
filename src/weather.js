import { fetchJson } from './network.js';
import { dateKey } from './time.js';
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const epoch = seconds => typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
export function weatherDescription(code) {
  if (code === 0) return '晴'; if ([1,2].includes(code)) return '晴间多云'; if (code === 3) return '多云'; if ([45,48].includes(code)) return '雾';
  if ([51,53,55,56,57].includes(code)) return '小雨'; if ([61,63,65,66,67,80,81,82].includes(code)) return '有雨'; if ([71,73,75,77,85,86].includes(code)) return '有雪'; if ([95,96,99].includes(code)) return '雷雨'; return '天气待更新';
}
export function windDirection(degrees) { return typeof degrees === 'number' && Number.isFinite(degrees) ? ['北','东北','东','东南','南','西南','西','西北'][Math.round(((degrees % 360 + 360) % 360) / 45) % 8] : null; }
export function parseWeather(payload, config, now = new Date()) {
  const current = payload.current || {};
  if (finite(current.temperature_2m) === null) throw new Error('天气响应缺少温度');
  const hourly = payload.hourly || {};
  const times = hourly.time || [];
  let start = times.findLastIndex(value => typeof value === 'number' && value * 1000 <= now.getTime());
  if (start < 0) start = 0;
  const forecast = [];
  for (let i = start; i < times.length && forecast.length < 8; i += 2) forecast.push({ at: epoch(times[i]), temperatureC: finite(hourly.temperature_2m?.[i]), rainPct: finite(hourly.precipitation_probability?.[i]) });
  const daily = payload.daily || {};
  const index = (daily.time || []).findIndex(value => epoch(value) && dateKey(new Date(value * 1000), config.timeZone) === dateKey(now, config.timeZone));
  return { temperatureC: finite(current.temperature_2m), feelsLikeC: finite(current.apparent_temperature), humidityPct: finite(current.relative_humidity_2m), windKph: finite(current.wind_speed_10m), windDirection: windDirection(current.wind_direction_10m), weatherCode: current.weather_code, description: weatherDescription(current.weather_code), observedAt: epoch(current.time), maxTempC: index >= 0 ? finite(daily.temperature_2m_max?.[index]) : null, minTempC: index >= 0 ? finite(daily.temperature_2m_min?.[index]) : null, sunset: index >= 0 ? epoch(daily.sunset?.[index]) : null, forecast };
}
export async function collectWeather(config, now = new Date()) {
  const params = new URLSearchParams({ latitude: String(config.latitude), longitude: String(config.longitude), timezone: config.timeZone, timeformat: 'unixtime', forecast_days: '2', current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m', hourly: 'temperature_2m,precipitation_probability', daily: 'temperature_2m_max,temperature_2m_min,sunset' });
  return parseWeather(await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`), config, now);
}
export async function searchLocation(name) {
  if (!name.trim() || name.length > 80) throw new Error('请输入城市名称');
  const payload = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: name.trim(), count: '8', language: 'zh', format: 'json' })}`);
  return (payload.results || []).map(row => ({ name: row.name, region: [row.admin1,row.country].filter(Boolean).join(' · '), latitude: row.latitude, longitude: row.longitude, timeZone: row.timezone }));
}
