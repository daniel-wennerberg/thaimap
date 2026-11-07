// View-level actions shared by both shells: they combine core store calls, view state and the map.
import {
  DEST, PLACE, TEMPLATES, T, LS, rid, addDays, dayDiff, normIata, flightOf, tripDays, transferInfo, stayPlaceName,
  store, Emitter, type DayPlan, type LatLng, type Stay, type Template, type Trip,
} from '../../core';
import { ui, setUI, touchUI, haptic, type MapMode } from './ui-store';
import type { MapController } from '../map/MapController';

// ── toasts (core notifications + view messages) ──
export const toasts = new Emitter<{ toast: string }>();
export const toast = (text: string) => toasts.emit('toast', text);
store.on('notify', ({ text, vibrate }) => { toast(text); if (vibrate) navigator.vibrate?.([120, 60, 120]); });

// ── map ──
let map: MapController | null = null;
export const setMap = (m: MapController | null) => { map = m; };
export const getMap = () => map;

export type Tab = 'explore' | 'plan' | 'family';
let tab: Tab = 'explore';
export const getTab = () => tab;
export function setTab(t: Tab) {
  tab = t;
  if (t === 'family') store.markSeen();
  touchUI();
}

/** Makes sure the user has joined a family before doing family things. */
export function ensureMe(): boolean {
  if (store.state.me) return true;
  toast(T('Tell us who you are first 🙂'));
  setUI({ dialog: 'join' });
  return false;
}

// ── explore ──
export function selectPlace(id: string | null, { fly = true } = {}) {
  setUI({ selected: id, focus: null });
  if (id) { setTab('explore'); if (fly) map?.focusPlace(id); haptic(); }
}
export function setRegion(region: string) { setUI({ region }); map?.showRegion(region); }
export function toggleCat(id: string | null, all: string[]) {
  if (id === null) ui.cats = new Set(all);
  else if (ui.cats.size === all.length) ui.cats = new Set([id]);
  else if (ui.cats.has(id)) ui.cats.delete(id);
  else ui.cats.add(id);
  if (!ui.cats.size) ui.cats = new Set(all);
  touchUI();
}

// ── day plans ──
export const activeTrip = store.activeTrip;
export const activePlan = store.activePlan;
export const looseMode = () => !activeTrip() && store.state.activeTripId === '__loose';
export const tripDayMode = () => !!activeTrip() && ui.view === 'day' && activePlan()?.tripId === store.state.activeTripId;

const savePlan = (p: DayPlan) => { store.queueSave(p, 0); store.changed('plans'); };

export function newPlan(fields: Partial<DayPlan> = {}): DayPlan {
  store.setActiveTrip('__loose'); ui.view = 'trip';
  const plan: DayPlan = { id: rid(), name: T('Day {n}', { n: store.state.plans.filter((p) => !p.tripId).length + 1 }), date: '', type: '', stops: [], ...fields };
  store.state.plans.push(plan);
  store.setActivePlan(plan.id); ui.preview = null;
  savePlan(plan);
  return plan;
}
export function setActivePlan(id: string) { store.setActivePlan(id); setUI({ preview: null }); }

/** target: a plan id, '__new', or 't|tripId|dayIndex' (a trip day, created on first use). */
export function addToDay(target: string, stop: Partial<DayPlan['stops'][number]>) {
  let plan: DayPlan | null;
  if (target.startsWith('t|')) {
    const [, tid, i] = target.split('|');
    const trip = store.state.trips.find((x) => x.id === tid);
    plan = trip ? store.ensureDayPlan(trip, Number(i)) : null;
  } else plan = store.state.plans.find((p) => p.id === target) || newPlan();
  if (!plan) return;
  plan.stops.push({ id: rid(), time: '', note: '', ...stop });
  if (!plan.tripId) store.setActivePlan(plan.id);
  savePlan(plan); haptic();
  toast(T('Added to “{name}” ✓', { name: plan.name }));
}
export function editPlan(plan: DayPlan, patch: Partial<DayPlan>) { Object.assign(plan, patch); store.queueSave(plan); store.changed('plans'); }
export function editStop(plan: DayPlan, idx: number, patch: Partial<DayPlan['stops'][number]>) {
  Object.assign(plan.stops[idx], patch); store.queueSave(plan); store.changed('plans');
}
export function moveStop(plan: DayPlan, idx: number, d: number) {
  const j = idx + d; if (j < 0 || j >= plan.stops.length) return;
  [plan.stops[idx], plan.stops[j]] = [plan.stops[j], plan.stops[idx]]; savePlan(plan);
}
export function removeStop(plan: DayPlan, idx: number) { plan.stops.splice(idx, 1); savePlan(plan); }
export function sortStops(plan: DayPlan) { plan.stops.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); savePlan(plan); }
export async function deletePlan(plan: DayPlan) { await store.deletePlan(plan.id); toast(T('Day deleted')); }

