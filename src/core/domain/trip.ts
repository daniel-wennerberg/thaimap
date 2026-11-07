// Trip maths: nights → stays → days, travel days, flight guide prices, ideas per stop. Pure functions.
import type { DayPlan, Flight, FlightKind, IATA, ISODate, LatLng, Place, Stay, Template, Trip } from '../model';
import { PLACES, TEMPLATES, DOMESTIC_FARES, INTL_FARES } from '../data/catalog';
import { T } from '../i18n';
import { addDays, dayDiff, km } from '../util';
import { nf } from '../format';
import { PLACE, DEST, nearestAirport, stopCoord } from './places';

export const STAY_COLORS = ['#0f766e', '#ea580c', '#7c3aed', '#2563eb', '#db2777', '#ca8a04', '#16a34a', '#0891b2'];
const HIGH_MONTHS = [12, 1, 2, 7];

export const normIata = (c: IATA | null | undefined): IATA | null => (c === 'DMK' ? 'BKK' : c ?? null);
export const flightOf = (trip: Trip, kind: FlightKind): Flight | null => trip.flights.find((f) => f.kind === kind) || null;
export const stayColor = (trip: Trip, stay: Stay): string => STAY_COLORS[Math.max(0, trip.stays.indexOf(stay)) % STAY_COLORS.length];
export const stayPlaceName = (s: Stay): string => s.name.split(' / ')[0];
export const stayAirport = (s: Stay): IATA | null =>
  normIata((s.dest && DEST[s.dest]?.airport) || (s.lat != null ? nearestAirport(s as LatLng) : null));

export interface Fare { lo: number; hi: number; rough?: boolean; season?: string }

/** One-way domestic guide fare in THB per person (DMK counts as BKK). */
export function domFare(a: IATA | null, b: IATA | null): Fare | null {
  a = normIata(a); b = normIata(b);
  if (!a || !b || a === b) return null;
  const f = DOMESTIC_FARES[`${a}-${b}`] || DOMESTIC_FARES[`${b}-${a}`];
  if (f) return { lo: f[0], hi: f[1], rough: false };
  const A = PLACE[a], B = PLACE[b];
  if (!A || !B) return null;
  const lo = Math.round((700 + km(A, B) * 1.1) / 100) * 100;
  return { lo, hi: Math.round(lo * 2.6 / 100) * 100, rough: true };
}

/** Return guide fare in SEK per person from the Nordics. */
export function intlFare(home: IATA, to: IATA, date: ISODate): Fare | null {
  const t = INTL_FARES.to[normIata(to) || ''];
  if (!t || !INTL_FARES.origins.includes(home)) return null;
  const high = !!date && HIGH_MONTHS.includes(Number(date.slice(5, 7)));
  const [lo, hi] = high ? t.high : t.low;
  return { lo, hi, season: high ? T('high season') : T('low season') };
}

export interface TripDay {
  i: number;
  date: ISODate;
  stay: Stay | null;          // where you sleep tonight
  base: Stay | null;          // where you are during the day
  from: Stay | null;          // set on travel days (you move from → stay)
  flights: Flight[];
  arrivals: Flight[];
  inAir: boolean;
  hop?: { from: IATA; to: IATA }; // landing at / flying home from an airport away from the stay
}
export interface TripLayout {
  days: TripDay[];
  ranges: Record<string, { from: number; to: number }>;
  totalNights: number;
  diff: number;               // > 0 nights not planned, < 0 too many
  first: number;              // index of the first night in Thailand
}

