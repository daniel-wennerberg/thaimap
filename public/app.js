/* ThaiMap — map-first family trip planner for Thailand */
(() => {
  'use strict';

  // ── utilities ───────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ── language (English / Swedish) ────────────────────────────
  const LANG = (() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('thaimap:lang')); } catch { /* private mode */ }
    return s === 'sv' || s === 'en' ? s : ((navigator.language || '').toLowerCase().startsWith('sv') ? 'sv' : 'en');
  })();
  const LOCALE = LANG === 'sv' ? 'sv-SE' : 'en-GB';
  // T('Added to “{name}” ✓', { name }) — English text is the key; Swedish lives in i18n.sv.js
  const T = (s, v) => {
    let r = (LANG === 'sv' && window.I18N_SV?.[s]) || s;
    if (v) r = r.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
    return r;
  };
  if (LANG === 'sv' && window.DATA_SV) {
    const D = window.DATA_SV;
    Object.entries(D.categories || {}).forEach(([k, l]) => { if (CATEGORIES[k]) CATEGORIES[k].label = l; });
    Object.entries(D.regions || {}).forEach(([k, l]) => { if (REGIONS[k]) REGIONS[k].label = l; });
    PLACES.forEach((p) => Object.assign(p, D.places?.[p.id] || {}));
    TEMPLATES.forEach((t) => {
      const x = D.templates?.[t.id]; if (!x) return;
      if (x.name) t.name = x.name; if (x.blurb) t.blurb = x.blurb;
      (x.notes || []).forEach((n, i) => { if (t.stops[i] && n) t.stops[i].note = n; });
    });
    DESTINATIONS.forEach((d) => { const x = D.destinations?.[d.id]; if (x?.transfer) d.transfer = x.transfer; });
  }
  document.documentElement.lang = LANG;
  const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const COLORS = ['#0f766e', '#ea580c', '#7c3aed', '#db2777', '#2563eb', '#ca8a04', '#16a34a', '#475569'];
  const KINDS = { note: ['📝', T('Note')], idea: ['💡', T('Idea')], warning: ['⚠️', T('Heads-up')], love: ['❤️', T('Must do!')] };
  const TPL_TYPES = { all: T('All'), city: T('🏙️ City days'), islands: T('🚤 Island hopping'), hiking: T('🥾 Hiking') };
  const PRICE = ['', '฿', '฿฿', '฿฿฿', '฿฿฿฿'];

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('thaimap:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('thaimap:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const km = (a, b) => {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return T('just now');
    if (s < 3600) return T('{n}m ago', { n: Math.floor(s / 60) });
    if (s < 86400) return T('{n}h ago', { n: Math.floor(s / 3600) });
    if (s < 604800) return T('{n}d ago', { n: Math.floor(s / 86400) });
    return new Date(t).toLocaleDateString(LOCALE);
  };
  const toast = (msg) => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  };
  const avatar = (name, color) => `<div class="avatar" style="background:${esc(color)}">${esc((name || '?').trim()[0]?.toUpperCase() || '?')}</div>`;

  // Keep typed text & focus when a container re-renders.
  function preserve(root, fn) {
    if (!root) return fn();
    const vals = {}; let focusKey = null, sel = null;
    $$('[data-key]', root).forEach((el) => { vals[el.dataset.key] = el.value; });
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.key && root.contains(a)) { focusKey = a.dataset.key; sel = [a.selectionStart, a.selectionEnd]; }
    fn();
    $$('[data-key]', root).forEach((el) => { if (vals[el.dataset.key] !== undefined) el.value = vals[el.dataset.key]; });
    if (focusKey) {
      const el = root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(...sel); } catch { /* select */ } }
    }
  }

  // ── state ───────────────────────────────────────────────────
  const state = {
    me: LS.get('me', null),               // { name, color }
    family: LS.get('family', null),       // family code
    notes: [], plans: [],
    cats: new Set(Object.keys(CATEGORIES)),
    region: 'all', query: '',
    selected: null,
    activePlanId: LS.get('activePlan', null),
    preview: null,                         // template being previewed
    mode: null,                            // 'note' | 'stop'
    online: false,
    tplType: 'all',
    openReplies: new Set(),
    lastSeen: LS.get('lastSeen', 0),
    tab: 'explore',
    meetups: [], locations: {},
    trips: [], activeTripId: LS.get('activeTrip', null), view: 'trip', openIdeas: new Set(),
    sharing: LS.get('sharing', false),
  };
  const dirty = new Set(); const lastRev = {}; const saveTimers = {};
  let es = null;

  // ── data layer (server, or local-only fallback) ─────────────
  const localKey = () => 'local:' + (state.family || 'solo');
  const persistLocal = () => LS.set(localKey(), { notes: state.notes, plans: state.plans, trips: state.trips });
  const base = () => `/api/family/${encodeURIComponent(state.family)}`;
  async function req(method, path = '', body) {
    const r = await fetch(base() + path, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  }

  async function connect() {
    if (es) { es.close(); es = null; }
    state.online = false;
    if (state.family && location.protocol.startsWith('http')) {
      try {
        const data = await req('GET');
        state.notes = data.notes; state.plans = data.plans; state.trips = data.trips || []; state.online = true;
        loadLive(data);
        openStream();
      } catch { /* fall back to local */ }
    }
    if (!state.online) {
      const local = LS.get(localKey(), { notes: [], plans: [] });
      state.notes = local.notes; state.plans = local.plans; state.trips = local.trips || [];
      state.meetups = []; state.locations = {};
    }
    if (!state.plans.find((p) => p.id === state.activePlanId)) state.activePlanId = state.plans[0]?.id || null;
    if (!activeTrip() && !(state.activeTripId === '__loose' && state.plans.some((p) => !p.tripId)))
      state.activeTripId = state.trips[0]?.id || (state.plans.some((p) => !p.tripId) ? '__loose' : null);
    setConnBanner();
    renderAll();
    if (state.sharing && state.online) startSharing();
  }
  function loadLive(d) {
    state.meetups = d.meetups || [];
    state.locations = Object.fromEntries((d.locations || []).map((l) => [l.memberId, l]));
  }

  function openStream() {
    es = new EventSource(base() + '/events');
    let first = true;
    es.onopen = async () => {
      setConnBanner();
      if (first) { first = false; return; }
      try { const d = await req('GET'); state.notes = d.notes; mergeDocs('plans', d.plans); mergeDocs('trips', d.trips || []); loadLive(d); renderAll(); if (myPos) sendPosition(); } catch { /* retry later */ }
    };
    es.onerror = () => setConnBanner(T('Reconnecting to family…'));
    es.onmessage = (e) => { try { applyEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
  }

  function mergeDocs(kind, serverDocs) {
    const keep = state[kind].filter((p) => dirty.has(p.id));
    state[kind] = serverDocs.filter((p) => !dirty.has(p.id)).concat(keep);
  }

  function setConnBanner(msg) {
    const b = $('#connBanner');
    if (!msg && state.family && !state.online) msg = location.hostname.endsWith('github.io')
      ? T('ℹ️ Web-only version: notes & plans are saved on this device (family sync needs the server)')
      : location.protocol.startsWith('http')
      ? T('⚠️ Can’t reach the server — changes are saved on this device only')
      : T('⚠️ Opened as a file — run “npm start” to share with family');
    b.textContent = msg || ''; b.classList.toggle('hidden', !msg);
  }

  function applyEvent(ev) {
    if (applyLiveEvent(ev)) return;
    if (ev.type === 'note:add') {
      if (state.notes.some((n) => n.id === ev.note.id)) return;
      state.notes.push(ev.note);
      if (ev.note.author !== state.me?.name) {
        const where = (ev.note.placeId && PLACE[ev.note.placeId]?.name) || T('the map');
        toast(T('💬 {who} commented on {where}', { who: ev.note.author, where }));
      }
      onNotesChanged();
    } else if (ev.type === 'note:delete') {
      const ids = new Set(ev.ids);
      state.notes = state.notes.filter((n) => !ids.has(n.id));
      onNotesChanged();
    } else if (ev.type === 'plan:put') {
      const p = ev.plan;
      if (dirty.has(p.id) || (lastRev[p.id] && p.rev === lastRev[p.id])) return; // our own echo
      const i = state.plans.findIndex((x) => x.id === p.id);
      if (i >= 0) state.plans[i] = p; else state.plans.push(p);
      if (!state.activePlanId) state.activePlanId = p.id;
      onPlansChanged();
    } else if (ev.type === 'trip:put') {
      const t = ev.trip;
      if (dirty.has(t.id) || (lastRev[t.id] && t.rev === lastRev[t.id])) return;
      const i = state.trips.findIndex((x) => x.id === t.id);
      if (i >= 0) state.trips[i] = t; else { state.trips.push(t); if (!activeTrip()) state.activeTripId = t.id; }
      if (t.updatedBy && t.updatedBy !== state.me?.name && i < 0) toast(T('🧳 {who} created the trip “{name}”', { who: t.updatedBy, name: t.name }));
      onPlansChanged();
    } else if (ev.type === 'trip:delete') {
      state.trips = state.trips.filter((t) => t.id !== ev.id);
      if (state.activeTripId === ev.id) { state.activeTripId = state.trips[0]?.id || null; state.view = 'trip'; }
      onPlansChanged();
    } else if (ev.type === 'plan:delete') {
      state.plans = state.plans.filter((p) => p.id !== ev.id);
      if (state.activePlanId === ev.id) state.activePlanId = state.plans[0]?.id || null;
      onPlansChanged();
    }
  }

  async function addNote(body) {
    if (!state.online) {
      const n = { ...body, id: rid(), createdAt: Date.now() };
      state.notes.push(n); persistLocal(); onNotesChanged(); return n;
    }
    const n = await req('POST', '/notes', body);
    if (!state.notes.some((x) => x.id === n.id)) { state.notes.push(n); onNotesChanged(); }
    return n;
  }

  async function deleteNote(id) {
    if (!state.online) {
      state.notes = state.notes.filter((n) => n.id !== id && n.parentId !== id);
      persistLocal(); onNotesChanged(); return;
    }
    await req('DELETE', '/notes/' + encodeURIComponent(id));
    applyEvent({ type: 'note:delete', ids: [id, ...state.notes.filter((n) => n.parentId === id).map((n) => n.id)] });
  }

  // kind: 'plans' | 'trips' — debounced save with our own-echo suppression via rev
  function queueSave(doc, delay = 600, kind = 'plans') {
    dirty.add(doc.id);
    clearTimeout(saveTimers[doc.id]);
    saveTimers[doc.id] = setTimeout(() => saveDoc(kind, doc.id), delay);
  }
  async function saveDoc(kind, id) {
    const doc = state[kind].find((p) => p.id === id);
    if (!doc) return;
    doc.rev = rid(); lastRev[id] = doc.rev; doc.updatedBy = state.me?.name || '';
    dirty.delete(id);
    if (!state.online) return persistLocal();
    try { await req('PUT', `/${kind}/` + id, doc); } catch (e) { toast(T('Could not save: ') + e.message); }
  }
  async function deletePlan(id) {
    clearTimeout(saveTimers[id]); dirty.delete(id);
    state.plans = state.plans.filter((p) => p.id !== id);
    if (state.activePlanId === id) state.activePlanId = state.plans[0]?.id || null;
    if (!state.online) persistLocal();
    else try { await req('DELETE', '/plans/' + id); } catch (e) { toast(T('Could not delete: ') + e.message); }
    onPlansChanged();
  }

  // ── map ─────────────────────────────────────────────────────
  const TH_BOUNDS = L.latLngBounds([5.5, 97.3], [20.5, 105.7]);
  // Roam window: wide enough that Thailand can sit beside the floating panel (the area outside is masked dark)
  const MASK_BOX = L.latLngBounds([-1, 90], [28, 112]);
  const map = L.map('map', {
    zoomControl: false, minZoom: 5, maxBounds: L.latLngBounds([-28, 62], [48, 140]), maxBoundsViscosity: 1, worldCopyJump: false,
  }).fitBounds(TH_BOUNDS);

  // The panel floats over the map, so every "centre on X" aims at the visible area beside/above it.
  function viewPad() {
    const mobile = window.innerWidth <= 760;
    const off = $('#app').classList.contains('panel-off');
    const r = $('#panel').getBoundingClientRect();
    if (mobile) return { l: 0, t: 70, r: 64, b: off ? 0 : Math.max(0, window.innerHeight - r.top) + 8 };
    return { l: off ? 0 : r.right + 8, t: 70, r: 100, b: 20 };
  }
  function centreFor(ll, z) {
    const P = viewPad();
    return map.unproject(map.project(L.latLng(ll), z).add(L.point((P.r - P.l) / 2, (P.b - P.t) / 2)), z);
  }
  function boundsTarget(b, extra = [0, 0], maxZoom = 18) {
    const P = viewPad();
    const tl = L.point(P.l + extra[0], P.t + extra[1]), br = L.point(P.r + extra[0], P.b + extra[1]);
    const z = Math.min(maxZoom, map.getBoundsZoom(b, false, tl.add(br)));
    const c = map.project(b.getSouthWest(), z).add(map.project(b.getNorthEast(), z)).divideBy(2).add(br.subtract(tl).divideBy(2));
    return { c: map.unproject(c, z), z };
  }
  const _flyTo = map.flyTo.bind(map);
  map.flyTo = (ll, z = map.getZoom(), o) => _flyTo(centreFor(ll, z), z, o);
  map.flyToBounds = (b, o = {}) => {
    const p = Array.isArray(o.padding) ? o.padding : [0, 0];
    const t = boundsTarget(L.latLngBounds(b), p, o.maxZoom);
    return _flyTo(t.c, t.z, o);
  };
  const fitThailand = (animate = true) => {
    const t = boundsTarget(TH_BOUNDS, [10, 10]);
    if (animate) _flyTo(t.c, t.z); else map.setView(t.c, t.z, { animate: false });
  };
  L.control.zoom({ position: 'topright' }).addTo(map);
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const street = L.tileLayer(ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 19,
  });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
  });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; OpenStreetMap, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)', subdomains: 'abc', maxZoom: 17,
  });
  const sat = L.layerGroup([
    L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery &copy; Esri', maxZoom: 19 }),
    L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    L.tileLayer(ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.55 }),
  ]);
  const dark = L.layerGroup([
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 16 }),
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
  ]);
  const BASES = { sat: [T('🛰️ Satellite'), sat], dark: [T('🌑 Dark map'), dark], street: [T('🗺️ Map (English)'), street], topo: [T('⛰️ Terrain (hiking)'), topo], osm: [T('🇹🇭 OpenStreetMap (Thai names)'), osm] };
  (BASES[LS.get('base', 'sat')] || BASES.sat)[1].addTo(map);
  L.control.layers(Object.fromEntries(Object.values(BASES)), null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => { const k = Object.keys(BASES).find((x) => BASES[x][1] === e.layer); if (k) LS.set('base', k); });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  // Grey out neighbouring countries so Thailand stands out (sea stays clear for island hopping)
  map.createPane('mask');
  map.getPane('mask').style.zIndex = 350;
  map.getPane('mask').style.pointerEvents = 'none';
  L.polygon([[[-85, -180], [85, -180], [85, 180], [-85, 180]],
    [[MASK_BOX.getSouth(), MASK_BOX.getWest()], [MASK_BOX.getNorth(), MASK_BOX.getWest()], [MASK_BOX.getNorth(), MASK_BOX.getEast()], [MASK_BOX.getSouth(), MASK_BOX.getEast()]]],
  { pane: 'mask', interactive: false, stroke: false, fillColor: '#05070a', fillOpacity: 0.6 }).addTo(map);
  if (window.NEIGHBORS) {
    L.geoJSON(window.NEIGHBORS, {
      pane: 'mask', interactive: false,
      style: { stroke: true, color: 'rgba(255,255,255,.35)', weight: 0.6, fillColor: '#05070a', fillOpacity: 0.6 },
    }).addTo(map);
  }
  // Compact domestic-airport badges when zoomed out to keep the country view readable
  const syncZoomClass = () => map.getContainer().classList.toggle('zoomed-out', map.getZoom() < 7);
  map.on('zoomend', syncZoomClass); syncZoomClass();

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 42, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 15,
    iconCreateFunction: (c) => L.divIcon({ className: 'marker-cluster-custom', html: `<div>${c.getChildCount()}</div>`, iconSize: [40, 40] }),
  }).addTo(map);
  const airportLayer = L.layerGroup().addTo(map);
  const noteLayer = L.layerGroup().addTo(map);
  const planLayer = L.layerGroup().addTo(map);
  let meMarker = null;

  const placeMarkers = {};
  const noteMarkers = {};

  const commentCount = (placeId) => state.notes.filter((n) => n.placeId === placeId).length;

  function placeIcon(p) {
    const c = CATEGORIES[p.cat];
    if (p.cat === 'airport') {
      return L.divIcon({
        className: '', iconSize: [70, 24], iconAnchor: [35, 12],
        html: `<div style="display:flex;justify-content:center"><div class="airport-pin ${p.intl ? 'intl' : ''} ${state.selected === p.id ? 'sel' : ''}">✈️<span class="code">${esc(p.iata)}</span></div></div>`,
      });
    }
    const n = commentCount(p.id);
    return L.divIcon({
      className: '', iconSize: [34, 34], iconAnchor: [17, 41], popupAnchor: [0, -38], tooltipAnchor: [0, -36],
      html: `<div class="pin-wrap"><div class="pin ${state.selected === p.id ? 'sel' : ''}" style="--c:${c.color}"><span>${c.icon}</span></div>${n ? `<div class="pin-count">${n}</div>` : ''}</div>`,
    });
  }

  PLACES.forEach((p) => {
    const m = L.marker([p.lat, p.lng], { icon: placeIcon(p), title: p.name, riseOnHover: true });
    m.bindTooltip(esc(p.name), { direction: 'top', offset: p.cat === 'airport' ? [0, -10] : [0, -36] });
    m.on('click', () => selectPlace(p.id, { fly: false }));
    placeMarkers[p.id] = m;
  });

  const matchesQuery = (p) => !state.query ||
    (p.name + ' ' + (p.desc || '') + ' ' + (p.tip || '') + ' ' + (p.iata || '')).toLowerCase().includes(state.query.toLowerCase());
  // Map shows every region; the list is narrowed to the chosen region.
  const onMap = (p) => state.cats.has(p.cat) && matchesQuery(p);
  const matches = (p) => onMap(p) && (state.region === 'all' || p.region === state.region);

  function renderMarkers() {
    cluster.clearLayers(); airportLayer.clearLayers();
    const visible = PLACES.filter(onMap);
    cluster.addLayers(visible.filter((p) => p.cat !== 'airport').map((p) => placeMarkers[p.id]));
    visible.filter((p) => p.cat === 'airport').forEach((p) => airportLayer.addLayer(placeMarkers[p.id]));
  }
  const refreshPlaceIcon = (id) => PLACE[id] && placeMarkers[id].setIcon(placeIcon(PLACE[id]));
  const refreshAllIcons = () => PLACES.forEach((p) => placeMarkers[p.id].setIcon(placeIcon(p)));

  // Free-floating family notes on the map
  function noteIcon(n) {
    return L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14],
      html: `<div class="note-pin" style="--c:${esc(n.color)}">${KINDS[n.kind]?.[0] || '📝'}</div>` });
  }
  const isMapNote = (n) => !n.placeId && !n.parentId && n.lat !== null && n.lng !== null && n.lat !== undefined;

  function renderNotes() {
    const roots = state.notes.filter(isMapNote);
    const ids = new Set(roots.map((n) => n.id));
    Object.keys(noteMarkers).forEach((id) => { if (!ids.has(id)) { noteLayer.removeLayer(noteMarkers[id]); delete noteMarkers[id]; } });
    roots.forEach((n) => {
      let m = noteMarkers[n.id];
      if (!m) {
        m = L.marker([n.lat, n.lng], { icon: noteIcon(n), zIndexOffset: 500 });
        m.bindPopup(() => `<div class="popup">${threadHtml([n])}</div>`, { maxWidth: 320, minWidth: 250 });
        m.bindTooltip(`${esc(n.author)}: ${esc(n.text.slice(0, 50))}${n.text.length > 50 ? '…' : ''}`, { direction: 'top', offset: [0, -14] });
        noteMarkers[n.id] = m; noteLayer.addLayer(m);
      } else if (m.isPopupOpen()) {
        preserve(m.getPopup().getElement(), () => m.getPopup().setContent(() => `<div class="popup">${threadHtml([n])}</div>`));
      }
    });
  }

  // Active day plan (or a template preview) drawn as a numbered route
  const stopCoord = (s) => {
    if (s.place && PLACE[s.place]) return { lat: PLACE[s.place].lat, lng: PLACE[s.place].lng, name: PLACE[s.place].name };
    if (s.lat !== null && s.lat !== undefined) return { lat: s.lat, lng: s.lng, name: s.name || T('Custom stop') };
    return null;
  };
  const activePlan = () => state.plans.find((p) => p.id === state.activePlanId) || null;

  function renderRoute() {
    planLayer.clearLayers();
    if (!state.preview && activeTrip() && state.view !== 'day') { drawTrip(activeTrip()); return; }
    const stops = state.preview ? state.preview.stops : activePlan()?.stops || [];
    const pts = stops.map(stopCoord).filter(Boolean);
    if (pts.length > 1) {
      L.polyline(pts.map((p) => [p.lat, p.lng]), { color: '#fff', weight: 8, opacity: 0.8 }).addTo(planLayer);
      L.polyline(pts.map((p) => [p.lat, p.lng]), { color: state.preview ? '#0f766e' : '#ea580c', weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(planLayer);
    }
    let i = 0;
    stops.forEach((s) => {
      const c = stopCoord(s); if (!c) return; i++;
      L.marker([c.lat, c.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div class="stop-pin" style="${state.preview ? 'background:#0f766e' : ''}">${i}</div>` }),
      }).bindTooltip(`${s.time ? esc(s.time) + ' · ' : ''}${esc(c.name)}`, { direction: 'top', offset: [0, -12] })
        .on('click', () => s.place && selectPlace(s.place, { fly: false }))
        .addTo(planLayer);
    });
  }
  function fitStops(stops) {
    const pts = stops.map(stopCoord).filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1) map.flyTo([pts[0].lat, pts[0].lng], 14);
    else map.flyToBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 15 });
  }

  // ── comments / threads ──────────────────────────────────────
  const repliesOf = (id) => state.notes.filter((n) => n.parentId === id).sort((a, b) => a.createdAt - b.createdAt);

  function composeHtml({ placeId = '', parentId = '', lat = '', lng = '', key, placeholder = T('Write something for the family…') }) {
    return `<form class="compose" data-compose data-place="${esc(placeId)}" data-parent="${esc(parentId)}" data-lat="${lat}" data-lng="${lng}" data-form-key="${esc(key)}">
      <textarea name="text" data-key="${esc(key)}" required maxlength="2000" rows="2" placeholder="${esc(placeholder)}"></textarea>
      <div class="compose-row">
        ${parentId ? '' : `<select name="kind" data-key="k-${esc(key)}">${Object.entries(KINDS).map(([k, [i, l]]) => `<option value="${k}">${i} ${l}</option>`).join('')}</select>`}
        <button class="btn primary small" type="submit">${parentId ? T('Reply') : T('Post')}</button>
      </div>
    </form>`;
  }

  function commentHtml(n, withReplies = true) {
    const mine = state.me && n.author === state.me.name;
    const replies = withReplies ? repliesOf(n.id) : [];
    return `<div class="comment kind-${esc(n.kind)}">
      ${avatar(n.author, n.color)}
      <div class="body">
        <div class="who">${esc(n.author)}<time>${ago(n.createdAt)}</time></div>
        <div class="txt">${esc(n.text)}</div>
        <div class="acts">
          ${withReplies ? `<button class="icon-btn" data-act="reply" data-id="${esc(n.id)}">↩ ${T('Reply')}</button>` : ''}
          ${mine ? `<button class="icon-btn" data-act="del-note" data-id="${esc(n.id)}">🗑 ${T('Delete')}</button>` : ''}
        </div>
        ${replies.length ? `<div class="replies">${replies.map((r) => commentHtml(r, false)).join('')}</div>` : ''}
        ${withReplies && state.openReplies.has(n.id) ? composeHtml({ parentId: n.id, placeId: n.placeId || '', key: 'r-' + n.id, placeholder: T('Reply…') }) : ''}
      </div>
    </div>`;
  }
  const threadHtml = (roots) => roots.map((n) => commentHtml(n)).join('');

  async function onCompose(form) {
    if (!ensureMe()) return;
    const text = form.text.value.trim();
    if (!text) return;
    const d = form.dataset;
    const body = {
      text, kind: form.kind ? form.kind.value : 'note', author: state.me.name, color: state.me.color,
      placeId: d.place || null, parentId: d.parent || null,
      lat: d.lat ? Number(d.lat) : null, lng: d.lng ? Number(d.lng) : null,
    };
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const n = await addNote(body);
      $$(`[data-key="${CSS.escape(d.formKey)}"]`).forEach((t) => { t.value = ''; });
      if (body.parentId) { state.openReplies.delete(body.parentId); onNotesChanged(); }
      if (isMapNote(n)) { map.closePopup(); setMode(null); setTimeout(() => noteMarkers[n.id]?.openPopup(), 50); }
    } catch (e) { toast(T('Could not post: ') + e.message); }
    finally { btn.disabled = false; }
  }

  // ── panel: explore ──────────────────────────────────────────
  function renderChips() {
    const counts = {};
    PLACES.forEach((p) => { if (state.region === 'all' || p.region === state.region) counts[p.cat] = (counts[p.cat] || 0) + 1; });
    const all = state.cats.size === Object.keys(CATEGORIES).length;
    $('#chips').innerHTML = `<button class="chip ${all ? 'on' : ''}" data-act="cat-all" style="--c:var(--ink)">${T('All')}</button>` +
      Object.entries(CATEGORIES).map(([k, c]) =>
        `<button class="chip ${!all && state.cats.has(k) ? 'on' : ''}" data-act="cat" data-id="${k}" style="--c:${c.color}">${c.icon} ${c.label} <span class="n">${counts[k] || 0}</span></button>`).join('');
  }

  function renderList() {
    const list = PLACES.filter(matches);
    if (!list.length) { $('#placeList').innerHTML = `<div class="empty">${T('Nothing matches. Try another search or category.')}</div>`; return; }
    const groups = {};
    list.forEach((p) => (groups[p.cat] ||= []).push(p));
    $('#placeList').innerHTML = Object.keys(CATEGORIES).filter((k) => groups[k]).map((k) => {
      const c = CATEGORIES[k];
      return `<div class="list-group"><h4>${c.icon} ${c.label} · ${groups[k].length}</h4>${groups[k].map((p) => {
        const n = commentCount(p.id);
        return `<div class="place-row" data-act="select-place" data-id="${p.id}" style="--c:${c.color}">
          <div class="ico">${c.icon}</div>
          <div><div class="t">${esc(p.name)}${p.price ? `<span class="badge">${PRICE[p.price]}</span>` : ''}${n ? `<span class="badge hot">💬 ${n}</span>` : ''}</div>
          <div class="s">${esc(p.desc || REGIONS[p.region]?.label || '')}</div></div>
        </div>`;
      }).join('')}</div>`;
    }).join('');
  }

  function renderDetail() {
    const el = $('#placeDetail');
    const p = PLACE[state.selected];
    if (!p) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const c = CATEGORIES[p.cat];
    const roots = state.notes.filter((n) => n.placeId === p.id && !n.parentId).sort((a, b) => a.createdAt - b.createdAt);
    const planOpts = addToDayOptions(p);
    preserve(el, () => {
      el.style.setProperty('--c', c.color);
      el.innerHTML = `
        <div class="detail-head"><div class="kicker">${c.icon} ${c.label} · ${esc(REGIONS[p.region]?.label || '')}</div>
          <button class="icon-btn" data-act="close-detail" aria-label="Close">✕</button></div>
        <h2>${esc(p.name)}</h2>
        <div class="meta">
          ${p.duration ? `<span>⏱ ${esc(p.duration)}</span>` : ''}
          ${p.difficulty ? `<span>🥾 ${esc(p.difficulty)}</span>` : ''}
          ${p.price ? `<span>${PRICE[p.price]}</span>` : ''}
          ${p.iata ? `<span>IATA ${esc(p.iata)}${p.intl ? ' · ' + T('International') : ' · ' + T('Domestic')}</span>` : ''}
        </div>
        ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
        ${p.tip ? `<p class="tip"><b>${T('Tip:')}</b> ${esc(p.tip)}</p>` : ''}
        <div class="detail-actions">
          <select data-plan-target>${planOpts}<option value="__new">＋ ${T('New day…')}</option></select>
          <button class="btn accent small" data-act="add-to-plan" data-id="${p.id}">${T('Add to day')}</button>
        </div>
        <div class="detail-actions">
          <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 ${T('Directions')}</a>
          <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' Thailand')}">⭐ ${T('Reviews & photos')}</a>
          <button class="btn small" data-act="zoom" data-id="${p.id}">🔍 ${T('Zoom in')}</button>
          ${p.cat !== 'airport' ? `<button class="btn small" data-act="meet-here" data-id="${p.id}">🚩 ${T('Meet here')}</button>` : ''}
        </div>
        <div class="thread">
          <h5>💬 ${T('Family comments')} ${roots.length ? `(${commentCount(p.id)})` : ''}</h5>
          ${roots.length ? threadHtml(roots) : `<p class="muted" style="font-size:13px">${T('No comments yet — be the first!')}</p>`}
          ${composeHtml({ placeId: p.id, key: 'place-' + p.id, placeholder: T('What do you think about {name}?', { name: p.name }) })}
        </div>`;
    });
    el.classList.remove('hidden');
  }

  function selectPlace(id, { fly = true } = {}) {
    const prev = state.selected;
    state.selected = id;
    if (prev) refreshPlaceIcon(prev);
    refreshPlaceIcon(id);
    switchTab('explore');
    renderDetail();
    $('#tab-explore').scrollTop = 0;
    if ($('#panel').classList.contains('collapsed')) setSheet('');
    const p = PLACE[id];
    if (fly && p) {
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), p.cat === 'island' ? 12 : 15), { duration: 0.8 });
    }
  }

  // ── panel: plan ─────────────────────────────────────────────
  function sortedPlans() {
    return [...state.plans].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.name.localeCompare(b.name));
  }
  function renderPlanSelect() {
    const s = $('#planSelect');
    const loose = sortedPlans().filter((p) => !p.tripId);
    s.innerHTML = loose.length
      ? loose.map((p) => `<option value="${esc(p.id)}" ${p.id === state.activePlanId ? 'selected' : ''}>${p.date ? esc(p.date) + ' · ' : ''}${esc(p.name)} (${p.stops.length})</option>`).join('')
      : `<option value="">${T('No days planned yet')}</option>`;
  }

  function legText(a, b) {
    const ca = stopCoord(a), cb = stopCoord(b);
    if (!ca || !cb) return '';
    const d = km(ca, cb);
    if (d < 1.3) return `🚶 ~${T('{n} min walk', { n: Math.max(2, Math.round(d * 14)) })} · ${(d * 1000).toFixed(0)} m`;
    const island = (s) => s.place && ['island', 'beach'].includes(PLACE[s.place]?.cat);
    if (island(a) && island(b)) return `🚤 ~${T('{n} km by boat', { n: d.toFixed(1) })}`;
    return `🚕 ~${d.toFixed(1)} km`;
  }
  const totalKm = (stops) => {
    let t = 0;
    for (let i = 1; i < stops.length; i++) { const a = stopCoord(stops[i - 1]), b = stopCoord(stops[i]); if (a && b) t += km(a, b); }
    return t;
  };

  function renderPlanEditor() {
    const el = $('#planEditor');
    const plan = activePlan();
    if (!plan) {
      el.innerHTML = `<div class="plan-card empty">${T('Create a day, pick a ready-made one below,<br/>or tap <b>Add to day</b> on any place.')}</div>`;
      return;
    }
    const stops = plan.stops;
    preserve(el, () => {
      el.innerHTML = `<div class="plan-card">
        <div class="plan-head">
          <input type="text" data-plan-field="name" data-key="pf-name" value="${esc(plan.name)}" maxlength="120" aria-label="${T('Day name')}" />
          ${plan.tripId ? '' : `<input type="date" data-plan-field="date" data-key="pf-date" value="${esc(plan.date || '')}" aria-label="Date" />`}
        </div>
        <div class="plan-stats"><span>📍 ${T('{n} stops', { n: stops.length })}</span><span>📏 ~${totalKm(stops).toFixed(1)} km</span>
          ${plan.updatedBy ? `<span>✏️ ${esc(plan.updatedBy)}</span>` : ''}</div>
        ${stops.length ? `<ol class="stops">${stops.map((s, i) => {
          const c = stopCoord(s);
          return `${i ? `<li class="leg">${legText(stops[i - 1], s)}</li>` : ''}
          <li class="stop">
            <div class="num">${i + 1}</div>
            <div>
              <div class="name" data-act="goto-stop" data-idx="${i}">${esc(c?.name || T('Stop'))}</div>
              <div class="row2">
                <input type="time" data-stop-field="time" data-idx="${i}" data-key="st-time-${esc(s.id)}" value="${esc(s.time || '')}" />
                <input type="text" data-stop-field="note" data-idx="${i}" data-key="st-note-${esc(s.id)}" value="${esc(s.note || '')}" placeholder="${T('Note…')}" maxlength="500" />
              </div>
            </div>
            <div class="ctrl">
              <button class="icon-btn" data-act="stop-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
              <button class="icon-btn" data-act="stop-down" data-idx="${i}" ${i === stops.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
              <button class="icon-btn" data-act="stop-del" data-idx="${i}" aria-label="Remove">✕</button>
            </div>
          </li>`;
        }).join('')}</ol>` : `<p class="muted" style="font-size:13px">${T('No stops yet. Open a place and tap <b>Add to day</b>, or add a custom stop on the map.')}</p>`}
        <div class="plan-foot">
          <button class="btn small" data-act="fit-plan">🗺️ ${T('Show on map')}</button>
          <button class="btn small" data-act="custom-stop">📌 ${T('Custom stop')}</button>
          <button class="btn small" data-act="sort-time">🕘 ${T('Sort by time')}</button>
          <button class="btn small" data-act="share-plan">📤 ${T('Share as text')}</button>
          ${plan.tripId ? '' : `<button class="btn small danger" data-act="del-plan">🗑 ${T('Delete day')}</button>`}
        </div>
      </div>`;
    });
  }

  function renderTemplates() {
    $('#templateFilters').innerHTML = Object.entries(TPL_TYPES).map(([k, l]) =>
      `<button class="chip ${state.tplType === k ? 'on' : ''}" data-act="tpl-type" data-id="${k}">${l}</button>`).join('');
    $('#templates').innerHTML = TEMPLATES.filter((t) => state.tplType === 'all' || t.type === state.tplType).map((t) => `
      <div class="tpl">
        <b>${esc(t.name)}</b>
        <p>${esc(t.blurb)}</p>
        <p>📍 ${T('{n} stops', { n: t.stops.length })} · ~${totalKm(t.stops).toFixed(0)} km</p>
        <div class="tpl-acts">
          <button class="btn small" data-act="preview-tpl" data-id="${t.id}">${state.preview?.id === t.id ? '✕ ' + T('Hide preview') : '👀 ' + T('Preview')}</button>
          <button class="btn small primary" data-act="use-tpl" data-id="${t.id}">＋ ${tripDayMode() ? T('Add to this day') : T('Use as a day')}</button>
        </div>
      </div>`).join('');
  }

  function newPlan(fields = {}) {
    state.activeTripId = '__loose'; state.view = 'trip';
    const plan = { id: rid(), name: T('Day {n}', { n: state.plans.filter((p) => !p.tripId).length + 1 }), date: '', type: '', stops: [], ...fields };
    state.plans.push(plan);
    setActivePlan(plan.id);
    queueSave(plan, 0);
    return plan;
  }
  function setActivePlan(id) {
    state.activePlanId = id; state.preview = null; LS.set('activePlan', id);
    onPlansChanged();
  }
  function addStop(planId, stop) {
    let plan = planId === '__new' || !state.plans.find((p) => p.id === planId) ? null : state.plans.find((p) => p.id === planId);
    if (!plan) plan = newPlan();
    plan.stops.push({ id: rid(), time: '', note: '', ...stop });
    state.activePlanId = plan.id; state.preview = null;
    queueSave(plan, 0);
    onPlansChanged();
    toast(T('Added to “{name}” ✓', { name: plan.name }));
  }
  function planAsText(plan) {
    const lines = [`🇹🇭 ${plan.name}${plan.date ? ' — ' + plan.date : ''}`];
    plan.stops.forEach((s, i) => {
      const c = stopCoord(s);
      lines.push(`${i + 1}. ${s.time ? s.time + ' ' : ''}${c?.name || T('Stop')}${s.note ? ' — ' + s.note : ''}`);
      if (c) lines.push(`   https://maps.google.com/?q=${c.lat},${c.lng}`);
    });
    return lines.join('\n');
  }

  // ── trips: stays, flights, day-by-day timeline ──────────────
  const DEST = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
  const AIRPORTS = PLACES.filter((p) => p.cat === 'airport');
  const STAY_COLORS = ['#0f766e', '#ea580c', '#7c3aed', '#2563eb', '#db2777', '#ca8a04', '#16a34a', '#0891b2'];
  const HIGH_MONTHS = [12, 1, 2, 7];
  const activeTrip = () => state.trips.find((t) => t.id === state.activeTripId) || null;
  const looseMode = () => !activeTrip() && state.activeTripId === '__loose';
  const tripDayMode = () => !!activeTrip() && state.view === 'day' && activePlan()?.tripId === state.activeTripId;
  const addDays = (iso, n) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const fmtDay = (iso, o = { weekday: 'short', day: 'numeric', month: 'short' }) =>
    (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString(LOCALE, { ...o, timeZone: 'UTC' }) : '');
  const localToday = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const nf = (n) => Math.round(n).toLocaleString(LOCALE);
  const rng = (a, b, unit) => `${nf(a)}–${nf(b)} ${unit}`;
  const normIata = (c) => (c === 'DMK' ? 'BKK' : c);
  const flightOf = (trip, kind) => trip.flights.find((f) => f.kind === kind) || null;
  const stayColor = (trip, stay) => STAY_COLORS[Math.max(0, trip.stays.indexOf(stay)) % STAY_COLORS.length];
  const stayPlaceName = (s) => s.name.split(' / ')[0];

  function nearestAirport(pt, maxKm = 150) {
    let best = null, bd = Infinity;
    AIRPORTS.forEach((a) => { const d = km(pt, a); if (d < bd) { bd = d; best = a; } });
    return bd <= maxKm ? best.iata : null;
  }
  const stayAirport = (s) => normIata((s.dest && DEST[s.dest]?.airport) || (s.lat != null ? nearestAirport(s) : null));

  function domFare(a, b) {
    a = normIata(a); b = normIata(b);
    if (!a || !b || a === b) return null;
    const f = DOMESTIC_FARES[`${a}-${b}`] || DOMESTIC_FARES[`${b}-${a}`];
    if (f) return { lo: f[0], hi: f[1], rough: false };
    const A = PLACE[a], B = PLACE[b];
    if (!A || !B) return null;
    const lo = Math.round((700 + km(A, B) * 1.1) / 100) * 100;
    return { lo, hi: Math.round(lo * 2.6 / 100) * 100, rough: true };
  }
  function intlFare(home, to, date) {
    const t = INTL_FARES.to[normIata(to)];
    if (!t || !INTL_FARES.origins.includes(home)) return null;
    const high = date && HIGH_MONTHS.includes(Number(date.slice(5, 7)));
    const [lo, hi] = high ? t.high : t.low;
    return { lo, hi, season: high ? T('high season') : T('low season') };
  }

  // Night-by-night: which stay you sleep at. Overnight flights land the next day.
  function tripDays(trip) {
    const n = trip.days;
    const out = flightOf(trip, 'out');
    const first = out?.arrDate && trip.start ? Math.min(n - 1, Math.max(0, dayDiff(trip.start, out.arrDate))) : 0;
    const night = new Array(n).fill(null);
    const ranges = {};
    let c = first;
    trip.stays.forEach((s) => {
      const from = c;
      for (let k = 0; k < s.nights && c < n - 1; k++) night[c++] = s;
      ranges[s.id] = { from, to: c };
    });
    const days = [];
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
    // Landing at / flying home from an airport that isn't where you stay → suggest a domestic hop
    const home = flightOf(trip, 'home');
    const firstStay = night[first], lastStay = night[n - 2] || null;
    if (out?.to && firstStay && days[first]) {
      const a = stayAirport(firstStay);
      if (a && a !== normIata(out.to)) days[first].hop = { from: normIata(out.to), to: a };
    }
    if (home?.from && lastStay && n > 1) {
      const a = stayAirport(lastStay);
      if (a && a !== normIata(home.from)) days[n - 1].hop = { from: a, to: normIata(home.from) };
    }
    const totalNights = Math.max(0, n - 1 - first);
    const assigned = trip.stays.reduce((t, s) => t + s.nights, 0);
    return { days, ranges, totalNights, diff: totalNights - assigned, first };
  }
  const dayPlanFor = (trip, date) => state.plans.find((p) => p.tripId === trip.id && p.date === date) || null;
  function ensureDayPlan(trip, idx) {
    const { days } = tripDays(trip);
    const d = days[idx]; if (!d) return null;
    let p = dayPlanFor(trip, d.date);
    if (!p) {
      p = { id: rid(), name: `${T('Day {n}', { n: idx + 1 })}${d.base ? ' · ' + stayPlaceName(d.base) : ''}`, date: d.date, type: '', tripId: trip.id, stops: [] };
      state.plans.push(p); queueSave(p, 0);
    }
    return p;
  }
  function transferInfo(a, b) {
    const d = km(a, b);
    const A = stayAirport(a), B = stayAirport(b);
    const fly = A && B && A !== B && d > 250 ? { from: A, to: B, fare: domFare(A, B) } : null;
    const ground = fly && d > 700 ? '' : (b.dest && DEST[b.dest]?.transfer) || `🚕 ~${T('{n} km by road', { n: nf(d * 1.3) })}`;
    return { fly, ground, d };
  }

  // Links (no booking inside the app — these open a ready-made search)
  const gFlights = (from, to, date, ret) => `https://www.google.com/travel/flights?hl=${LANG}&curr=SEK&q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date}${ret ? ' returning ' + ret : ''}`)}`;
  const yymmdd = (iso) => iso.slice(2).replaceAll('-', '');
  const skyscanner = (from, to, date, ret, adults) => `https://www.skyscanner.se/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(date)}/${ret ? yymmdd(ret) + '/' : ''}?adults=${adults}`;
  function stayLinks(trip, s, range) {
    const q = encodeURIComponent(stayPlaceName(s) + (s.dest ? '' : ' Thailand'));
    const ci = addDays(trip.start, range.from), co = addDays(trip.start, range.to);
    const n = trip.travellers;
    return `<div class="link-row">
      <span>🛏️</span>
      <a target="_blank" rel="noopener" href="https://www.booking.com/searchresults.html?ss=${q}%2C%20Thailand&checkin=${ci}&checkout=${co}&group_adults=${n}&no_rooms=1">Booking</a>
      <a target="_blank" rel="noopener" href="https://www.agoda.com/search?textToSearch=${q}&checkIn=${ci}&checkOut=${co}&adults=${n}&rooms=1">Agoda</a>
      <span>🎟️</span>
      <a target="_blank" rel="noopener" href="https://www.getyourguide.com/s/?q=${q}&date_from=${ci}&date_to=${co}">GetYourGuide</a>
      <a target="_blank" rel="noopener" href="https://www.klook.com/search/result/?query=${q}">Klook</a>
      <a target="_blank" rel="noopener" href="https://www.viator.com/searchResults/all?text=${q}">Viator</a>
    </div>`;
  }

  function ideasFor(s, max = 14) {
    if (s.lat == null) return { places: [], tpls: [] };
    const places = PLACES.filter((p) => p.cat !== 'airport' && km(s, p) <= 25)
      .sort((a, b) => km(s, a) - km(s, b)).slice(0, max);
    const tpls = TEMPLATES.filter((t) => t.stops.some((x) => PLACE[x.place] && km(s, PLACE[x.place]) <= 40));
    return { places, tpls };
  }

  function flightLine(trip, f) {
    const when = `${fmtDay(f.date)}${f.dep ? ' ' + esc(f.dep) : ''}${f.arr ? ' → ' + esc(f.arr) + (f.arrDate && f.arrDate !== f.date ? '<sup>+' + dayDiff(f.date, f.arrDate) + '</sup>' : '') : ''}`;
    let price = '';
    if (f.kind === 'domestic') {
      const p = domFare(f.from, f.to);
      if (p) price = `<span class="fare">≈ ${rng(p.lo, p.hi, '฿')}${p.rough ? ' (' + T('rough') + ')' : ''}</span>`;
    }
    const ret = f.kind === 'out' ? flightOf(trip, 'home')?.date : '';
    const links = f.from && f.to && f.date && f.kind !== 'home' ? `
      <a target="_blank" rel="noopener" href="${gFlights(f.from, f.to, f.date, ret)}">Google Flights</a>
      <a target="_blank" rel="noopener" href="${skyscanner(f.from, f.to, f.date, ret, trip.travellers)}">Skyscanner</a>` : '';
    return `<li class="flight ${f.kind}">
      <div><b>${f.kind === 'home' ? '🏠' : f.kind === 'out' ? '🛫' : '✈️'} ${esc(f.from || '?')} → ${esc(f.to || '?')}</b>
        ${f.flightNo ? `<span class="badge">${esc(f.flightNo)}</span>` : ''} ${price}
        <div class="muted">${when}${f.kind === 'out' && ret ? ' · ' + T('return') + ' ' + fmtDay(ret) : ''}</div>
        ${links ? `<div class="link-row">${links}</div>` : ''}</div>
      ${f.kind === 'domestic' ? `<button class="icon-btn" data-act="del-flight" data-id="${esc(f.id)}" aria-label="${T('Remove')}">✕</button>` : ''}
    </li>`;
  }

  function costHtml(trip) {
    const out = flightOf(trip, 'out');
    const intl = out ? intlFare(trip.home, out.to, out.date) : null;
    let dLo = 0, dHi = 0; let nDom = 0;
    trip.flights.filter((f) => f.kind === 'domestic').forEach((f) => { const p = domFare(f.from, f.to); if (p) { dLo += p.lo; dHi += p.hi; nDom++; } });
    const n = trip.travellers;
    const parts = [];
    if (intl) parts.push(`<div>🌏 ${T('Return')} ${esc(trip.home)}–${esc(normIata(out.to))}, ${intl.season}: <b>${rng(intl.lo * n, intl.hi * n, 'SEK')}</b> <span class="muted">(${n} × ${rng(intl.lo, intl.hi, 'SEK')})</span></div>`);
    else if (out) parts.push(`<div>🌏 ${T('No guide price from {from} — use the search buttons above.', { from: esc(trip.home || '?') })}</div>`);
    if (nDom) parts.push(`<div>🇹🇭 ${T(nDom > 1 ? '{n} domestic flights' : '{n} domestic flight', { n: nDom })}: <b>${rng(dLo * n, dHi * n, '฿')}</b> <span class="muted">(${T('{n} travellers', { n })})</span></div>`);
    return `<div class="cost"><div class="cost-title">💰 ${T('Rough flight budget')}</div>${parts.join('')}
      <div class="muted small-print">${T('Guide prices only — real fares vary a lot with dates and airline.')}${nDom ? '' : ' ' + T('Add domestic flights from the timeline to include them.')}</div></div>`;
  }

  function ideasListHtml(trip, s, days) {
    const { places, tpls } = ideasFor(s);
    if (!places.length && !tpls.length) return `<p class="muted small-print">${T('No curated places near this stop yet — try the tour links above.')}</p>`;
    const dayOpts = days.map((d) => `<option value="${d.i}">${T('Day {n}', { n: d.i + 1 })} · ${fmtDay(d.date)}</option>`).join('');
    return `<div class="ideas">
      ${places.map((p) => `<div class="idea" style="--c:${CATEGORIES[p.cat].color}">
        <span class="idea-name" data-act="select-place" data-id="${p.id}">${CATEGORIES[p.cat].icon} ${esc(p.name)}</span>
        <select data-idea-place="${p.id}" aria-label="${esc(p.name)}"><option value="">＋ ${T('Day…')}</option>${dayOpts}</select>
      </div>`).join('')}
      ${tpls.map((t) => `<div class="idea tpl-idea">
        <span class="idea-name" data-act="preview-tpl" data-id="${t.id}">📋 ${esc(t.name)}</span>
        <select data-idea-tpl="${t.id}" aria-label="${esc(t.name)}"><option value="">${T('Use on…')}</option>${dayOpts}</select>
      </div>`).join('')}
    </div>`;
  }

  function renderTripBar() {
    const sel = $('#tripSelect');
    const loose = state.plans.filter((p) => !p.tripId);
    const opts = state.trips.map((t) => `<option value="${esc(t.id)}" ${t.id === state.activeTripId ? 'selected' : ''}>🧳 ${esc(t.name)}${t.start ? ' · ' + fmtDay(t.start, { month: 'short', year: 'numeric' }) : ''}</option>`);
    if (loose.length || looseMode()) opts.push(`<option value="__loose" ${looseMode() ? 'selected' : ''}>📅 ${T('Loose days')} (${loose.length})</option>`);
    if (!opts.length) opts.push(`<option value="">${T('No trips yet')}</option>`);
    sel.innerHTML = opts.join('');
  }

  function renderTripView() {
    const el = $('#tripView');
    const trip = activeTrip();
    const showTrip = trip && state.view !== 'day';
    const welcome = !trip && !looseMode();
    $('#dayArea').classList.toggle('hidden', showTrip || welcome);
    $('#looseTop').classList.toggle('hidden', !looseMode());
    el.classList.toggle('hidden', !showTrip && !welcome);
    if (welcome) {
      el.innerHTML = `<div class="plan-card empty trip-welcome">
        <div class="big">🧳</div><b>${T('Plan your whole trip')}</b>
        <p>${T('Enter dates and flights, add the places you’ll stay, and get a day-by-day timeline with rough flight prices and ideas for every stop.')}</p>
        <button class="btn primary" data-act="new-trip">＋ ${T('Create a trip')}</button>
      </div>`;
      return;
    }
    if (!showTrip) { el.innerHTML = ''; return; }
    const { days, ranges, totalNights, diff } = tripDays(trip);
    const last = addDays(trip.start, trip.days - 1);
    const flights = [flightOf(trip, 'out'), ...trip.flights.filter((f) => f.kind === 'domestic').sort((a, b) => (a.date + a.dep).localeCompare(b.date + b.dep)), flightOf(trip, 'home')].filter(Boolean);
    const today = localToday();
    preserve(el, () => {
      el.innerHTML = `
      <div class="card trip-sum">
        <div class="trip-sum-head">
          <div><h3>${esc(trip.name)}</h3>
            <p class="muted">${fmtDay(trip.start)} – ${fmtDay(last, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${T('{n} days', { n: trip.days })} · 👥 ${trip.travellers}</p></div>
          <button class="icon-btn" data-act="edit-trip" aria-label="${T('Edit trip')}">✏️</button>
        </div>
        <ul class="flights">${flights.map((f) => flightLine(trip, f)).join('')}</ul>
        ${costHtml(trip)}
        <div class="plan-foot">
          <button class="btn small" data-act="fit-trip">🗺️ ${T('Show trip')}</button>
          <button class="btn small" data-act="share-trip">📤 ${T('Share as text')}</button>
          <button class="btn small danger" data-act="del-trip">🗑 ${T('Delete trip')}</button>
        </div>
      </div>

      <div class="card stays-card">
        <h3>🧳 ${T('Where you’ll stay')}</h3>
        <p class="muted">${T('{n} nights in Thailand', { n: totalNights })}${diff > 0 ? ` · <span class="warn">⚠️ ${T(diff > 1 ? '{n} nights not planned yet' : '{n} night not planned yet', { n: diff })}</span>` : diff < 0 ? ` · <span class="warn">⚠️ ${T(diff < -1 ? '{n} nights too many' : '{n} night too many', { n: -diff })}</span>` : ` · ✅ ${T('all nights planned')}`}</p>
        <ol class="stay-list">${trip.stays.map((s, k) => {
          const r = ranges[s.id] || { from: 0, to: 0 };
          const open = state.openIdeas.has(s.id);
          const sd = days.filter((d) => d.base === s && !d.inAir);
          return `<li class="stay" style="--c:${stayColor(trip, s)}">
            <div class="stay-row">
              <div class="stay-num">${k + 1}</div>
              <div class="stay-main">
                <div class="stay-name" data-act="goto-stay" data-id="${esc(s.id)}">${esc(s.name)}</div>
                <div class="muted">${r.to > r.from ? `${fmtDay(addDays(trip.start, r.from))} → ${fmtDay(addDays(trip.start, r.to))}` : T('outside the trip dates')}</div>
              </div>
              <div class="nights">
                <button class="icon-btn" data-act="stay-nights" data-id="${esc(s.id)}" data-d="-1" ${s.nights <= 0 ? 'disabled' : ''} aria-label="−1">−</button>
                <b>${s.nights}</b><span>${T(s.nights === 1 ? 'night' : 'nights')}</span>
                <button class="icon-btn" data-act="stay-nights" data-id="${esc(s.id)}" data-d="1" aria-label="+1">＋</button>
              </div>
              <div class="ctrl">
                <button class="icon-btn" data-act="stay-move" data-id="${esc(s.id)}" data-d="-1" ${k === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
                <button class="icon-btn" data-act="stay-move" data-id="${esc(s.id)}" data-d="1" ${k === trip.stays.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
                <button class="icon-btn" data-act="stay-del" data-id="${esc(s.id)}" aria-label="${T('Remove')}">✕</button>
              </div>
            </div>
            ${r.to > r.from ? stayLinks(trip, s, r) : ''}
            <button class="ideas-toggle" data-act="toggle-ideas" data-id="${esc(s.id)}">💡 ${T('Things to do near {name}', { name: esc(stayPlaceName(s)) })} ${open ? '▴' : '▾'}</button>
            ${open ? ideasListHtml(trip, s, sd) : ''}
          </li>`;
        }).join('')}</ol>
        <select data-stay-add aria-label="${T('Add a stop…')}">
          <option value="">＋ ${T('Add a stop…')}</option>
          ${DESTINATIONS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
          <option value="__map">📍 ${T('Pick a spot on the map…')}</option>
        </select>
      </div>

      <h3 class="section-title">🗓️ ${T('Day by day')}</h3>
      <ol class="timeline">${days.map((d) => {
        const plan = dayPlanFor(trip, d.date);
        const stops = plan?.stops || [];
        const c = d.base ? stayColor(trip, d.base) : '#94a3b8';
        let move = '';
        if (d.from && d.stay) {
          const t = transferInfo(d.from, d.stay);
          const added = t.fly && trip.flights.some((f) => f.kind === 'domestic' && f.date === d.date && normIata(f.from) === t.fly.from && normIata(f.to) === t.fly.to);
          move = `<div class="tl-move">🔁 ${esc(stayPlaceName(d.from))} → ${esc(stayPlaceName(d.stay))} <span class="muted">· ~${nf(t.d)} km</span></div>
            ${t.fly && !added ? `<div class="tl-hint">✈️ ${t.fly.from}→${t.fly.to}${t.fly.fare ? ` ≈ ${rng(t.fly.fare.lo, t.fly.fare.hi, '฿')} ${T('pp')}` : ''}
              <button class="btn tiny" data-act="add-dom-flight" data-idx="${d.i}">＋ ${T('Add flight')}</button></div>` : ''}
            ${t.ground && (!t.fly || !added) ? `<div class="tl-hint">${t.fly ? T('or') + ' ' : ''}${esc(t.ground)}</div>` : ''}`;
        }
        if (d.hop) {
          const added = trip.flights.some((f) => f.kind === 'domestic' && f.date === d.date && normIata(f.from) === d.hop.from && normIata(f.to) === d.hop.to);
          const fare = domFare(d.hop.from, d.hop.to);
          if (!added) move += `<div class="tl-hint">🔗 ${T('Connection')} ${d.hop.from}→${d.hop.to}${fare ? ` ≈ ${rng(fare.lo, fare.hi, '฿')} ${T('pp')}` : ''}
            <button class="btn tiny" data-act="add-dom-flight" data-idx="${d.i}" data-hop="1">＋ ${T('Add flight')}</button></div>`;
        }
        const fl = d.flights.map((f) => `<div class="tl-flight">${f.kind === 'home' ? '🏠' : '🛫'} ${esc(f.from)}→${esc(f.to)}${f.dep ? ' ' + esc(f.dep) : ''}${f.flightNo ? ' · ' + esc(f.flightNo) : ''}</div>`).join('')
          + d.arrivals.map((f) => `<div class="tl-flight">🛬 ${T('Land')} ${esc(f.to)}${f.arr ? ' ' + esc(f.arr) : ''}</div>`).join('');
        const title = d.inAir ? '✈️ ' + T('On the way to Thailand') : d.base ? esc(stayPlaceName(d.base)) : `<span class="warn">${T('No stop planned')}</span>`;
        return `<li class="tl-day ${d.from ? 'travel' : ''} ${d.date === today ? 'today' : ''}" style="--c:${c}" data-act="open-day" data-idx="${d.i}" tabindex="0">
          <div class="tl-date"><span>${fmtDay(d.date, { weekday: 'short' })}</span><b>${fmtDay(d.date, { day: 'numeric' })}</b><span>${fmtDay(d.date, { month: 'short' })}</span></div>
          <div class="tl-body">
            <div class="tl-title"><span class="tl-n">${T('Day {n}', { n: d.i + 1 })}</span> ${title}</div>
            ${fl}${move}
            <div class="tl-acts">${stops.length
              ? stops.slice(0, 4).map((s) => `${s.time ? `<b>${esc(s.time)}</b> ` : ''}${esc(stopCoord(s)?.name || T('Stop'))}`).join(' · ') + (stops.length > 4 ? ` · ${T('+{n} more', { n: stops.length - 4 })}` : '')
              : `<span class="muted">${d.inAir ? '' : T('Tap to plan this day')}</span>`}</div>
          </div>
        </li>`;
      }).join('')}</ol>`;
    });
  }

  function renderDayHead() {
    const el = $('#dayHead');
    const trip = activeTrip(), plan = activePlan();
    if (!tripDayMode()) { el.innerHTML = ''; $('#dayIdeas').innerHTML = ''; return; }
    const { days } = tripDays(trip);
    const idx = dayDiff(trip.start, plan.date);
    const d = days[idx];
    el.innerHTML = `<div class="day-head">
      <button class="btn small" data-act="back-timeline">← ${T('Timeline')}</button>
      <div class="day-nav">
        <button class="icon-btn" data-act="day-step" data-d="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="${T('Previous day')}">‹</button>
        <b>${T('Day {n}', { n: idx + 1 })} · ${fmtDay(plan.date)}</b>
        <button class="icon-btn" data-act="day-step" data-d="1" ${idx >= trip.days - 1 ? 'disabled' : ''} aria-label="${T('Next day')}">›</button>
      </div>
    </div>
    ${d?.from && d.stay ? `<div class="day-note">🔁 ${T('Travel day:')} ${esc(stayPlaceName(d.from))} → ${esc(stayPlaceName(d.stay))}</div>` : ''}
    ${d?.flights.length ? `<div class="day-note">${d.flights.map((f) => `✈️ ${esc(f.from)}→${esc(f.to)}${f.dep ? ' ' + esc(f.dep) : ''}`).join(' · ')}</div>` : ''}`;
    // Ideas for the place you’re staying that day
    const s = d?.base;
    if (!s) { $('#dayIdeas').innerHTML = ''; return; }
    const { places, tpls } = ideasFor(s, 10);
    const inDay = new Set(plan.stops.map((x) => x.place));
    const r = tripDays(trip).ranges[s.id];
    $('#dayIdeas').innerHTML = `<div class="card day-ideas">
      <h3>💡 ${T('Ideas near {name}', { name: esc(stayPlaceName(s)) })}</h3>
      ${r ? stayLinks(trip, s, r) : ''}
      <div class="ideas">
        ${places.map((p) => `<div class="idea" style="--c:${CATEGORIES[p.cat].color}">
          <span class="idea-name" data-act="select-place" data-id="${p.id}">${CATEGORIES[p.cat].icon} ${esc(p.name)}</span>
          ${inDay.has(p.id) ? `<span class="muted">✓ ${T('added')}</span>` : `<button class="btn tiny" data-act="add-idea-here" data-id="${p.id}">＋ ${T('Add')}</button>`}
        </div>`).join('')}
        ${tpls.map((t) => `<div class="idea tpl-idea">
          <span class="idea-name" data-act="preview-tpl" data-id="${t.id}">📋 ${esc(t.name)}</span>
          <button class="btn tiny" data-act="use-tpl" data-id="${t.id}">＋ ${T('Use')}</button>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function drawTrip(trip) {
    const pts = trip.stays.filter((s) => s.lat != null);
    if (pts.length > 1) {
      L.polyline(pts.map((s) => [s.lat, s.lng]), { color: '#fff', weight: 7, opacity: 0.8 }).addTo(planLayer);
      L.polyline(pts.map((s) => [s.lat, s.lng]), { color: '#0f766e', weight: 3.5, dashArray: '6 8', lineCap: 'round' }).addTo(planLayer);
    }
    pts.forEach((s) => {
      const k = trip.stays.indexOf(s);
      L.marker([s.lat, s.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: `<div class="stay-pin" style="--c:${stayColor(trip, s)}">${k + 1}</div>` }),
      }).bindTooltip(`${esc(s.name)} · ${s.nights} ${T(s.nights === 1 ? 'night' : 'nights')}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => { state.openIdeas.add(s.id); switchTab('plan'); renderTripView(); })
        .addTo(planLayer);
    });
  }
  function fitTrip(trip) {
    const pts = trip.stays.filter((s) => s.lat != null);
    if (!pts.length) return;
    if (pts.length === 1) map.flyTo([pts[0].lat, pts[0].lng], 11);
    else map.flyToBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])), { padding: [50, 50], maxZoom: 11 });
  }

  function tripAsText(trip) {
    const { days } = tripDays(trip);
    const lines = [`🇹🇭 ${trip.name} — ${fmtDay(trip.start)} → ${fmtDay(addDays(trip.start, trip.days - 1))} (${T('{n} days', { n: trip.days })})`];
    trip.stays.forEach((s) => lines.push(`🧳 ${s.name}: ${s.nights} ${T(s.nights === 1 ? 'night' : 'nights')}`));
    lines.push('');
    days.forEach((d) => {
      const plan = dayPlanFor(trip, d.date);
      const bits = [
        ...d.flights.map((f) => `✈️ ${f.from}→${f.to}${f.dep ? ' ' + f.dep : ''}${f.flightNo ? ' ' + f.flightNo : ''}`),
        d.from && d.stay ? `🔁 ${stayPlaceName(d.from)} → ${stayPlaceName(d.stay)}` : '',
        ...(plan?.stops || []).map((s) => `${s.time ? s.time + ' ' : ''}${stopCoord(s)?.name || T('Stop')}`),
      ].filter(Boolean);
      lines.push(`${fmtDay(d.date)} · ${T('Day {n}', { n: d.i + 1 })}${d.base ? ' · ' + stayPlaceName(d.base) : ''}${bits.length ? '\n   ' + bits.join('\n   ') : ''}`);
    });
    return lines.join('\n');
  }

  // ── trip actions ──
  function saveTrip(trip, delay = 0) { queueSave(trip, delay, 'trips'); onPlansChanged(); }
  function setActiveTrip(id) {
    state.activeTripId = id; LS.set('activeTrip', id);
    state.view = 'trip'; state.preview = null;
    if (id === '__loose') state.activePlanId = state.plans.find((p) => !p.tripId)?.id || null;
    onPlansChanged();
    const t = activeTrip(); if (t) fitTrip(t);
  }
  function openDay(trip, idx) {
    const p = ensureDayPlan(trip, idx); if (!p) return;
    state.activePlanId = p.id; LS.set('activePlan', p.id);
    state.view = 'day'; state.preview = null;
    onPlansChanged();
    $('#tab-plan').scrollTop = 0;
    if (p.stops.length) fitStops(p.stops);
    else if (tripDays(trip).days[idx]?.base) { const b = tripDays(trip).days[idx].base; if (b.lat != null) map.flyTo([b.lat, b.lng], 12); }
  }
  function addStay(trip, st) {
    const { diff } = tripDays(trip);
    let nights = 2;
    if (diff > 0) nights = Math.min(diff, 3);
    else {
      const big = [...trip.stays].sort((a, b) => b.nights - a.nights)[0];
      if (big && big.nights > 1) { const take = Math.min(2, big.nights - 1); big.nights -= take; nights = take; }
    }
    trip.stays.push({ id: rid(), nights, ...st });
    saveTrip(trip);
    toast(T('{name} added — {n} {nights}', { name: st.name, n: nights, nights: T(nights === 1 ? 'night' : 'nights') }));
  }
  async function deleteTrip(trip) {
    for (const p of state.plans.filter((x) => x.tripId === trip.id)) await deletePlan(p.id);
    clearTimeout(saveTimers[trip.id]); dirty.delete(trip.id);
    state.trips = state.trips.filter((t) => t.id !== trip.id);
    if (!state.online) persistLocal();
    else try { await req('DELETE', '/trips/' + trip.id); } catch (e) { toast(T('Could not delete: ') + e.message); }
    setActiveTrip(state.trips[0]?.id || (state.plans.some((p) => !p.tripId) ? '__loose' : null));
  }

  // ── trip dialog ──
  let editingTripId = null;
  function openTripDialog(trip = null) {
    editingTripId = trip?.id || null;
    const f = $('#tripForm');
    const intl = AIRPORTS.filter((a) => a.intl);
    const opt = (sel) => intl.map((a) => `<option value="${a.iata}" ${a.iata === sel ? 'selected' : ''}>${a.iata} · ${esc(a.name.replace(/\s*\([A-Z]{3}\)$/, ''))}</option>`).join('');
    const out = trip && flightOf(trip, 'out'), home = trip && flightOf(trip, 'home');
    $('#tripDialogTitle').textContent = trip ? T('Edit trip') : T('New trip');
    $('#tripSubmit').textContent = trip ? T('Save') : T('Create trip');
    f.name.value = trip?.name || '';
    f.start.value = trip?.start || '';
    f.days.value = trip?.days || 14;
    f.travellers.value = trip?.travellers || 2;
    f.home.value = trip?.home || 'ARN';
    f.outTo.innerHTML = opt(out?.to || 'BKK');
    f.outNo.value = out?.flightNo || '';
    f.outDep.value = out?.dep || '';
    f.outArr.value = out?.arr || '';
    f.outArrNext.value = out ? String(Math.max(0, Math.min(1, dayDiff(out.date, out.arrDate || out.date)))) : '1';
    f.homeFrom.innerHTML = opt(home?.from || out?.to || 'BKK');
    f.homeNo.value = home?.flightNo || '';
    f.homeDep.value = home?.dep || '';
    $('#tripDialog').showModal();
    setTimeout(() => f.name.focus(), 30);
  }
  $('#tripForm').addEventListener('submit', (e) => {
    const f = e.target;
    const old = editingTripId && state.trips.find((t) => t.id === editingTripId);
    const trip = old || { id: rid(), stays: [], flights: [] };
    const prevStart = trip.start;
    trip.name = f.name.value.trim().slice(0, 120) || T('Our trip');
    trip.start = f.start.value;
    trip.days = Math.max(1, Math.min(120, Number(f.days.value) || 14));
    trip.travellers = Math.max(1, Math.min(20, Number(f.travellers.value) || 2));
    trip.home = f.home.value.trim().toUpperCase().slice(0, 3);
    if (old && prevStart && prevStart !== trip.start) {
      const delta = dayDiff(prevStart, trip.start);
      state.plans.filter((p) => p.tripId === trip.id && p.date).forEach((p) => { p.date = addDays(p.date, delta); queueSave(p, 0); });
      trip.flights.filter((x) => x.kind === 'domestic').forEach((x) => { x.date = addDays(x.date, delta); });
    }
    let out = flightOf(trip, 'out'); if (!out) { out = { id: rid(), kind: 'out' }; trip.flights.push(out); }
    Object.assign(out, { from: trip.home, to: f.outTo.value, date: trip.start, arrDate: addDays(trip.start, Number(f.outArrNext.value)),
      dep: f.outDep.value, arr: f.outArr.value, flightNo: f.outNo.value.trim().toUpperCase() });
    let home = flightOf(trip, 'home'); if (!home) { home = { id: rid(), kind: 'home' }; trip.flights.push(home); }
    Object.assign(home, { from: f.homeFrom.value, to: trip.home, date: addDays(trip.start, trip.days - 1),
      dep: f.homeDep.value, flightNo: f.homeNo.value.trim().toUpperCase(), arr: '', arrDate: '' });
    if (!old) {
      state.trips.push(trip);
      const d = DESTINATIONS.find((x) => x.airport === normIata(out.to)) || DEST.bangkok;
      trip.stays.push({ id: rid(), dest: d.id, name: d.name, lat: d.lat, lng: d.lng, nights: 1 });
      trip.stays[0].nights = Math.max(1, tripDays(trip).totalNights);
    }
    queueSave(trip, 0, 'trips');
    setActiveTrip(trip.id);
    switchTab('plan');
    toast(old ? T('Trip updated ✓') : T('“{name}” created — add your stops 🧳', { name: trip.name }));
  });

  // "Add to day" choices: every day of the active trip (preselect the day you’re near), then loose days
  function addToDayOptions(place) {
    let html = '';
    const tr = activeTrip();
    if (tr) {
      const { days } = tripDays(tr);
      const cur = tripDayMode() ? dayDiff(tr.start, activePlan().date) : -1;
      let pick = cur;
      if (pick < 0) { const near = days.find((d) => d.base && d.base.lat != null && !d.inAir && km(d.base, place) < 40); pick = near ? near.i : -1; }
      html += `<optgroup label="${esc(tr.name)}">${days.map((d) => `<option value="t|${esc(tr.id)}|${d.i}" ${d.i === pick ? 'selected' : ''}>${T('Day {n}', { n: d.i + 1 })} · ${fmtDay(d.date)}${d.base ? ' · ' + esc(stayPlaceName(d.base)) : ''}</option>`).join('')}</optgroup>`;
    }
    const loose = state.plans.filter((p) => !p.tripId);
    if (loose.length) html += `<optgroup label="${T('Loose days')}">${loose.map((pl) => `<option value="${esc(pl.id)}" ${!tr && pl.id === state.activePlanId ? 'selected' : ''}>${esc(pl.name)}</option>`).join('')}</optgroup>`;
    return html;
  }

  // ── panel: family ───────────────────────────────────────────
  function members() {
    const m = new Map();
    [...state.notes].sort((a, b) => a.createdAt - b.createdAt).forEach((n) => m.set(n.author, n.color));
    state.plans.forEach((p) => { if (p.updatedBy && !m.has(p.updatedBy)) m.set(p.updatedBy, '#475569'); });
    if (state.me) m.set(state.me.name, state.me.color);
    return [...m.entries()];
  }
  const inviteLink = () => `${location.origin}${location.pathname}?family=${encodeURIComponent(state.family || '')}`;

  function renderFamily() {
    const card = $('#familyCard');
    if (!state.family || !state.me) {
      card.innerHTML = `<h3>${T('Plan together')} 👨‍👩‍👧‍👦</h3>
        <p class="muted" style="font-size:14px">${T('Join a family with a shared code to comment on places, drop notes on the map and build day plans together — live.')}</p>
        <button class="btn primary" data-act="open-join">${T('Join or create a family')}</button>`;
    } else {
      const local = /^(localhost|127\.)/.test(location.hostname);
      card.innerHTML = `<h3>${esc(state.family)}</h3>
        <p style="font-size:14px;margin:0">${T('You are')} <b style="color:${esc(state.me.color)}">${esc(state.me.name)}</b>
          · ${state.online ? `<span style="color:var(--teal)">● ${T('live')}</span>` : `<span style="color:var(--saffron)">● ${T('this device only')}</span>`}</p>
        <div class="members">${members().map(([n, c]) => `<span class="member">${avatar(n, c)}${esc(n)}</span>`).join('')}</div>
        <div class="invite"><input readonly id="inviteInput" value="${esc(inviteLink())}" /><button class="btn small" data-act="copy-invite">${T('Copy invite')}</button></div>
        ${local ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${T('This is a localhost link — family on the same Wi-Fi should use the network address shown in the terminal, or deploy the server (see README).')}</p>` : ''}
        <div style="margin-top:10px"><button class="btn small ghost" data-act="open-join">${T('Change name / family')}</button></div>`;
    }
    renderFeed();
    renderLive();
  }

  function renderFeed() {
    const items = [...state.notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
    $('#feed').innerHTML = items.length ? items.map((n) => {
      const root = n.parentId ? state.notes.find((x) => x.id === n.parentId) : null;
      const where = n.placeId ? `📍 ${PLACE[n.placeId]?.name || T('a place')}` : root ? `↩ ${T('reply to {who}', { who: root.author })}` : `📌 ${T('Note on the map')}`;
      return `<div class="comment kind-${esc(n.kind)}" data-act="goto-note" data-id="${esc(n.id)}">
        ${avatar(n.author, n.color)}
        <div class="body"><div class="who">${esc(n.author)}<time>${ago(n.createdAt)}</time></div>
        <div class="where">${esc(where)}</div><div class="txt">${esc(n.text)}</div></div></div>`;
    }).join('') : `<div class="empty">${T('No comments yet.<br/>Tap 📍 Note on the map, or comment on any place.')}</div>`;
    updateUnread();
  }
  function updateUnread() {
    const unread = state.notes.some((n) => n.createdAt > state.lastSeen && n.author !== state.me?.name);
    $('#unreadDot').classList.toggle('hidden', !unread || state.tab === 'family');
  }
  function renderBadge() {
    $('#familyBadge').innerHTML = state.family && state.me
      ? `${esc(state.me.name)} · ${T('family')} <b>${esc(state.family)}</b> ${state.online ? '🟢' : '🟠'}`
      : T('Tap to join your family →');
  }

  function gotoNote(id) {
    let n = state.notes.find((x) => x.id === id);
    if (!n) return;
    if (n.parentId) n = state.notes.find((x) => x.id === n.parentId) || n;
    if (n.placeId) return selectPlace(n.placeId);
    if (isMapNote(n)) {
      map.flyTo([n.lat, n.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
      map.once('moveend', () => noteMarkers[n.id]?.openPopup());
    }
  }

  // ── join dialog ─────────────────────────────────────────────
  let pickedColor = state.me?.color || COLORS[0];
  function openJoin() {
    const params = new URLSearchParams(location.search);
    $('#joinName').value = state.me?.name || '';
    $('#joinCode').value = params.get('family') || state.family || '';
    $('#colorRow').innerHTML = COLORS.map((c) => `<button type="button" data-color="${c}" class="${c === pickedColor ? 'on' : ''}" style="background:${c}" aria-label="${T('Colour')} ${c}"></button>`).join('');
    $('#joinDialog').showModal();
  }
  function ensureMe() {
    if (state.me) return true;
    toast(T('Tell us who you are first 🙂')); openJoin(); return false;
  }
  $('#colorRow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    pickedColor = b.dataset.color;
    $$('#colorRow button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#genCode').addEventListener('click', () => {
    const words = ['mango', 'tuktuk', 'lotus', 'coconut', 'elephant', 'longtail', 'orchid', 'padthai', 'monsoon', 'jasmine'];
    const w = () => words[Math.floor(Math.random() * words.length)];
    $('#joinCode').value = `${w()}-${w()}-${Math.floor(100 + Math.random() * 900)}`;
  });
  $('#joinForm').addEventListener('submit', () => {
    const name = $('#joinName').value.trim().slice(0, 40);
    const code = $('#joinCode').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
    if (!name || code.length < 3) return;
    const changedFamily = code !== state.family;
    if (changedFamily && state.online && state.family) req('DELETE', '/locations/' + memberId).catch(() => {});
    state.me = { name, color: pickedColor }; state.family = code;
    LS.set('me', state.me); LS.set('family', code);
    history.replaceState(null, '', `?family=${encodeURIComponent(code)}`);
    if (changedFamily) connect(); else renderAll();
    toast(T('Welcome, {name}! 🙏', { name }));
  });

  // ── tabs, modes, sheet ──────────────────────────────────────
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.tab-body').forEach((b) => b.classList.toggle('hidden', b.id !== 'tab-' + tab));
    if (tab === 'family') { state.lastSeen = Date.now(); LS.set('lastSeen', state.lastSeen); }
    updateUnread();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => { switchTab(t.dataset.tab); if ($('#panel').classList.contains('collapsed')) setSheet(''); }));

  function setMode(mode) {
    state.mode = mode;
    $('#map').classList.toggle('crosshair', !!mode);
    $('#dropNoteBtn').classList.toggle('active', mode === 'note');
    $('#meetBtn').classList.toggle('active', mode === 'meet');
    const b = $('#modeBanner');
    if (!mode) { b.classList.add('hidden'); return; }
    b.innerHTML = (mode === 'note' ? T('📍 Tap anywhere on the map to drop a family note') : mode === 'meet' ? T('🚩 Tap the map where everyone should meet') : mode === 'stay' ? T('🧳 Tap the map where you’ll stay') : T('📌 Tap the map to add a custom stop to “{name}”', { name: esc(activePlan()?.name || T('a new day')) })) +
      ` <button data-act="cancel-mode">${T('Cancel')}</button>`;
    b.classList.remove('hidden');
  }

  function setSheet(cls) {
    const p = $('#panel');
    p.classList.remove('collapsed', 'expanded');
    if (cls) p.classList.add(cls);
    setTimeout(() => map.invalidateSize(), 280);
  }
  $('#sheetHandle').addEventListener('click', () => {
    const p = $('#panel');
    setSheet(p.classList.contains('collapsed') ? '' : p.classList.contains('expanded') ? 'collapsed' : 'expanded');
  });

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (state.mode === 'note') {
      if (!ensureMe()) return;
      L.popup({ minWidth: 250 }).setLatLng(e.latlng).setContent(
        `<div class="popup"><h4>📍 ${T('New family note')}</h4>${composeHtml({ lat: lat.toFixed(6), lng: lng.toFixed(6), key: 'new-note', placeholder: T('e.g. “Great ice cream here!” or “Meet here at 6 pm”') })}</div>`,
      ).openOn(map);
      setTimeout(() => $('[data-key="new-note"]')?.focus(), 50);
    } else if (state.mode === 'meet') {
      openMeetupComposer(e.latlng);
    } else if (state.mode === 'stay') {
      L.popup({ minWidth: 230 }).setLatLng(e.latlng).setContent(
        `<form class="popup compose" data-staymap data-lat="${lat.toFixed(6)}" data-lng="${lng.toFixed(6)}">
          <h4>🧳 ${T('New stop')}</h4>
          <input name="name" required maxlength="80" placeholder="${T('Name, e.g. Koh Kood')}" />
          <div class="compose-row"><span></span><button class="btn primary small" type="submit">${T('Add stop')}</button></div>
        </form>`,
      ).openOn(map);
      setTimeout(() => $('[data-staymap] input')?.focus(), 50);
    } else if (state.mode === 'stop') {
      L.popup({ minWidth: 230 }).setLatLng(e.latlng).setContent(
        `<form class="popup compose" data-customstop data-lat="${lat.toFixed(6)}" data-lng="${lng.toFixed(6)}">
          <h4>📌 ${T('Custom stop')}</h4>
          <input name="name" required maxlength="120" placeholder="${T('Name, e.g. Our hotel')}" />
          <div class="compose-row"><input name="time" type="time" /><button class="btn primary small" type="submit">${T('Add')}</button></div>
        </form>`,
      ).openOn(map);
      setTimeout(() => $('[data-customstop] input')?.focus(), 50);
    }
  });

  // ── global event delegation ─────────────────────────────────
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const { act, id } = t.dataset;
    const idx = Number(t.dataset.idx);
    const plan = activePlan();
    switch (act) {
      case 'select-place': selectPlace(id); break;
      case 'close-detail': { const prev = state.selected; state.selected = null; refreshPlaceIcon(prev); renderDetail(); break; }
      case 'zoom': { const p = PLACE[id]; map.flyTo([p.lat, p.lng], 16); break; }
      case 'cat-all': state.cats = new Set(Object.keys(CATEGORIES)); onFilterChanged(); break;
      case 'cat': {
        const all = state.cats.size === Object.keys(CATEGORIES).length;
        if (all) state.cats = new Set([id]);
        else if (state.cats.has(id)) state.cats.delete(id);
        else state.cats.add(id);
        if (!state.cats.size) state.cats = new Set(Object.keys(CATEGORIES));
        onFilterChanged(); break;
      }
      case 'add-to-plan': {
        const target = $('[data-plan-target]')?.value || '__new';
        if (target.startsWith('t|')) {
          const [, tid, i] = target.split('|');
          const tr = state.trips.find((x) => x.id === tid);
          const dp = tr && ensureDayPlan(tr, Number(i));
          if (dp) { dp.stops.push({ id: rid(), time: '', note: '', place: id }); queueSave(dp, 0); onPlansChanged(); toast(T('Added to “{name}” ✓', { name: dp.name })); }
        } else addStop(target, { place: id });
        break;
      }
      case 'new-trip': openTripDialog(); break;
      case 'edit-trip': if (activeTrip()) openTripDialog(activeTrip()); break;
      case 'close-trip-dialog': $('#tripDialog').close(); break;
      case 'del-trip': if (activeTrip() && armed(t)) { const n = activeTrip().name; await deleteTrip(activeTrip()); toast(T('“{name}” deleted', { name: n })); } break;
      case 'share-trip': if (activeTrip()) share(tripAsText(activeTrip())); break;
      case 'fit-trip': if (activeTrip()) { fitTrip(activeTrip()); if (window.innerWidth <= 760) setSheet('collapsed'); } break;
      case 'open-day': if (activeTrip()) openDay(activeTrip(), idx); break;
      case 'back-timeline': state.view = 'trip'; onPlansChanged(); if (activeTrip()) fitTrip(activeTrip()); break;
      case 'day-step': {
        const tr = activeTrip(); if (!tr || !plan) break;
        const j = dayDiff(tr.start, plan.date) + Number(t.dataset.d);
        if (j >= 0 && j < tr.days) openDay(tr, j);
        break;
      }
      case 'stay-nights': case 'stay-move': case 'stay-del': case 'goto-stay': case 'toggle-ideas': {
        const tr = activeTrip(); const s = tr?.stays.find((x) => x.id === id); if (!s) break;
        const k = tr.stays.indexOf(s), dd = Number(t.dataset.d);
        if (act === 'stay-nights') { s.nights = Math.max(0, Math.min(90, s.nights + dd)); saveTrip(tr, 400); }
        else if (act === 'stay-move') { const j = k + dd; if (j >= 0 && j < tr.stays.length) { [tr.stays[k], tr.stays[j]] = [tr.stays[j], tr.stays[k]]; saveTrip(tr); } }
        else if (act === 'stay-del') { if (armed(t)) { tr.stays.splice(k, 1); state.openIdeas.delete(id); saveTrip(tr); } }
        else if (act === 'goto-stay') { if (s.lat != null) map.flyTo([s.lat, s.lng], 12); if (window.innerWidth <= 760) setSheet('collapsed'); }
        else { state.openIdeas.has(id) ? state.openIdeas.delete(id) : state.openIdeas.add(id); renderTripView(); }
        break;
      }
      case 'add-dom-flight': {
        const tr = activeTrip(); if (!tr) break;
        const d = tripDays(tr).days[idx]; if (!d) break;
        const leg = t.dataset.hop ? d.hop : d.from && d.stay ? transferInfo(d.from, d.stay).fly : null;
        if (!leg) break;
        tr.flights.push({ id: rid(), kind: 'domestic', from: leg.from, to: leg.to, date: d.date, dep: '', arr: '', flightNo: '', note: '' });
        saveTrip(tr); toast(T('✈️ {route} added to the budget', { route: `${leg.from}→${leg.to}` }));
        break;
      }
      case 'del-flight': {
        const tr = activeTrip(); if (!tr) break;
        tr.flights = tr.flights.filter((f) => f.id !== id); saveTrip(tr); break;
      }
      case 'add-idea-here':
        if (plan) { plan.stops.push({ id: rid(), time: '', note: '', place: id }); queueSave(plan, 0); onPlansChanged(); toast(T('{name} added ✓', { name: PLACE[id]?.name })); }
        break;
      case 'reply':
        if (!ensureMe()) break;
        state.openReplies.has(id) ? state.openReplies.delete(id) : state.openReplies.add(id);
        onNotesChanged();
        setTimeout(() => $(`[data-key="r-${CSS.escape(id)}"]`)?.focus(), 30);
        break;
      case 'del-note':
        if (!armed(t)) break;
        try { await deleteNote(id); toast(T('Deleted')); } catch (err) { toast(T('Could not delete: ') + err.message); }
        break;
      case 'goto-note': gotoNote(id); break;
      case 'open-join': openJoin(); break;
      case 'copy-invite': copy(inviteLink(), T('Invite link copied — send it to the family!')); break;
      case 'cancel-mode': setMode(null); map.closePopup(); break;
      case 'tpl-type': state.tplType = id; renderTemplates(); break;
      case 'preview-tpl': {
        const tpl = TEMPLATES.find((x) => x.id === id);
        state.preview = state.preview?.id === id ? null : tpl;
        renderRoute(); renderTemplates();
        if (state.preview) { fitStops(tpl.stops); if (window.innerWidth <= 760) setSheet('collapsed'); }
        break;
      }
      case 'use-tpl': {
        const tpl = TEMPLATES.find((x) => x.id === id);
        if (tripDayMode() && plan) {
          plan.stops.push(...tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time, note: s.note })));
          state.preview = null; queueSave(plan, 0); onPlansChanged(); fitStops(plan.stops);
          toast(T('“{tpl}” added to {name} ✓', { tpl: tpl.name, name: plan.name })); break;
        }
        const p = newPlan({ name: tpl.name, type: tpl.type, stops: tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time, note: s.note })) });
        fitStops(p.stops); toast(T('“{tpl}” added to your days ✓', { tpl: tpl.name }));
        $('#tab-plan').scrollTop = 0;
        break;
      }
      case 'goto-stop': {
        const s = plan?.stops[idx]; if (!s) break;
        if (s.place) selectPlace(s.place); else { const c = stopCoord(s); c && map.flyTo([c.lat, c.lng], 15); }
        break;
      }
      case 'stop-up': case 'stop-down': {
        if (!plan) break;
        const j = act === 'stop-up' ? idx - 1 : idx + 1;
        if (j < 0 || j >= plan.stops.length) break;
        [plan.stops[idx], plan.stops[j]] = [plan.stops[j], plan.stops[idx]];
        queueSave(plan, 0); onPlansChanged(); break;
      }
      case 'stop-del': if (plan) { plan.stops.splice(idx, 1); queueSave(plan, 0); onPlansChanged(); } break;
      case 'sort-time':
        if (plan) { plan.stops.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); queueSave(plan, 0); onPlansChanged(); }
        break;
      case 'fit-plan': if (plan) { fitStops(plan.stops); if (window.innerWidth <= 760) setSheet('collapsed'); } break;
      case 'custom-stop': setMode('stop'); if (window.innerWidth <= 760) setSheet('collapsed'); break;
      case 'share-plan': if (plan) share(planAsText(plan)); break;
      case 'new-meetup': if (!ensureMe()) break; setMode('meet'); if (window.innerWidth <= 760) setSheet('collapsed'); break;
      case 'meet-here': { const p = PLACE[id]; openMeetupComposer({ lat: p.lat, lng: p.lng }, { title: p.name, placeId: p.id }); break; }
      case 'meet-midpoint': meetMidpoint(); if (window.innerWidth <= 760) setSheet('collapsed'); break;
      case 'meet-status': {
        if (!ensureMe()) break;
        const m = state.meetups.find((x) => x.id === id);
        await setMeetStatus(id, m?.status[memberId]?.status === t.dataset.status ? null : t.dataset.status);
        break;
      }
      case 'del-meetup':
        if (!armed(t)) break;
        try { await req('DELETE', '/meetups/' + encodeURIComponent(id)); state.meetups = state.meetups.filter((m) => m.id !== id); map.closePopup(); renderMeetups(); renderLive(); }
        catch (err) { toast(T('Could not remove: ') + err.message); }
        break;
      case 'share-meetup': {
        const m = state.meetups.find((x) => x.id === id);
        if (m) share(`🚩 Meet: ${m.title}${m.at ? ' at ' + fmtTime(m.at) : ''}\nhttps://maps.google.com/?q=${m.lat},${m.lng}`);
        break;
      }
      case 'goto-member': {
        const l = state.locations[id]; if (!l) break;
        map.flyTo([l.lat, l.lng], Math.max(map.getZoom(), 16));
        if (window.innerWidth <= 760) setSheet('collapsed');
        break;
      }
      case 'goto-meetup': {
        const m = state.meetups.find((x) => x.id === id); if (!m) break;
        map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 16));
        map.once('moveend', () => meetupMarkers[id]?.openPopup());
        if (window.innerWidth <= 760) setSheet('collapsed');
        break;
      }
      case 'fit-family': fitFamily(); if (window.innerWidth <= 760) setSheet('collapsed'); break;
      case 'del-plan': if (plan && armed(t)) { await deletePlan(plan.id); toast(T('Day deleted')); } break;
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.matches('[data-compose]')) { e.preventDefault(); onCompose(f); }
    else if (f.matches('[data-meetup-form]')) { e.preventDefault(); createMeetup(f); }
    else if (f.matches('[data-staymap]')) {
      e.preventDefault();
      const tr = activeTrip();
      if (tr) addStay(tr, { dest: null, name: f.name.value.trim().slice(0, 80) || T('Stop'), lat: Number(f.dataset.lat), lng: Number(f.dataset.lng) });
      map.closePopup(); setMode(null); switchTab('plan'); if (window.innerWidth <= 760) setSheet('');
    }
    else if (f.matches('[data-customstop]')) {
      e.preventDefault();
      addStop(state.activePlanId || '__new', {
        name: f.name.value.trim().slice(0, 120), lat: Number(f.dataset.lat), lng: Number(f.dataset.lng), time: f.time.value,
      });
      map.closePopup(); setMode(null);
    }
  });

  // Enter to post (Shift+Enter for newline)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.compose textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
    if (e.key === 'Escape' && state.mode) { setMode(null); map.closePopup(); }
    if (e.key === 'Enter' && e.target.matches('.tl-day')) e.target.click();
  });

  // Plan field edits (debounced save, no re-render while typing)
  $('#planEditor').addEventListener('input', (e) => {
    const plan = activePlan(); if (!plan) return;
    const t = e.target;
    if (t.dataset.planField) plan[t.dataset.planField] = t.value;
    else if (t.dataset.stopField) { const s = plan.stops[Number(t.dataset.idx)]; if (s) s[t.dataset.stopField] = t.value; }
    else return;
    queueSave(plan);
    if (t.dataset.planField) renderPlanSelect();
    if (t.dataset.stopField === 'time') renderRoute();
  });
  $('#planSelect').addEventListener('change', (e) => { if (e.target.value) { setActivePlan(e.target.value); fitStops(activePlan()?.stops || []); } });
  $('#tripSelect').addEventListener('change', (e) => { if (e.target.value) setActiveTrip(e.target.value); });
  $('#newTripBtn').addEventListener('click', () => openTripDialog());
  $('#tab-plan').addEventListener('change', (e) => {
    const t = e.target, tr = activeTrip();
    if (!tr) return;
    if (t.matches('[data-stay-add]')) {
      const v = t.value; t.value = '';
      if (v === '__map') { setMode('stay'); if (window.innerWidth <= 760) setSheet('collapsed'); return; }
      const d = DEST[v]; if (d) addStay(tr, { dest: d.id, name: d.name, lat: d.lat, lng: d.lng });
    } else if (t.matches('[data-idea-place]') && t.value !== '') {
      const dp = ensureDayPlan(tr, Number(t.value));
      dp.stops.push({ id: rid(), time: '', note: '', place: t.dataset.ideaPlace });
      queueSave(dp, 0); onPlansChanged(); toast(`${PLACE[t.dataset.ideaPlace]?.name} → ${dp.name} ✓`);
    } else if (t.matches('[data-idea-tpl]') && t.value !== '') {
      const tpl = TEMPLATES.find((x) => x.id === t.dataset.ideaTpl);
      const dp = ensureDayPlan(tr, Number(t.value));
      dp.stops.push(...tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time, note: s.note })));
      queueSave(dp, 0); onPlansChanged(); toast(`“${tpl.name}” → ${dp.name} ✓`);
    }
  });
  $('#newPlanBtn').addEventListener('click', () => { newPlan(); toast(T('New day created — add places to it')); });

  let searchT;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { state.query = e.target.value.trim(); onFilterChanged(); }, 150);
  });
  $('#region').innerHTML = Object.entries(REGIONS).map(([k, r]) => `<option value="${k}" ${k === 'all' ? 'selected' : ''}>${r.label}</option>`).join('');
  $('#region').addEventListener('change', (e) => {
    state.region = e.target.value;
    const r = REGIONS[state.region];
    if (state.region === 'all') fitThailand(); else map.flyTo(r.center, r.zoom);
    onFilterChanged();
  });

  $('#dropNoteBtn').addEventListener('click', () => { if (!ensureMe()) return; setMode(state.mode === 'note' ? null : 'note'); });
  $('#fitThaiBtn').addEventListener('click', () => fitThailand());
  $('#familyBtn').addEventListener('click', fitFamily);
  $('#meetBtn').addEventListener('click', () => { if (!ensureMe()) return; setMode(state.mode === 'meet' ? null : 'meet'); });
  $('#locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast(T('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!TH_BOUNDS.pad(0.1).contains(ll)) return toast(T('You’re outside Thailand — see you there soon! ✈️'));
      if (meMarker) meMarker.remove();
      meMarker = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindTooltip(T('You are here'));
      map.flyTo(ll, 15);
    }, () => toast(T('Could not get your location (it needs https or localhost)')), { enableHighAccuracy: true, timeout: 10000 });
  });
  $('#familyBadge').addEventListener('click', openJoin);

  function armed(btn) {
    if (btn.dataset.armed) return true;
    const old = btn.textContent; btn.dataset.armed = '1'; btn.textContent = T('Tap again to confirm');
    setTimeout(() => { if (btn.isConnected) { btn.textContent = old; delete btn.dataset.armed; } }, 2500);
    return false;
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); toast(msg); } catch { toast(T('Copy failed — select the text manually')); }
      ta.remove();
    }
  }
  async function share(text) {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    copy(text, T('Copied — paste it in WhatsApp/Messenger'));
  }

  // ── live locations & meetup points ──────────────────────────
  const memberId = LS.get('memberId', null) || (() => { const id = 'm' + rid(); LS.set('memberId', id); return id; })();
  const memberLayer = L.layerGroup().addTo(map);
  const meetupLayer = L.layerGroup().addTo(map);
  const memberMarkers = {};
  const meetupMarkers = {};
  const STALE = 10 * 60e3;
  const STATUS = { coming: ['🚶', T('On my way')], late: ['⏰', T('Running late')], here: ['✅', T('I’m here')], cant: ['❌', T('Can’t make it')] };
  let watchId = null, lastSent = null, lastSentAt = 0, myPos = null;
  const autoArrived = new Set();

  const initial = (n) => (n || '?').trim()[0]?.toUpperCase() || '?';
  const fmtDist = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);
  const eta = (d) => (d <= 3 ? `🚶 ${Math.max(1, Math.round((d / 4.5) * 60))} min` : `🚕 ${Math.round((d / 25) * 60 + 5)} min`);
  const fmtTime = (at) => {
    const d = new Date(at), today = new Date().toDateString() === d.toDateString();
    const t = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    return today ? t : `${d.toLocaleDateString(LOCALE, { weekday: 'short' })} ${t}`;
  };
  const countdown = (at) => {
    const m = Math.round((at - Date.now()) / 60000);
    if (Math.abs(m) < 1) return T('now');
    const s = Math.abs(m) >= 60 ? `${Math.floor(Math.abs(m) / 60)} ${T('h')} ${Math.abs(m) % 60} min` : `${Math.abs(m)} min`;
    return m > 0 ? T('in {t}', { t: s }) : T('{t} ago', { t: s });
  };
  const activeMeetups = () => state.meetups
    .filter((m) => (m.at || m.createdAt) > Date.now() - 3 * 3600e3)
    .sort((a, b) => (a.at || a.createdAt) - (b.at || b.createdAt));
  const freshLocs = () => Object.values(state.locations).filter((l) => Date.now() - l.ts < 3 * 3600e3);

  // Sharing my position
  function startSharing() {
    if (!state.online) { toast(T('Live location needs the server connection')); return false; }
    if (!navigator.geolocation) { toast(T('Location is not available in this browser')); return false; }
    if (!window.isSecureContext) { toast(T('Location sharing needs https (or localhost) — see README')); return false; }
    stopWatch();
    watchId = navigator.geolocation.watchPosition(onPosition, (err) => {
      toast(err.code === 1 ? T('Location permission denied — allow it in browser settings') : T('Could not get your location yet…'));
      if (err.code === 1) setSharing(false);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    return true;
  }
  function stopWatch() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; }
  function setSharing(on) {
    if (on && !ensureMe()) on = false;
    if (on && !startSharing()) on = false;
    state.sharing = on; LS.set('sharing', on);
    if (!on) {
      stopWatch(); lastSent = null; myPos = null;
      if (state.locations[memberId]) { delete state.locations[memberId]; renderMembers(); }
      if (state.online) req('DELETE', '/locations/' + memberId).catch(() => {});
    } else toast(T('📡 Sharing your location with the family'));
    renderLive();
  }
  function sendPosition() {
    if (!myPos || !state.online) return;
    lastSent = myPos; lastSentAt = Date.now();
    req('PUT', '/locations/' + memberId, { ...myPos, name: state.me?.name, color: state.me?.color }).catch(() => {});
  }
  function onPosition(pos) {
    myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) };
    const moved = !lastSent || km(lastSent, myPos) * 1000 > 20;
    if ((moved && Date.now() - lastSentAt > 8000) || Date.now() - lastSentAt > 60000) sendPosition();
    // show myself immediately, without waiting for the server echo
    state.locations[memberId] = { memberId, name: state.me?.name, color: state.me?.color, ...myPos, ts: Date.now() };
    renderMembers(); refreshMeetupPopups(); checkArrival();
  }
  function checkArrival() {
    if (!myPos) return;
    activeMeetups().forEach((m) => {
      const st = m.status[memberId]?.status;
      if (st !== 'here' && st !== 'cant' && !autoArrived.has(m.id) && km(myPos, m) < 0.06) {
        autoArrived.add(m.id);
        setMeetStatus(m.id, 'here');
        toast(T('✅ You’ve arrived at “{name}”', { name: m.title }));
      }
    });
  }

  // Family members on the map
  function memberIcon(l) {
    const stale = Date.now() - l.ts > STALE;
    return L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
      html: `<div class="member-pin ${stale ? 'stale' : ''} ${l.memberId === memberId ? 'me' : ''}" style="--c:${esc(l.color)}">${esc(initial(l.name))}</div>` });
  }
  function renderMembers() {
    const locs = state.locations;
    Object.keys(memberMarkers).forEach((id) => {
      if (!locs[id]) { memberLayer.removeLayer(memberMarkers[id].m); memberLayer.removeLayer(memberMarkers[id].c); delete memberMarkers[id]; }
    });
    Object.values(locs).forEach((l) => {
      const tip = `<b>${l.memberId === memberId ? T('You') : esc(l.name)}</b> · ${Date.now() - l.ts > STALE ? T('last seen') + ' ' : ''}${ago(l.ts)}`;
      let mm = memberMarkers[l.memberId];
      if (!mm) {
        mm = {
          m: L.marker([l.lat, l.lng], { zIndexOffset: 2000 }).bindTooltip(tip, { direction: 'top', offset: [0, -20] }),
          c: L.circle([l.lat, l.lng], { radius: 0, weight: 1, fillOpacity: 0.08, interactive: false }),
        };
        mm.m.on('click', () => { switchTab('family'); if ($('#panel').classList.contains('collapsed')) setSheet(''); });
        memberLayer.addLayer(mm.c); memberLayer.addLayer(mm.m); memberMarkers[l.memberId] = mm;
      }
      mm.m.setLatLng([l.lat, l.lng]).setIcon(memberIcon(l)).setTooltipContent(tip);
      mm.c.setLatLng([l.lat, l.lng]).setRadius(Math.min(l.acc || 0, 300)).setStyle({ color: l.color, fillColor: l.color });
    });
  }

  // Meetup points
  function meetupIcon(m) {
    return L.divIcon({ className: '', iconSize: [40, 46], iconAnchor: [14, 44], popupAnchor: [6, -42],
      html: `<div class="meet-pin"><div class="flag">🚩</div><div class="lbl">${m.at ? fmtTime(m.at) + ' · ' : ''}${esc(m.title)}</div></div>` });
  }
  function meetSummary(m) {
    const c = {}; Object.values(m.status).forEach((s) => { c[s.status] = (c[s.status] || 0) + 1; });
    return Object.entries(STATUS).filter(([k]) => c[k]).map(([k, [i]]) => `${i} ${c[k]}`).join(' · ') || T('no replies yet');
  }
  function meetupHtml(m) {
    const mine = m.status[memberId]?.status;
    const people = new Map();
    Object.entries(m.status).forEach(([id, s]) => people.set(id, { name: s.name, color: s.color, status: s.status }));
    freshLocs().forEach((l) => { const p = people.get(l.memberId) || { name: l.name, color: l.color }; p.loc = l; people.set(l.memberId, p); });
    const rows = [...people.entries()].map(([id, p]) => {
      const d = p.loc ? km(p.loc, m) : null;
      const st = p.status ? STATUS[p.status] : null;
      return `<div class="meet-row">${avatar(p.name, p.color)}<div class="body"><b>${id === memberId ? T('You') : esc(p.name)}</b>
        <div class="muted">${st ? st[0] + ' ' + st[1] : T('No reply yet')}${d !== null && p.status !== 'here' ? ` · ${T('{d} away', { d: fmtDist(d) })}${d > 0.06 ? ' · ' + eta(d) : ''}` : ''}</div></div></div>`;
    }).join('') || `<p class="muted" style="font-size:13px">${T('Nobody has replied yet.')}</p>`;
    return `<div class="popup meetup">
      <h4>🚩 ${esc(m.title)}</h4>
      <p>${m.at ? `<b>${fmtTime(m.at)}</b> · ${countdown(m.at)}` : T('No time set')} · ${T('set by {who}', { who: esc(m.createdBy) })}</p>
      <div class="status-btns">${Object.entries(STATUS).map(([k, [i, l]]) =>
        `<button class="btn small ${mine === k ? 'primary' : ''}" data-act="meet-status" data-id="${esc(m.id)}" data-status="${k}">${i} ${l}</button>`).join('')}</div>
      <div class="meet-people">${rows}</div>
      <div class="detail-actions">
        <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking">🧭 ${T('Directions')}</a>
        <button class="btn small" data-act="share-meetup" data-id="${esc(m.id)}">📤 ${T('Share')}</button>
        <button class="btn small danger" data-act="del-meetup" data-id="${esc(m.id)}">🗑 ${T('Remove')}</button>
      </div>
    </div>`;
  }
  function renderMeetups() {
    const list = activeMeetups();
    const ids = new Set(list.map((m) => m.id));
    Object.keys(meetupMarkers).forEach((id) => { if (!ids.has(id)) { meetupLayer.removeLayer(meetupMarkers[id]); delete meetupMarkers[id]; } });
    list.forEach((m) => {
      let mk = meetupMarkers[m.id];
      if (!mk) {
        mk = L.marker([m.lat, m.lng], { zIndexOffset: 1500 }).bindPopup(() => meetupHtml(state.meetups.find((x) => x.id === m.id) || m), { minWidth: 260, maxWidth: 320 });
        meetupMarkers[m.id] = mk; meetupLayer.addLayer(mk);
      }
      mk.setIcon(meetupIcon(m));
    });
    refreshMeetupPopups();
  }
  function refreshMeetupPopups() {
    Object.entries(meetupMarkers).forEach(([id, mk]) => {
      if (!mk.isPopupOpen()) return;
      const m = state.meetups.find((x) => x.id === id);
      if (m) mk.getPopup().setContent(() => meetupHtml(state.meetups.find((x) => x.id === id) || m));
    });
  }
  function openMeetupComposer(latlng, { title = '', placeId = '' } = {}) {
    if (!ensureMe()) return;
    if (!state.online) { toast(T('Meetups need the server connection')); return; }
    const t = new Date(Date.now() + 30 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    L.popup({ minWidth: 250 }).setLatLng(latlng).setContent(
      `<form class="popup compose" data-meetup-form data-lat="${(+latlng.lat).toFixed(6)}" data-lng="${(+latlng.lng).toFixed(6)}" data-place="${esc(placeId)}">
        <h4>🚩 ${T('New meetup point')}</h4>
        <input name="title" maxlength="120" value="${esc(title)}" placeholder="${T('e.g. Meet at the pier, In front of 7-Eleven')}" />
        <div class="compose-row"><label style="font-size:13px;display:flex;gap:6px;align-items:center">⏰ <input name="time" type="time" value="${hhmm}" /></label>
          <button class="btn accent small" type="submit">${T('Set meetup')}</button></div>
        <p class="muted" style="font-size:12px;margin:0">${T('Everyone in the family gets notified.')}</p>
      </form>`,
    ).openOn(map);
    setTimeout(() => $('[data-meetup-form] input[name=title]')?.focus(), 50);
  }
  async function createMeetup(f) {
    let at = null;
    if (f.time.value) {
      const [h, mi] = f.time.value.split(':').map(Number);
      const d = new Date(); d.setHours(h, mi, 0, 0);
      if (d.getTime() < Date.now() - 60 * 60000) d.setDate(d.getDate() + 1); // earlier than an hour ago → tomorrow
      at = d.getTime();
    }
    const body = { title: f.title.value.trim() || T('Meet here'), lat: Number(f.dataset.lat), lng: Number(f.dataset.lng), at,
      placeId: f.dataset.place || null, createdBy: state.me.name, color: state.me.color };
    try {
      const m = await req('POST', '/meetups', body);
      upsertMeetup(m);
      map.closePopup(); setMode(null);
      setTimeout(() => meetupMarkers[m.id]?.openPopup(), 50);
      toast(T('🚩 Meetup set — the family has been notified'));
    } catch (e) { toast(T('Could not set meetup: ') + e.message); }
  }
  function upsertMeetup(m) {
    const i = state.meetups.findIndex((x) => x.id === m.id);
    if (i >= 0) state.meetups[i] = m; else state.meetups.push(m);
    renderMeetups(); renderLive(); checkArrival();
  }
  async function setMeetStatus(id, status) {
    try {
      const m = await req('PUT', `/meetups/${encodeURIComponent(id)}/status/${memberId}`, { status, name: state.me?.name, color: state.me?.color });
      upsertMeetup(m);
    } catch (e) { toast(T('Could not update: ') + e.message); }
  }
  function meetMidpoint() {
    const locs = freshLocs(); if (locs.length < 2) return toast(T('Need at least two people sharing their location'));
    const c = { lat: locs.reduce((s, l) => s + l.lat, 0) / locs.length, lng: locs.reduce((s, l) => s + l.lng, 0) / locs.length };
    // snap to the nearest known place if one is close, so the meetup is somewhere recognisable
    let best = null;
    PLACES.forEach((p) => { if (p.cat === 'airport') return; const d = km(c, p); if (d < 0.5 && (!best || d < best.d)) best = { p, d }; });
    const target = best ? { lat: best.p.lat, lng: best.p.lng } : c;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15));
    map.once('moveend', () => openMeetupComposer(target, best ? { title: best.p.name, placeId: best.p.id } : { title: T('Halfway point') }));
  }
  function fitFamily() {
    const pts = [...freshLocs(), ...activeMeetups()].map((x) => [x.lat, x.lng]);
    if (!pts.length) { toast(T('Nobody is sharing a location yet')); switchTab('family'); return; }
    if (pts.length === 1) map.flyTo(pts[0], 16); else map.flyToBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 16 });
  }

  function renderLive() {
    const el = $('#liveCard'); if (!el) return;
    if (!state.family || !state.me) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const locs = Object.values(state.locations).sort((a, b) => (b.memberId === memberId) - (a.memberId === memberId) || b.ts - a.ts);
    const meets = activeMeetups();
    el.innerHTML = `
      <div class="live-head"><h3>📡 ${T('Where is everyone?')}</h3>
        <label class="switch"><input type="checkbox" data-share-toggle ${state.sharing ? 'checked' : ''} ${state.online ? '' : 'disabled'} /><span class="track"></span> ${T('Share me')}</label></div>
      <p class="muted small">${state.sharing ? T('The family can see where you are while ThaiMap is open on this device.') : T('Turn on so the family can find you. Only shared while the app is open — never stored on disk.')}</p>
      ${locs.length ? `<div class="people">${locs.map((l) => {
        const d = myPos && l.memberId !== memberId ? km(myPos, l) : null;
        return `<div class="meet-row clickable" data-act="goto-member" data-id="${esc(l.memberId)}">${avatar(l.name, l.color)}
          <div class="body"><b>${l.memberId === memberId ? T('You') : esc(l.name)}</b>
          <div class="muted">${Date.now() - l.ts > STALE ? '⚠️ ' + T('last seen') + ' ' : '🟢 '}${ago(l.ts)}${d !== null ? ` · ${T('{d} from you', { d: fmtDist(d) })}` : ''}</div></div></div>`;
      }).join('')}</div>` : `<p class="muted small">${T('Nobody is sharing their location right now.')}</p>`}
      <div class="detail-actions">
        ${locs.length ? `<button class="btn small" data-act="fit-family">👀 ${T('Show everyone')}</button>` : ''}
        ${freshLocs().length > 1 ? `<button class="btn small" data-act="meet-midpoint">🎯 ${T('Meet in the middle')}</button>` : ''}
      </div>
      <h3 style="margin-top:14px">🚩 ${T('Meetup points')}</h3>
      ${meets.length ? meets.map((m) => `<div class="meet-row clickable" data-act="goto-meetup" data-id="${esc(m.id)}"><div class="flag-ico">🚩</div>
        <div class="body"><b>${esc(m.title)}</b><div class="muted">${m.at ? `${fmtTime(m.at)} · ${countdown(m.at)}` : T('no time set')} · ${meetSummary(m)}</div></div></div>`).join('')
        : `<p class="muted small">${T('If you split up, set a meetup point so everyone knows where to regroup.')}</p>`}
      <div class="detail-actions"><button class="btn small accent" data-act="new-meetup">🚩 ${T('Set a meetup point')}</button></div>`;
  }

  function applyLiveEvent(ev) {
    if (ev.type === 'loc:put') {
      if (ev.loc.memberId === memberId && !state.sharing) return; // stale echo after turning off
      state.locations[ev.loc.memberId] = ev.loc;
      renderMembers(); refreshMeetupPopups(); renderLiveSoon();
    } else if (ev.type === 'loc:delete') {
      delete state.locations[ev.memberId];
      renderMembers(); refreshMeetupPopups(); renderLiveSoon();
    } else if (ev.type === 'meetup:put') {
      const prev = state.meetups.find((x) => x.id === ev.meetup.id);
      const m = ev.meetup;
      if (!prev && m.createdBy !== state.me?.name) {
        toast(T('🚩 {who} set a meetup: {name}', { who: m.createdBy, name: m.title }) + (m.at ? ' ' + T('at') + ' ' + fmtTime(m.at) : ''));
        navigator.vibrate?.([120, 60, 120]);
      } else if (prev) {
        Object.entries(m.status).forEach(([id, s]) => {
          if (id !== memberId && s.status !== prev.status[id]?.status) toast(`${STATUS[s.status][0]} ${s.name}: ${STATUS[s.status][1]} — ${m.title}`);
        });
      }
      upsertMeetup(m);
    } else if (ev.type === 'meetup:delete') {
      state.meetups = state.meetups.filter((m) => m.id !== ev.id);
      renderMeetups(); renderLive();
    } else return false;
    return true;
  }
  let liveT = null;
  const renderLiveSoon = () => { if (!liveT) liveT = setTimeout(() => { liveT = null; if (state.tab === 'family') renderLive(); }, 500); };

  document.addEventListener('change', (e) => { if (e.target.matches('[data-share-toggle]')) setSharing(e.target.checked); });

  // Keep "x min ago", countdowns and stale markers fresh; heartbeat my position
  setInterval(() => {
    if (state.sharing && myPos && Date.now() - lastSentAt > 60000) sendPosition();
    renderMembers(); renderMeetups(); if (state.tab === 'family') renderLive();
  }, 30000);

  // ── render orchestration ────────────────────────────────────
  function onFilterChanged() { renderChips(); renderList(); renderMarkers(); renderHud(); }
  function onNotesChanged() { refreshAllIcons(); renderNotes(); renderList(); renderDetail(); renderFamily(); }
  function onPlansChanged() {
    if (state.view === 'day' && !tripDayMode()) state.view = 'trip';
    renderTripBar(); renderTripView(); renderDayHead();
    renderPlanSelect(); renderPlanEditor(); renderRoute(); renderTemplates(); renderDetail(); renderFamily(); renderHud();
  }
  function renderAll() {
    renderBadge(); onFilterChanged(); onNotesChanged(); onPlansChanged(); setConnBanner();
    renderMembers(); renderMeetups(); renderLive(); renderHud();
  }

  // Re-render "x min ago" labels now and then
  setInterval(() => { if (!document.activeElement?.closest?.('.compose')) { renderFeed(); } }, 60000);

  // ── map HUD: big title + floating stat cards ────────────────
  const stat = (label, value, sub = '', c = '') =>
    `<div class="stat glass"${c ? ` style="--c:${c}"` : ''}><div class="stat-label"><i></i>${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  function renderHud() {
    const trip = activeTrip();
    let kicker, title, cards = [];
    if (trip) {
      const { days, diff } = tripDays(trip);
      const planned = days.filter((d) => dayPlanFor(trip, d.date)?.stops.length).length;
      const out = flightOf(trip, 'out');
      const fare = out ? intlFare(trip.home, out.to, out.date) : null;
      kicker = `${T('Trip')} · ${fmtDay(trip.start, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(trip.start, trip.days - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`;
      title = trip.name;
      cards = [
        stat(T('Days'), `${trip.days}<small>${T('{n} planned', { n: planned })}</small>`, '', '#2dd4bf'),
        stat(T('Stops'), `${trip.stays.length}<small>${T('{n} nights', { n: trip.stays.reduce((t, s) => t + s.nights, 0) })}</small>`, diff ? `⚠️ ${T(diff > 0 ? '{n} nights not planned yet' : '{n} nights too many', { n: Math.abs(diff) })}` : '', '#fb923c'),
        fare ? stat(T('Flights'), `${nf(fare.lo * trip.travellers / 1000)}–${nf(fare.hi * trip.travellers / 1000)}<small>k SEK</small>`, `${trip.travellers} × ${fare.season}`, '#a78bfa') : '',
      ];
    } else {
      const r = REGIONS[state.region];
      kicker = T('Explore');
      title = state.region === 'all' ? 'Thailand' : r.label;
      const live = Object.values(state.locations).filter((l) => Date.now() - l.ts < STALE).length;
      cards = [
        stat(T('Places'), PLACES.filter(matches).length, '', '#2dd4bf'),
        state.family ? stat(T('Family online'), live, '', '#a78bfa') : '',
        state.family ? stat(T('Meetups'), activeMeetups().length, '', '#fb923c') : '',
      ];
    }
    $('#hudKicker').textContent = kicker;
    $('#hudTitle').textContent = title;
    $('#hudStats').innerHTML = cards.join('');
  }
  const setPanel = (on, shift = true) => {
    const before = viewPad();
    $('#app').classList.toggle('panel-off', !on); LS.set('panelOff', !on);
    if (!shift) return;
    const after = () => { const P = viewPad(); map.panBy([((P.r - P.l) - (before.r - before.l)) / 2, ((P.b - P.t) - (before.b - before.t)) / 2]); };
    if (on) setTimeout(after, 320); else after();
  };
  $('#panelHide').addEventListener('click', () => setPanel(false));
  $('#panelShow').addEventListener('click', () => setPanel(true));
  if (LS.get('panelOff', false)) setPanel(false, false);

  // ── static texts & language switch ──────────────────────────
  $$('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = T(el.dataset.i18nHtml); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = T(el.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach((el) => { el.title = T(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
  document.title = T('ThaiMap — Family Trip Planner');
  $('#langBtn').textContent = LANG === 'sv' ? '🇬🇧 EN' : '🇸🇪 SV';
  $('#langBtn').title = LANG === 'sv' ? 'Switch to English' : 'Byt till svenska';
  $('#langBtn').addEventListener('click', () => { LS.set('lang', LANG === 'sv' ? 'en' : 'sv'); location.reload(); });

  // ── boot ────────────────────────────────────────────────────
  fitThailand(false);
  const urlFamily = new URLSearchParams(location.search).get('family');
  if (urlFamily && urlFamily.toLowerCase() !== state.family) openJoin();
  else if (!state.me) setTimeout(openJoin, 400);
  connect();
})();