export function previewTemplate(t: Template | null) {
  setUI({ preview: ui.preview?.id === t?.id ? null : t });
  if (ui.preview) map?.fitStops(ui.preview.stops);
}
export function useTemplate(id: string) {
  const tpl = TEMPLATES.find((x) => x.id === id)!;
  const stops = tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time || '', note: s.note || '' }));
  const plan = activePlan();
  if (tripDayMode() && plan) {
    plan.stops.push(...stops); ui.preview = null; savePlan(plan); map?.fitStops(plan.stops);
    toast(T('“{tpl}” added to {name} ✓', { tpl: tpl.name, name: plan.name })); return;
  }
  const p = newPlan({ name: tpl.name, type: tpl.type, stops });
  map?.fitStops(p.stops);
  toast(T('“{tpl}” added to your days ✓', { tpl: tpl.name }));
}
export function addCustomStop(name: string, ll: LatLng, time = '') {
  const plan = activePlan();
  addToDay(plan?.id || '__new', { name, lat: ll.lat, lng: ll.lng, time });
}

// ── trips ──
const saveTrip = (trip: Trip) => { store.queueSave(trip, 0, 'trips'); store.changed('plans'); };

export function setActiveTrip(id: string | null) {
  store.setActiveTrip(id);
  if (id === '__loose') store.setActivePlan(store.state.plans.find((p) => !p.tripId)?.id || null);
  setUI({ view: 'trip', preview: null });
  const t = activeTrip(); if (t) map?.fitTrip(t);
}
export function openDay(trip: Trip, idx: number) {
  const p = store.ensureDayPlan(trip, idx); if (!p) return;
  store.setActivePlan(p.id);
  setUI({ view: 'day', preview: null }); haptic();
  if (p.stops.length) map?.fitStops(p.stops);
  else { const b = tripDays(trip).days[idx]?.base; if (b?.lat != null) map?.flyTo(b as LatLng, 12); }
}
export function backToTimeline() { setUI({ view: 'trip' }); const t = activeTrip(); if (t) map?.fitTrip(t); }
export function stepDay(d: number) {
  const trip = activeTrip(), plan = activePlan(); if (!trip || !plan) return;
  const j = dayDiff(trip.start, plan.date as string) + d;
  if (j >= 0 && j < trip.days) openDay(trip, j);
}
export function currentDayIndex(): number {
  const trip = activeTrip(), plan = activePlan();
  return trip && plan?.date ? dayDiff(trip.start, plan.date) : -1;
}

