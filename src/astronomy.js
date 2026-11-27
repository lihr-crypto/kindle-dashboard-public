import { createRequire } from 'node:module';
import { calendarDayDiff, dateKey, localToDate } from './time.js';
const A = createRequire(import.meta.url)('astronomy-engine');
const terms = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
export function phaseName(degrees) {
  if (degrees < 10 || degrees >= 350) return '新月';
  if (degrees < 80) return '蛾眉月';
  if (degrees < 100) return '上弦月';
  if (degrees < 170) return '盈凸月';
  if (degrees < 190) return '满月';
  if (degrees < 260) return '亏凸月';
  if (degrees < 280) return '下弦月';
  return '残月';
}
export function astronomy(now, config) {
  const start = localToDate(`${dateKey(now, config.timeZone)}T00:00`, config.timeZone);
  const observer = new A.Observer(config.latitude, config.longitude, 0);
  const phaseDegrees = A.MoonPhase(now);
  const full = A.SearchMoonPhase(180, now, 35);
  const angle = (Math.floor(A.SunPosition(now).elon / 15) + 1) * 15 % 360;
  const solar = A.SearchSunLongitude(angle, now, 32);
  const iso = event => event?.date.toISOString() || null;
  return { phaseDegrees, phaseName: phaseName(phaseDegrees), illuminatedPct: Math.round(A.Illumination(A.Body.Moon, now).phase_fraction * 100), waxing: phaseDegrees < 180, moonrise: iso(A.SearchRiseSet(A.Body.Moon, observer, 1, start, 1)), moonset: iso(A.SearchRiseSet(A.Body.Moon, observer, -1, start, 1)), sunset: iso(A.SearchRiseSet(A.Body.Sun, observer, -1, start, 1)), nextFullMoon: iso(full), daysToFullMoon: full ? calendarDayDiff(full.date, now, config.timeZone) : null, nextSolarTerm: solar ? { name: terms[angle / 15], at: iso(solar), days: calendarDayDiff(solar.date, now, config.timeZone) } : null };
}
