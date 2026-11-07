import type { ISODate } from './model';
import { T, LOCALE } from './i18n';

export const ago = (t: number): string => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return T('just now');
  if (s < 3600) return T('{n}m ago', { n: Math.floor(s / 60) });
  if (s < 86400) return T('{n}h ago', { n: Math.floor(s / 3600) });
  if (s < 604800) return T('{n}d ago', { n: Math.floor(s / 86400) });
  return new Date(t).toLocaleDateString(LOCALE);
};

export const fmtDay = (iso: ISODate | '', o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string =>
  (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString(LOCALE, { ...o, timeZone: 'UTC' }) : '');

export const nf = (n: number): string => Math.round(n).toLocaleString(LOCALE);
export const rng = (a: number, b: number, unit: string): string => `${nf(a)}–${nf(b)} ${unit}`;

export const fmtDist = (d: number): string => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);
export const eta = (d: number): string =>
  (d <= 3 ? `🚶 ${Math.max(1, Math.round((d / 4.5) * 60))} min` : `🚕 ${Math.round((d / 25) * 60 + 5)} min`);

export const fmtTime = (at: number): string => {
  const d = new Date(at), today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return today ? t : `${d.toLocaleDateString(LOCALE, { weekday: 'short' })} ${t}`;
};

export const countdown = (at: number): string => {
  const m = Math.round((at - Date.now()) / 60000);
  if (Math.abs(m) < 1) return T('now');
  const s = Math.abs(m) >= 60 ? `${Math.floor(Math.abs(m) / 60)} ${T('h')} ${Math.abs(m) % 60} min` : `${Math.abs(m)} min`;
  return m > 0 ? T('in {t}', { t: s }) : T('{t} ago', { t: s });
};
