import { CATEGORIES, REGIONS, PLACES, TEMPLATES, DESTINATIONS } from '../data/catalog';
import { LS } from '../util';
import { I18N_SV } from './sv';
import { DATA_SV } from './data.sv';

export type Lang = 'en' | 'sv';

export const LANG: Lang = (() => {
  const s = LS.get<string | null>('lang', null);
  if (s === 'sv' || s === 'en') return s;
  return typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
})();
export const LOCALE = LANG === 'sv' ? 'sv-SE' : 'en-GB';

/** T('Added to “{name}” ✓', { name }) — the English text is the key; Swedish lives in sv.ts. */
export function T(s: string, v?: Record<string, unknown>): string {
  let r = (LANG === 'sv' && I18N_SV[s]) || s;
  if (v) r = r.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
  return r;
}

/** Switch language (the app reloads so every view re-renders in the new language). */
export function setLang(lang: Lang): void { LS.set('lang', lang); location.reload(); }

// Swedish texts for the curated catalogue (applied once, in place).
if (LANG === 'sv') {
  const D = DATA_SV;
  Object.entries(D.categories || {}).forEach(([k, l]) => { if (CATEGORIES[k]) CATEGORIES[k].label = l; });
  Object.entries(D.regions || {}).forEach(([k, l]) => { if (REGIONS[k]) REGIONS[k].label = l; });
  PLACES.forEach((p) => Object.assign(p, D.places?.[p.id] || {}));
  TEMPLATES.forEach((t) => {
    const x = D.templates?.[t.id]; if (!x) return;
    if (x.name) t.name = x.name;
    if (x.blurb) t.blurb = x.blurb;
    (x.notes || []).forEach((n, i) => { if (t.stops[i] && n) t.stops[i].note = n; });
  });
  DESTINATIONS.forEach((d) => { const x = D.destinations?.[d.id]; if (x?.transfer) d.transfer = x.transfer; });
}
if (typeof document !== 'undefined') document.documentElement.lang = LANG;