/** Night-by-night: which stay you sleep at. Overnight flights land the next day. */
export function tripDays(trip: Trip): TripLayout {
  const n = trip.days;
  const out = flightOf(trip, 'out');
  const first = out?.arrDate && trip.start ? Math.min(n - 1, Math.max(0, dayDiff(trip.start, out.arrDate))) : 0;
  const night: (Stay | null)[] = new Array(n).fill(null);
  const ranges: TripLayout['ranges'] = {};
  let c = first;
  trip.stays.forEach((s) => {
    const from = c;
    for (let k = 0; k < s.nights && c < n - 1; k++) night[c++] = s;
    ranges[s.id] = { from, to: c };
  });
  const days: TripDay[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(trip.start, i);
    const prev = i > 0 ? night[i - 1] : null;
    days.push({
      i, date, stay: night[i], base: night[i] || prev,
      from: prev && night[i] && prev !== night[i] ? prev : null,
      flights: trip.flights.filter((f) => f.date === date),
      arrivals: trip.flights.filter((f) => f.arrDate && f.arrDate !== f.date && f.arrDate === date),
      inAir: i < first,
    });
  }
  const home = flightOf(trip, 'home');
  const firstStay = night[first], lastStay = night[n - 2] || null;
  if (out?.to && firstStay && days[first]) {
    const a = stayAirport(firstStay);
    if (a && a !== normIata(out.to)) days[first].hop = { from: normIata(out.to)!, to: a };
  }
  if (home?.from && lastStay && n > 1) {
    const a = stayAirport(lastStay);
    if (a && a !== normIata(home.from)) days[n - 1].hop = { from: a, to: normIata(home.from)! };
  }
  const totalNights = Math.max(0, n - 1 - first);
  const assigned = trip.stays.reduce((t, s) => t + s.nights, 0);
  return { days, ranges, totalNights, diff: totalNights - assigned, first };
}

export const dayPlanFor = (plans: DayPlan[], trip: Trip, date: ISODate): DayPlan | null =>
  plans.find((p) => p.tripId === trip.id && p.date === date) || null;

/** How to get from one stay to the next: a domestic flight (when it makes sense) and/or overland/boat. */
export function transferInfo(a: Stay, b: Stay) {
  const d = km(a as LatLng, b as LatLng);
  const A = stayAirport(a), B = stayAirport(b);
  const fly = A && B && A !== B && d > 250 ? { from: A, to: B, fare: domFare(A, B) } : null;
  const ground = fly && d > 700 ? '' : (b.dest && DEST[b.dest]?.transfer) || `🚕 ~${T('{n} km by road', { n: nf(d * 1.3) })}`;
  return { fly, ground, d };
}

/** Curated places within ~25 km and ready-made days that pass nearby. */
export function ideasFor(s: Stay, max = 14): { places: Place[]; tpls: Template[] } {
  if (s.lat == null) return { places: [], tpls: [] };
  const pt = s as LatLng;
  const places = PLACES.filter((p) => p.cat !== 'airport' && km(pt, p) <= 25)
    .sort((a, b) => km(pt, a) - km(pt, b)).slice(0, max);
  const tpls = TEMPLATES.filter((t) => t.stops.some((x) => PLACE[x.place] && km(pt, PLACE[x.place]) <= 40));
  return { places, tpls };
}

/** Rough flight budget: international return × travellers (SEK) + domestic flights × travellers (THB). */
export function flightBudget(trip: Trip) {
  const out = flightOf(trip, 'out');
  const intl = out ? intlFare(trip.home, out.to, out.date) : null;
  let dLo = 0, dHi = 0, nDom = 0;
  trip.flights.filter((f) => f.kind === 'domestic').forEach((f) => { const p = domFare(f.from, f.to); if (p) { dLo += p.lo; dHi += p.hi; nDom++; } });
  return { out, intl, domestic: { lo: dLo, hi: dHi, count: nDom }, travellers: trip.travellers };
}

export function planAsText(plan: DayPlan): string {
  const lines = [`🇹🇭 ${plan.name}${plan.date ? ' — ' + plan.date : ''}`];
  plan.stops.forEach((s, i) => {
    const c = stopCoord(s);
    lines.push(`${i + 1}. ${s.time ? s.time + ' ' : ''}${c?.name || T('Stop')}${s.note ? ' — ' + s.note : ''}`);
    if (c) lines.push(`   https://maps.google.com/?q=${c.lat},${c.lng}`);
  });
  return lines.join('\n');
}
