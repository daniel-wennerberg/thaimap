// The data layer: family state, server sync (REST + SSE), on-device fallback, live location and meetups.
// Views never talk to the server — they call these actions and re-render on the emitted events.
import type {
  DayPlan, FamilySnapshot, LatLng, Me, Meetup, MeetStatus, MemberLocation, Note, Place, ServerEvent, Trip,
} from './model';
import { PLACES } from './data/catalog';
import { T } from './i18n';
import { Emitter, LS, km, rid } from './util';
import { idbGet, idbSet } from './persist';
import { fmtTime } from './format';
import { PLACE } from './domain/places';
import { dayPlanFor, stayPlaceName, tripDays } from './domain/trip';

export interface StoreEvents extends Record<string, unknown> {
  all: void;            // everything (re)loaded
  notes: void;
  plans: void;          // day plans and/or trips changed
  live: void;           // member locations changed
  meetups: void;
  sharing: boolean;     // my location sharing switched on/off
  conn: string;         // connection banner text ('' = hide)
  notify: { text: string; vibrate?: boolean };
}

export interface FamilyState {
  me: Me | null;
  family: string | null;
  notes: Note[];
  plans: DayPlan[];
  trips: Trip[];
  meetups: Meetup[];
  locations: Record<string, MemberLocation>;
  online: boolean;
  sharing: boolean;
  activeTripId: string | null;   // a trip id, '__loose' for loose days, or null
  activePlanId: string | null;
  lastSeen: number;
}

export const STALE = 10 * 60e3;
export const memberId: string = LS.get<string | null>('memberId', null) || (() => { const id = 'm' + rid(); LS.set('memberId', id); return id; })();

const bus = new Emitter<StoreEvents>();
export const on = bus.on.bind(bus);
const emit = bus.emit.bind(bus);
const notify = (text: string, vibrate = false) => emit('notify', { text, vibrate });

export const state: FamilyState = {
  me: LS.get<Me | null>('me', null),
  family: LS.get<string | null>('family', null),
  notes: [], plans: [], trips: [], meetups: [], locations: {},
  online: false,
  sharing: LS.get('sharing', false),
  activeTripId: LS.get<string | null>('activeTrip', null),
  activePlanId: LS.get<string | null>('activePlan', null),
  lastSeen: LS.get('lastSeen', 0),
};

const dirty = new Set<string>();
const lastRev: Record<string, string> = {};
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let es: EventSource | null = null;

// ── selectors ─────────────────────────────────────────────────
export const activeTrip = (): Trip | null => state.trips.find((t) => t.id === state.activeTripId) || null;
export const activePlan = (): DayPlan | null => state.plans.find((p) => p.id === state.activePlanId) || null;
export const dayPlan = (trip: Trip, date: string): DayPlan | null => dayPlanFor(state.plans, trip, date);
export const activeMeetups = (): Meetup[] => state.meetups
  .filter((m) => (m.at || m.createdAt) > Date.now() - 3 * 3600e3)
  .sort((a, b) => (a.at || a.createdAt) - (b.at || b.createdAt));
export const freshLocs = (): MemberLocation[] => Object.values(state.locations).filter((l) => Date.now() - l.ts < 3 * 3600e3);
export function members(): [string, string][] {
  const m = new Map<string, string>();
  [...state.notes].sort((a, b) => a.createdAt - b.createdAt).forEach((n) => m.set(n.author, n.color));
  state.plans.forEach((p) => { if (p.updatedBy && !m.has(p.updatedBy)) m.set(p.updatedBy, '#475569'); });
  if (state.me) m.set(state.me.name, state.me.color);
  return [...m.entries()];
}
export const hasUnread = () => state.notes.some((n) => n.createdAt > state.lastSeen && n.author !== state.me?.name);
export const markSeen = () => { state.lastSeen = Date.now(); LS.set('lastSeen', state.lastSeen); };

// ── server / on-device ────────────────────────────────────────
// Every family keeps a snapshot on the device (IndexedDB). When the family has a server and the network is
// gone, changes are applied locally and queued in an outbox that is replayed as soon as the server is back.
type Op =
  | { op: 'put'; kind: 'plans' | 'trips'; id: string }
  | { op: 'del'; kind: 'plans' | 'trips' | 'notes'; id: string }
  | { op: 'note'; note: Note };
