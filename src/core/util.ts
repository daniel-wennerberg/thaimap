import type { ISODate, LatLng } from './model';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const rid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** localStorage with a namespace and JSON, never throwing (private mode, quota). */
export const LS = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('thaimap:' + k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown): void {
    try { localStorage.setItem('thaimap:' + k, JSON.stringify(v)); } catch { /* private mode */ }
  },
};

/** Great-circle distance in km. */
export const km = (a: LatLng, b: LatLng): number => {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const addDays = (iso: ISODate | '', n: number): ISODate => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayDiff = (a: ISODate, b: ISODate): number =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export const localToday = (): ISODate => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};

/** Tiny typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(p: never) => void>>();
  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn as (p: never) => void);
    return () => this.map.get(type)?.delete(fn as (p: never) => void);
  }
  emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.map.get(type)?.forEach((fn) => (fn as (p: E[K]) => void)(payload));
  }
}
