import type { LatLng, Place, Stop, TemplateStop } from '../model';
import { PLACES, DESTINATIONS } from '../data/catalog';
import { T } from '../i18n';
import { km } from '../util';

export const PLACE: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const DEST = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
export const AIRPORTS = PLACES.filter((p) => p.cat === 'airport');
export const PRICE = ['', '฿', '฿฿', '฿฿฿', '฿฿฿฿'];

type AnyStop = Partial<Stop> | TemplateStop;

/** Where a plan stop is: a curated place, or a custom stop with its own coordinates. */
export function stopCoord(s: AnyStop): (LatLng & { name: string }) | null {
  if (s.place && PLACE[s.place]) return { lat: PLACE[s.place].lat, lng: PLACE[s.place].lng, name: PLACE[s.place].name };
  const c = s as Partial<Stop>;
  if (c.lat !== null && c.lat !== undefined) return { lat: c.lat, lng: c.lng ?? 0, name: c.name || T('Custom stop') };
  return null;
}

/** "🚶 ~8 min walk · 600 m" / "🚤 ~12 km by boat" / "🚕 ~4.2 km" */
export function legText(a: AnyStop, b: AnyStop): string {
  const ca = stopCoord(a), cb = stopCoord(b);
  if (!ca || !cb) return '';
  const d = km(ca, cb);
  if (d < 1.3) return `🚶 ~${T('{n} min walk', { n: Math.max(2, Math.round(d * 14)) })} · ${(d * 1000).toFixed(0)} m`;
  const island = (s: AnyStop) => !!s.place && ['island', 'beach'].includes(PLACE[s.place]?.cat);
  if (island(a) && island(b)) return `🚤 ~${T('{n} km by boat', { n: d.toFixed(1) })}`;
  return `🚕 ~${d.toFixed(1)} km`;
}

export const totalKm = (stops: AnyStop[]): number => {
  let t = 0;
  for (let i = 1; i < stops.length; i++) { const a = stopCoord(stops[i - 1]), b = stopCoord(stops[i]); if (a && b) t += km(a, b); }
  return t;
};

export function nearestAirport(pt: LatLng, maxKm = 150): string | null {
  let best: Place | null = null, bd = Infinity;
  AIRPORTS.forEach((a) => { const d = km(pt, a); if (d < bd) { bd = d; best = a; } });
  return best && bd <= maxKm ? (best as Place).iata ?? null : null;
}

export const matchesQuery = (p: Place, query: string): boolean => !query ||
  (p.name + ' ' + (p.desc || '') + ' ' + (p.tip || '') + ' ' + (p.iata || '')).toLowerCase().includes(query.toLowerCase());