export interface TripForm {
  name: string; start: string; days: number; travellers: number; home: string;
  outTo: string; outNo: string; outDep: string; outArr: string; outArrNext: number;
  homeFrom: string; homeNo: string; homeDep: string;
}
export function tripFormDefaults(trip?: Trip | null): TripForm {
  const out = trip && flightOf(trip, 'out'), home = trip && flightOf(trip, 'home');
  return {
    name: trip?.name || '', start: trip?.start || '', days: trip?.days || 14, travellers: trip?.travellers || 2, home: trip?.home || 'ARN',
    outTo: out?.to || 'BKK', outNo: out?.flightNo || '', outDep: out?.dep || '', outArr: out?.arr || '',
    outArrNext: out ? Math.max(0, Math.min(1, dayDiff(out.date, out.arrDate || out.date))) : 1,
    homeFrom: home?.from || out?.to || 'BKK', homeNo: home?.flightNo || '', homeDep: home?.dep || '',
  };
}
export function saveTripForm(f: TripForm, existing?: Trip | null): Trip {
  const trip: Trip = existing || { id: rid(), name: '', start: '', days: 14, travellers: 2, home: 'ARN', stays: [], flights: [] };
  const prevStart = trip.start;
  trip.name = f.name.trim().slice(0, 120) || T('Our trip');
  trip.start = f.start;
  trip.days = Math.max(1, Math.min(120, Number(f.days) || 14));
  trip.travellers = Math.max(1, Math.min(20, Number(f.travellers) || 2));
  trip.home = f.home.trim().toUpperCase().slice(0, 3);
  if (existing && prevStart && prevStart !== trip.start) {
    const delta = dayDiff(prevStart, trip.start);
    store.state.plans.filter((p) => p.tripId === trip.id && p.date).forEach((p) => { p.date = addDays(p.date, delta); store.queueSave(p, 0); });
    trip.flights.filter((x) => x.kind === 'domestic').forEach((x) => { x.date = addDays(x.date, delta); });
  }
  let out = flightOf(trip, 'out'); if (!out) { out = { id: rid(), kind: 'out', from: '', to: '', date: '', dep: '', arr: '', flightNo: '' }; trip.flights.push(out); }
  Object.assign(out, { from: trip.home, to: f.outTo, date: trip.start, arrDate: addDays(trip.start, Number(f.outArrNext)),
    dep: f.outDep, arr: f.outArr, flightNo: f.outNo.trim().toUpperCase() });
  let home = flightOf(trip, 'home'); if (!home) { home = { id: rid(), kind: 'home', from: '', to: '', date: '', dep: '', arr: '', flightNo: '' }; trip.flights.push(home); }
  Object.assign(home, { from: f.homeFrom, to: trip.home, date: addDays(trip.start, trip.days - 1), dep: f.homeDep, flightNo: f.homeNo.trim().toUpperCase(), arr: '', arrDate: '' });
  if (!existing) {
    store.state.trips.push(trip);
    const d = Object.values(DEST).find((x) => x.airport === normIata(out!.to)) || DEST.bangkok;
    trip.stays.push({ id: rid(), dest: d.id, name: d.name, lat: d.lat, lng: d.lng, nights: 1 });
    trip.stays[0].nights = Math.max(1, tripDays(trip).totalNights);
  }
  store.queueSave(trip, 0, 'trips');
  setActiveTrip(trip.id);
  setTab('plan');
  toast(existing ? T('Trip updated ✓') : T('“{name}” created — add your stops 🧳', { name: trip.name }));
  return trip;
}
export async function deleteTrip(trip: Trip) {
  const n = trip.name;
  await store.deleteTrip(trip);
  setActiveTrip(store.state.activeTripId);
  toast(T('“{name}” deleted', { name: n }));
}
export function addStay(trip: Trip, st: Omit<Stay, 'id' | 'nights'>) {
  const { diff } = tripDays(trip);
  let nights = 2;
  if (diff > 0) nights = Math.min(diff, 3);
  else {
    const big = [...trip.stays].sort((a, b) => b.nights - a.nights)[0];
    if (big && big.nights > 1) { const take = Math.min(2, big.nights - 1); big.nights -= take; nights = take; }
  }
  trip.stays.push({ id: rid(), nights, ...st });
  saveTrip(trip); haptic();
  toast(T('{name} added — {n} {nights}', { name: st.name, n: nights, nights: T(nights === 1 ? 'night' : 'nights') }));
}
export function addStayFromDest(trip: Trip, destId: string) {
  const d = DEST[destId]; if (d) addStay(trip, { dest: d.id, name: d.name, lat: d.lat, lng: d.lng });
}
export function stayNights(trip: Trip, s: Stay, d: number) { s.nights = Math.max(0, Math.min(90, s.nights + d)); store.queueSave(trip, 400, 'trips'); store.changed('plans'); haptic(4); }
export function moveStay(trip: Trip, s: Stay, d: number) {
  const k = trip.stays.indexOf(s), j = k + d; if (j < 0 || j >= trip.stays.length) return;
  [trip.stays[k], trip.stays[j]] = [trip.stays[j], trip.stays[k]]; saveTrip(trip);
}
export function removeStay(trip: Trip, s: Stay) { trip.stays.splice(trip.stays.indexOf(s), 1); ui.openIdeas.delete(s.id); saveTrip(trip); }
export function toggleIdeas(id: string) { ui.openIdeas.has(id) ? ui.openIdeas.delete(id) : ui.openIdeas.add(id); touchUI(); }
export function addDomesticFlight(trip: Trip, idx: number, hop = false) {
  const d = tripDays(trip).days[idx]; if (!d) return;
  const leg = hop ? d.hop : d.from && d.stay ? transferInfo(d.from, d.stay).fly : null;
  if (!leg) return;
  trip.flights.push({ id: rid(), kind: 'domestic', from: leg.from, to: leg.to, date: d.date, dep: '', arr: '', flightNo: '', note: '' });
  saveTrip(trip); toast(T('✈️ {route} added to the budget', { route: `${leg.from}→${leg.to}` }));
}
export function removeFlight(trip: Trip, id: string) { trip.flights = trip.flights.filter((f) => f.id !== id); saveTrip(trip); }
export function ideaToDay(trip: Trip, placeId: string, idx: number) {
  const dp = store.ensureDayPlan(trip, idx); if (!dp) return;
  dp.stops.push({ id: rid(), time: '', note: '', place: placeId }); savePlan(dp); haptic();
  toast(`${PLACE[placeId]?.name} → ${dp.name} ✓`);
}
export function templateToDay(trip: Trip, tplId: string, idx: number) {
  const tpl = TEMPLATES.find((x) => x.id === tplId); const dp = store.ensureDayPlan(trip, idx); if (!tpl || !dp) return;
  dp.stops.push(...tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time || '', note: s.note || '' }))); savePlan(dp);
  toast(`“${tpl.name}” → ${dp.name} ✓`);
}
export function focusStay(trip: Trip, id: string) {
  const s = trip.stays.find((x) => x.id === id); if (!s) return;
  ui.openIdeas.add(id); setUI({ view: 'trip' }); setTab('plan');
  if (s.lat != null) map?.flyTo(s as LatLng, 11);
}
export { stayPlaceName };