interface Snapshot { notes: Note[]; plans: DayPlan[]; trips: Trip[]; server: boolean; savedAt: number }

const base = () => `/api/family/${encodeURIComponent(state.family || '')}`;
const snapKey = () => 'fam:' + (state.family || 'solo');
const outboxKey = () => 'outbox:' + (state.family || 'solo');
let hasServer = false;          // this family has synced with a server before → queue offline changes
let outbox: Op[] = [];
let snapTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

/** HTTP error from the server (as opposed to the network being down). */
class HttpError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function req<R = unknown>(method: string, path = '', body?: unknown): Promise<R> {
  const r = await fetch(base() + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new HttpError((await r.json().catch(() => ({}))).error || r.statusText, r.status);
  return r.json() as Promise<R>;
}

export const pendingChanges = () => outbox.length;

export function connMessage(): string {
  if (!state.family || state.online) return '';
  if (hasServer) {
    return outbox.length
      ? T('📴 Offline — {n} changes will sync when you’re back online', { n: outbox.length })
      : T('📴 Offline — showing your saved trip. Changes sync when you’re back online');
  }
  if (location.hostname.endsWith('github.io')) return T('ℹ️ Web-only version: notes & plans are saved on this device (family sync needs the server)');
  return location.protocol.startsWith('http')
    ? T('⚠️ Can’t reach the server — changes are saved on this device only')
    : T('⚠️ Opened as a file — run “npm start” to share with family');
}

/** Save the family snapshot on the device (debounced). */
function persist() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    const snap: Snapshot = { notes: state.notes, plans: state.plans, trips: state.trips, server: hasServer, savedAt: Date.now() };
    idbSet(snapKey(), snap);
  }, 150);
}
function enqueue(op: Op) {
  if (op.op === 'put') outbox = outbox.filter((o) => !(o.op === 'put' && o.id === op.id)); // keep only the latest put per doc
  outbox.push(op);
  idbSet(outboxKey(), outbox);
  emit('conn', connMessage());
}
/** Run a server write now, or queue it when offline. Network failure while "online" flips us to offline. */
async function write(op: Op, run: () => Promise<unknown>): Promise<void> {
  if (!hasServer) return;                       // on-device only family: nothing to send
  if (!state.online) return enqueue(op);
  try { await run(); } catch (e) {
    if (e instanceof HttpError) { notify(T('Could not save: ') + e.message); return; }
    goOffline(); enqueue(op);
  }
}
function goOffline() {
  if (!state.online) return;
  state.online = false;
  if (es) { es.close(); es = null; }
  emit('conn', connMessage());
  scheduleRetry();
}
function scheduleRetry() {
  clearTimeout(retryTimer);
  if (hasServer && state.family) retryTimer = setTimeout(() => connect(), 20000);
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (hasServer && !state.online) connect(); });

/** Replay queued offline changes (oldest first). Stops at the first network failure. */
async function flushOutbox(): Promise<boolean> {
  if (flushing || !outbox.length) return true;
  flushing = true;
  try {
    while (outbox.length) {
      const o = outbox[0];
      try {
        if (o.op === 'note') await req('POST', '/notes', o.note);
        else if (o.op === 'del') await req('DELETE', `/${o.kind}/` + encodeURIComponent(o.id));
        else {
          const doc = (state[o.kind] as { id: string }[]).find((d) => d.id === o.id);
          if (doc) await req('PUT', `/${o.kind}/` + o.id, doc);
        }
      } catch (e) {
        if (!(e instanceof HttpError)) return false; // network still flaky — try again later
        // the server rejected it (e.g. already deleted) — drop it and carry on
      }
      outbox.shift();
      await idbSet(outboxKey(), outbox);
    }
    return true;
  } finally { flushing = false; }
}

function loadLive(d: FamilySnapshot) {
  state.meetups = d.meetups || [];
  state.locations = Object.fromEntries((d.locations || []).map((l) => [l.memberId, l]));
}
function mergeDocs<K extends 'plans' | 'trips'>(kind: K, serverDocs: FamilyState[K]) {
  const keep = (state[kind] as { id: string }[]).filter((p) => dirty.has(p.id));
  state[kind] = (serverDocs as { id: string }[]).filter((p) => !dirty.has(p.id)).concat(keep) as FamilyState[K];
}
function applySnapshot(d: { notes: Note[]; plans: DayPlan[]; trips?: Trip[] }) {
  state.notes = d.notes || []; state.plans = d.plans || []; state.trips = d.trips || [];
}
function fixSelection() {
  if (!activePlan()) state.activePlanId = state.plans[0]?.id || null;
  if (!activeTrip() && !(state.activeTripId === '__loose' && state.plans.some((p) => !p.tripId)))
    state.activeTripId = state.trips[0]?.id || (state.plans.some((p) => !p.tripId) ? '__loose' : null);
}