// ── map modes & drafts (tap on the map to place something) ──
export function startMode(mode: MapMode) {
  if ((mode === 'note' || mode === 'meet') && !ensureMe()) return;
  setUI({ mode: ui.mode === mode ? null : mode, draft: null });
  map?.setCrosshair(!!ui.mode);
}
export function cancelMode() { setUI({ mode: null, draft: null }); map?.setCrosshair(false); }
export function mapTapped(ll: LatLng) {
  const kind = ui.mode; if (!kind) return;
  if (kind === 'meet' && !store.state.online) { toast(T('Meetups need the server connection')); return cancelMode(); }
  setUI({ mode: null, draft: { kind, lat: ll.lat, lng: ll.lng } });
  map?.setCrosshair(false);
}
export function openMeetupDraft(ll: LatLng, title = '', placeId = '') {
  if (!ensureMe()) return;
  if (!store.state.online) { toast(T('Meetups need the server connection')); return; }
  setUI({ draft: { kind: 'meet', lat: ll.lat, lng: ll.lng, title, placeId } });
}

// ── notes ──
export async function postNote(body: { text: string; kind?: string; placeId?: string | null; parentId?: string | null; lat?: number | null; lng?: number | null }) {
  if (!ensureMe()) return false;
  const me = store.state.me!;
  try {
    const n = await store.addNote({ text: body.text, kind: body.kind || 'note', author: me.name, color: me.color,
      placeId: body.placeId || null, parentId: body.parentId || null, lat: body.lat ?? null, lng: body.lng ?? null });
    if (body.parentId) ui.openReplies.delete(body.parentId);
    if (body.lat != null && !body.placeId && !body.parentId) setUI({ draft: null, focus: { type: 'note', id: n.id } });
    else touchUI();
    haptic();
    return true;
  } catch (e) { toast(T('Could not post: ') + (e as Error).message); return false; }
}
export async function deleteNote(id: string) {
  try { await store.deleteNote(id); toast(T('Deleted')); if (ui.focus?.id === id) setUI({ focus: null }); }
  catch (e) { toast(T('Could not delete: ') + (e as Error).message); }
}
export function toggleReply(id: string) {
  if (!ensureMe()) return;
  ui.openReplies.has(id) ? ui.openReplies.delete(id) : ui.openReplies.add(id); touchUI();
}