let loadedFamily: string | null | undefined;

/** (Re)load the family: instantly from this device, then from the server when reachable. */
export async function connect(): Promise<void> {
  clearTimeout(retryTimer);
  if (es) { es.close(); es = null; }
  state.online = false;
  // 1) on-device snapshot first, so the trip shows instantly — also with no network at all
  if (loadedFamily !== state.family) {
    loadedFamily = state.family;
    const snap = await idbGet<Snapshot>(snapKey());
    const legacy = LS.get<{ notes: Note[]; plans: DayPlan[]; trips?: Trip[] } | null>('local:' + (state.family || 'solo'), null);
    hasServer = !!snap?.server;
    outbox = (await idbGet<Op[]>(outboxKey())) || [];
    applySnapshot(snap || legacy || { notes: [], plans: [] });
    state.meetups = []; state.locations = {};
    fixSelection();
    emit('all', undefined);
  }
  // 2) the server, if there is one
  if (state.family && location.protocol.startsWith('http')) {
    try {
      let data = await req<FamilySnapshot>('GET');
      if (!hasServer) {
        // first contact with a server: upload what was planned on this device before, instead of losing it
        const known = new Set([...data.plans, ...(data.trips || []), ...data.notes].map((d) => d.id));
        state.trips.forEach((t) => { if (!known.has(t.id)) outbox.push({ op: 'put', kind: 'trips', id: t.id }); });
        state.plans.forEach((p) => { if (!known.has(p.id)) outbox.push({ op: 'put', kind: 'plans', id: p.id }); });
        state.notes.forEach((n) => { if (!known.has(n.id)) outbox.push({ op: 'note', note: n }); });
      }
      hasServer = true; state.online = true;
      if (outbox.length) {                       // send what was changed offline, then reload the merged result
        await flushOutbox();
        data = await req<FamilySnapshot>('GET');
      }
      applySnapshot(data);
      loadLive(data);
      persist();
      openStream();
    } catch (e) {
      state.online = false;
      if (!(e instanceof HttpError)) scheduleRetry();
    }
  }
  fixSelection();
  emit('conn', connMessage());
  emit('all', undefined);
  if (state.sharing && state.online) startSharing();
}