// ── family, live, meetups ──
export function joinFamily(name: string, rawCode: string, color: string) {
  const code = rawCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  name = name.trim().slice(0, 40);
  if (!name || code.length < 3) return false;
  history.replaceState(null, '', `?family=${encodeURIComponent(code)}`);
  store.join({ name, color }, code);
  setUI({ dialog: null });
  toast(T('Welcome, {name}! 🙏', { name }));
  return true;
}
export function randomCode() {
  const words = ['mango', 'tuktuk', 'lotus', 'coconut', 'elephant', 'longtail', 'orchid', 'padthai', 'monsoon', 'jasmine'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${w()}-${Math.floor(100 + Math.random() * 900)}`;
}
export const inviteLink = () => `${location.origin}${location.pathname}?family=${encodeURIComponent(store.state.family || '')}`;
export function setSharing(on: boolean) { if (on && !ensureMe()) on = false; store.setSharing(on); }
export async function createMeetup(title: string, time: string) {
  const d = ui.draft; if (!d) return;
  const m = await store.createMeetup({ title: title.trim() || T('Meet here'), lat: d.lat, lng: d.lng, at: store.meetTimeToTs(time), placeId: d.placeId || null });
  if (m) { setUI({ draft: null, focus: { type: 'meetup', id: m.id } }); haptic(20); }
}
export function meetInTheMiddle() {
  const mp = store.midpoint();
  if (!mp) return toast(T('Need at least two people sharing their location'));
  map?.flyTo(mp.target, Math.max(map.map.getZoom(), 15));
  openMeetupDraft(mp.target, mp.place ? mp.place.name : T('Halfway point'), mp.place?.id || '');
}
export function fitFamily() {
  const pts = [...store.freshLocs(), ...store.activeMeetups()];
  if (!pts.length) { toast(T('Nobody is sharing a location yet')); setTab('family'); return; }
  map?.fitBounds(pts, 70, 16);
}
export function focusMember(id: string) { const l = store.state.locations[id]; if (l) map?.flyTo(l, Math.max(map.map.getZoom(), 16)); }
export function focusMeetup(id: string) {
  const m = store.state.meetups.find((x) => x.id === id); if (!m) return;
  setUI({ focus: { type: 'meetup', id } });
  map?.flyTo(m, Math.max(map.map.getZoom(), 16));
}
export function focusNote(id: string) {
  let n = store.state.notes.find((x) => x.id === id); if (!n) return;
  if (n.parentId) n = store.state.notes.find((x) => x.id === n!.parentId) || n;
  if (n.placeId) return selectPlace(n.placeId);
  setUI({ focus: { type: 'note', id: n.id }, selected: null });
  if (n.lat != null) map?.flyTo(n as LatLng, Math.max(map.map.getZoom(), 14));
}

// ── device ──
export function locate() {
  if (!navigator.geolocation) return toast(T('Location is not available in this browser'));
  navigator.geolocation.getCurrentPosition((pos) => {
    const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!map?.isInThailand(ll)) return toast(T('You’re outside Thailand — see you there soon! ✈️'));
    map.showMe(ll);
  }, () => toast(T('Could not get your location (it needs https or localhost)')), { enableHighAccuracy: true, timeout: 10000 });
}
export async function copyText(text: string, msg: string) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast(T('Copy failed — select the text manually')); }
    ta.remove();
  }
}
export async function shareText(text: string) {
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
  copyText(text, T('Copied — paste it in WhatsApp/Messenger'));
}
export const setLangPref = (lang: 'en' | 'sv') => { LS.set('lang', lang); location.reload(); };