function openStream() {
  es = new EventSource(base() + '/events');
  let first = true;
  es.onopen = async () => {
    const wasOffline = !state.online;
    state.online = true;
    emit('conn', connMessage());
    if (first && !wasOffline) { first = false; return; }
    first = false;
    try {
      await flushOutbox();
      const d = await req<FamilySnapshot>('GET');
      state.notes = d.notes; mergeDocs('plans', d.plans); mergeDocs('trips', d.trips || []); loadLive(d);
      persist();
      emit('conn', connMessage());
      emit('all', undefined);
      if (myPos) sendPosition();
    } catch { /* retry later */ }
  };
  es.onerror = () => {
    // EventSource retries by itself; meanwhile writes go to the outbox
    if (state.online) { state.online = false; emit('conn', T('Reconnecting to family…')); }
  };
  es.onmessage = (e) => { try { applyEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
}

/** Join (or rename within) a family. Returns true when the family changed and data is reloading. */
export function join(me: Me, code: string): boolean {
  const changed = code !== state.family;
  if (changed && state.online && state.family) req('DELETE', '/locations/' + memberId).catch(() => {});
  state.me = me; state.family = code;
  LS.set('me', me); LS.set('family', code);
  if (changed) connect(); else emit('all', undefined);
  return changed;
}

function applyEvent(ev: ServerEvent) {
  if (ev.type.startsWith('note') || ev.type.startsWith('plan') || ev.type.startsWith('trip')) persist();
  switch (ev.type) {
    case 'note:add': {
      if (state.notes.some((n) => n.id === ev.note.id)) return;
      state.notes.push(ev.note);
      if (ev.note.author !== state.me?.name) {
        const where = (ev.note.placeId && PLACE[ev.note.placeId]?.name) || T('the map');
        notify(T('💬 {who} commented on {where}', { who: ev.note.author, where }));
      }
      return emit('notes', undefined);
    }
    case 'note:delete': {
      const ids = new Set(ev.ids);
      state.notes = state.notes.filter((n) => !ids.has(n.id));
      return emit('notes', undefined);
    }
    case 'plan:put': {
      const p = ev.plan;
      if (dirty.has(p.id) || (lastRev[p.id] && p.rev === lastRev[p.id])) return; // our own echo
      const i = state.plans.findIndex((x) => x.id === p.id);
      if (i >= 0) state.plans[i] = p; else state.plans.push(p);
      if (!state.activePlanId) state.activePlanId = p.id;
      return emit('plans', undefined);
    }
    case 'plan:delete':
      state.plans = state.plans.filter((p) => p.id !== ev.id);
      if (state.activePlanId === ev.id) state.activePlanId = state.plans[0]?.id || null;
      return emit('plans', undefined);
    case 'trip:put': {
      const t = ev.trip;
      if (dirty.has(t.id) || (lastRev[t.id] && t.rev === lastRev[t.id])) return;
      const i = state.trips.findIndex((x) => x.id === t.id);
      if (i >= 0) state.trips[i] = t; else { state.trips.push(t); if (!activeTrip()) state.activeTripId = t.id; }
      if (t.updatedBy && t.updatedBy !== state.me?.name && i < 0) notify(T('🧳 {who} created the trip “{name}”', { who: t.updatedBy, name: t.name }));
      return emit('plans', undefined);
    }
    case 'trip:delete':
      state.trips = state.trips.filter((t) => t.id !== ev.id);
      if (state.activeTripId === ev.id) state.activeTripId = state.trips[0]?.id || null;
      return emit('plans', undefined);
    case 'loc:put':
      if (ev.loc.memberId === memberId && !state.sharing) return; // stale echo after turning off
      state.locations[ev.loc.memberId] = ev.loc;
      return emit('live', undefined);
    case 'loc:delete':
      delete state.locations[ev.memberId];
      return emit('live', undefined);
    case 'meetup:put': {
      const prev = state.meetups.find((x) => x.id === ev.meetup.id);
      const m = ev.meetup;
      if (!prev && m.createdBy !== state.me?.name) {
        notify(T('🚩 {who} set a meetup: {name}', { who: m.createdBy, name: m.title }) + (m.at ? ' ' + T('at') + ' ' + fmtTime(m.at) : ''), true);
      } else if (prev) {
        Object.entries(m.status).forEach(([id, s]) => {
          if (id !== memberId && s.status !== prev.status[id]?.status) {
            const [icon, label] = STATUS[s.status];
            notify(`${icon} ${s.name}: ${label} — ${m.title}`);
          }
        });
      }
      return upsertMeetup(m);
    }
    case 'meetup:delete':
      state.meetups = state.meetups.filter((m) => m.id !== ev.id);
      return emit('meetups', undefined);
  }
}

// ── notes ─────────────────────────────────────────────────────
export async function addNote(body: Omit<Note, 'id' | 'createdAt'>): Promise<Note> {
  const n: Note = { ...body, id: rid(), createdAt: Date.now() };
  if (state.online && hasServer) {
    try {
      const saved = await req<Note>('POST', '/notes', n);
      if (!state.notes.some((x) => x.id === saved.id)) state.notes.push(saved);
      persist(); emit('notes', undefined); return saved;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      goOffline();
    }
  }
  state.notes.push(n);
  if (hasServer) enqueue({ op: 'note', note: n });
  persist(); emit('notes', undefined);
  return n;
}
export async function deleteNote(id: string): Promise<void> {
  state.notes = state.notes.filter((n) => n.id !== id && n.parentId !== id);
  persist(); emit('notes', undefined);
  await write({ op: 'del', kind: 'notes', id }, () => req('DELETE', '/notes/' + encodeURIComponent(id)));
}

// ── plans & trips (mutate in place, then queueSave) ───────────
/** Debounced save with own-echo suppression via rev. kind: 'plans' | 'trips'. */
export function queueSave(doc: { id: string }, delay = 600, kind: 'plans' | 'trips' = 'plans'): void {
  dirty.add(doc.id);
  clearTimeout(saveTimers[doc.id]);
  saveTimers[doc.id] = setTimeout(() => saveDoc(kind, doc.id), delay);
}
async function saveDoc(kind: 'plans' | 'trips', id: string) {
  const doc = (state[kind] as (DayPlan | Trip)[]).find((p) => p.id === id);
  if (!doc) return;
  doc.rev = rid(); lastRev[id] = doc.rev; doc.updatedBy = state.me?.name || '';
  dirty.delete(id);
  persist();
  await write({ op: 'put', kind, id }, () => req('PUT', `/${kind}/` + id, doc));
}
export const changed = (what: 'plans' | 'notes' = 'plans') => emit(what, undefined);

export async function deletePlan(id: string): Promise<void> {
  clearTimeout(saveTimers[id]); dirty.delete(id);
  state.plans = state.plans.filter((p) => p.id !== id);
  if (state.activePlanId === id) state.activePlanId = state.plans[0]?.id || null;
  persist();
  outbox = outbox.filter((o) => !(o.op === 'put' && o.id === id));
  await write({ op: 'del', kind: 'plans', id }, () => req('DELETE', '/plans/' + id));
  emit('plans', undefined);
}
export async function deleteTrip(trip: Trip): Promise<void> {
  for (const p of state.plans.filter((x) => x.tripId === trip.id)) await deletePlan(p.id);
  clearTimeout(saveTimers[trip.id]); dirty.delete(trip.id);
  state.trips = state.trips.filter((t) => t.id !== trip.id);
  persist();
  outbox = outbox.filter((o) => !(o.op === 'put' && o.id === trip.id));
  await write({ op: 'del', kind: 'trips', id: trip.id }, () => req('DELETE', '/trips/' + trip.id));
  state.activeTripId = state.trips[0]?.id || (state.plans.some((p) => !p.tripId) ? '__loose' : null);
  LS.set('activeTrip', state.activeTripId);
  emit('plans', undefined);
}

export function setActiveTrip(id: string | null) { state.activeTripId = id; LS.set('activeTrip', id); }
export function setActivePlan(id: string | null) { state.activePlanId = id; LS.set('activePlan', id); }

/** The day plan for a trip day — created (and saved) on first use. */
export function ensureDayPlan(trip: Trip, idx: number): DayPlan | null {
  const d = tripDays(trip).days[idx]; if (!d) return null;
  let p = dayPlan(trip, d.date);
  if (!p) {
    p = { id: rid(), name: `${T('Day {n}', { n: idx + 1 })}${d.base ? ' · ' + stayPlaceName(d.base) : ''}`, date: d.date, type: '', tripId: trip.id, stops: [] };
    state.plans.push(p); queueSave(p, 0);
  }
  return p;
}

// ── live location ─────────────────────────────────────────────
export const STATUS: Record<MeetStatus, [string, string]> = {
  coming: ['🚶', T('On my way')], late: ['⏰', T('Running late')], here: ['✅', T('I’m here')], cant: ['❌', T('Can’t make it')],
};
let watchId: number | null = null, lastSent: LatLng | null = null, lastSentAt = 0;
export let myPos: (LatLng & { acc: number }) | null = null;
const autoArrived = new Set<string>();

function startSharing(): boolean {
  if (!state.online) { notify(T('Live location needs the server connection')); return false; }
  if (!navigator.geolocation) { notify(T('Location is not available in this browser')); return false; }
  if (!window.isSecureContext) { notify(T('Location sharing needs https (or localhost) — see README')); return false; }
  stopWatch();
  watchId = navigator.geolocation.watchPosition(onPosition, (err) => {
    notify(err.code === 1 ? T('Location permission denied — allow it in browser settings') : T('Could not get your location yet…'));
    if (err.code === 1) setSharing(false);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  return true;
}
function stopWatch() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; }

/** Turn location sharing on/off (the view checks that the user has joined first). */
export function setSharing(on: boolean): boolean {
  if (on && !startSharing()) on = false;
  state.sharing = on; LS.set('sharing', on);
  if (!on) {
    stopWatch(); lastSent = null; myPos = null;
    if (state.locations[memberId]) { delete state.locations[memberId]; emit('live', undefined); }
    if (state.online) req('DELETE', '/locations/' + memberId).catch(() => {});
  } else notify(T('📡 Sharing your location with the family'));
  emit('sharing', on);
  return on;
}
export function sendPosition(): void {
  if (!myPos || !state.online) return;
  lastSent = myPos; lastSentAt = Date.now();
  req('PUT', '/locations/' + memberId, { ...myPos, name: state.me?.name, color: state.me?.color }).catch(() => {});
}
/** Heartbeat so the family doesn't see you as stale while standing still. */
export function heartbeat(): void { if (state.sharing && myPos && Date.now() - lastSentAt > 60000) sendPosition(); }

function onPosition(pos: GeolocationPosition) {
  myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) };
  const moved = !lastSent || km(lastSent, myPos) * 1000 > 20;
  if ((moved && Date.now() - lastSentAt > 8000) || Date.now() - lastSentAt > 60000) sendPosition();
  // show myself immediately, without waiting for the server echo
  state.locations[memberId] = { memberId, name: state.me?.name || '', color: state.me?.color || '#0d9488', ...myPos, ts: Date.now() };
  emit('live', undefined);
  checkArrival();
}
function checkArrival() {
  if (!myPos) return;
  activeMeetups().forEach((m) => {
    const st = m.status[memberId]?.status;
    if (st !== 'here' && st !== 'cant' && !autoArrived.has(m.id) && km(myPos!, m) < 0.06) {
      autoArrived.add(m.id);
      setMeetStatus(m.id, 'here');
      notify(T('✅ You’ve arrived at “{name}”', { name: m.title }));
    }
  });
}

// ── meetups ───────────────────────────────────────────────────
export function upsertMeetup(m: Meetup): void {
  const i = state.meetups.findIndex((x) => x.id === m.id);
  if (i >= 0) state.meetups[i] = m; else state.meetups.push(m);
  emit('meetups', undefined);
  checkArrival();
}
export async function createMeetup(input: { title: string; lat: number; lng: number; at: number | null; placeId: string | null }): Promise<Meetup | null> {
  try {
    const m = await req<Meetup>('POST', '/meetups', { ...input, createdBy: state.me!.name, color: state.me!.color });
    upsertMeetup(m);
    notify(T('🚩 Meetup set — the family has been notified'));
    return m;
  } catch (e) { notify(T('Could not set meetup: ') + (e as Error).message); return null; }
}
export async function setMeetStatus(id: string, status: MeetStatus | null): Promise<void> {
  try {
    const m = await req<Meetup>('PUT', `/meetups/${encodeURIComponent(id)}/status/${memberId}`, { status, name: state.me?.name, color: state.me?.color });
    upsertMeetup(m);
  } catch (e) { notify(T('Could not update: ') + (e as Error).message); }
}
export async function deleteMeetup(id: string): Promise<boolean> {
  try {
    await req('DELETE', '/meetups/' + encodeURIComponent(id));
    state.meetups = state.meetups.filter((m) => m.id !== id);
    emit('meetups', undefined);
    return true;
  } catch (e) { notify(T('Could not remove: ') + (e as Error).message); return false; }
}
/** Centre of everyone sharing, snapped to a curated place within 500 m. */
export function midpoint(): { target: LatLng; place: Place | null } | null {
  const locs = freshLocs(); if (locs.length < 2) return null;
  const c = { lat: locs.reduce((s, l) => s + l.lat, 0) / locs.length, lng: locs.reduce((s, l) => s + l.lng, 0) / locs.length };
  let best: { p: Place; d: number } | null = null;
  PLACES.forEach((p) => { if (p.cat === 'airport') return; const d = km(c, p); if (d < 0.5 && (!best || d < best.d)) best = { p, d }; });
  const b = best as { p: Place; d: number } | null;
  return { target: b ? { lat: b.p.lat, lng: b.p.lng } : c, place: b ? b.p : null };
}
/** Default meetup time: in ~30 min, rounded to 5 min (HH:MM). */
export function defaultMeetTime(): string {
  const t = new Date(Date.now() + 30 * 60000);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
/** "HH:MM" → timestamp today (or tomorrow if that was over an hour ago). */
export function meetTimeToTs(hhmm: string): number | null {
  if (!hhmm) return null;
  const [h, mi] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, mi, 0, 0);
  if (d.getTime() < Date.now() - 60 * 60000) d.setDate(d.getDate() + 1);
  return d.getTime();
}
