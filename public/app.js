/* ThaiMap — map-first family trip planner for Thailand */
(() => {
  'use strict';

  // ── utilities ───────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const COLORS = ['#0f766e', '#ea580c', '#7c3aed', '#db2777', '#2563eb', '#ca8a04', '#16a34a', '#475569'];
  const KINDS = { note: ['📝', 'Note'], idea: ['💡', 'Idea'], warning: ['⚠️', 'Heads-up'], love: ['❤️', 'Must do!'] };
  const TPL_TYPES = { all: 'All', city: '🏙️ City days', islands: '🚤 Island hopping', hiking: '🥾 Hiking' };
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
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString();
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
    sharing: LS.get('sharing', false),
  };
  const dirty = new Set(); const lastRev = {}; const saveTimers = {};
  let es = null;

  // ── data layer (server, or local-only fallback) ─────────────
  const localKey = () => 'local:' + (state.family || 'solo');
  const persistLocal = () => LS.set(localKey(), { notes: state.notes, plans: state.plans });
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
        state.notes = data.notes; state.plans = data.plans; state.online = true;
        loadLive(data);
        openStream();
      } catch { /* fall back to local */ }
    }
    if (!state.online) {
      const local = LS.get(localKey(), { notes: [], plans: [] });
      state.notes = local.notes; state.plans = local.plans;
      state.meetups = []; state.locations = {};
    }
    if (!state.plans.find((p) => p.id === state.activePlanId)) state.activePlanId = state.plans[0]?.id || null;
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
      try { const d = await req('GET'); state.notes = d.notes; mergePlans(d.plans); loadLive(d); renderAll(); if (myPos) sendPosition(); } catch { /* retry later */ }
    };
    es.onerror = () => setConnBanner('Reconnecting to family…');
    es.onmessage = (e) => { try { applyEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
  }

  function mergePlans(serverPlans) {
    const keep = state.plans.filter((p) => dirty.has(p.id));
    state.plans = serverPlans.filter((p) => !dirty.has(p.id)).concat(keep);
  }

  function setConnBanner(msg) {
    const b = $('#connBanner');
    if (!msg && state.family && !state.online) msg = location.hostname.endsWith('github.io')
      ? 'ℹ️ Web-only version: notes & plans are saved on this device (family sync needs the server)'
      : location.protocol.startsWith('http')
      ? '⚠️ Can’t reach the server — changes are saved on this device only'
      : '⚠️ Opened as a file — run “npm start” to share with family';
    b.textContent = msg || ''; b.classList.toggle('hidden', !msg);
  }

  function applyEvent(ev) {
    if (applyLiveEvent(ev)) return;
    if (ev.type === 'note:add') {
      if (state.notes.some((n) => n.id === ev.note.id)) return;
      state.notes.push(ev.note);
      if (ev.note.author !== state.me?.name) {
        const where = ev.note.placeId ? PLACE[ev.note.placeId]?.name : 'the map';
        toast(`💬 ${ev.note.author} commented on ${where || 'the map'}`);
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

  function queueSave(plan, delay = 600) {
    dirty.add(plan.id);
    clearTimeout(saveTimers[plan.id]);
    saveTimers[plan.id] = setTimeout(() => savePlan(plan.id), delay);
  }
  async function savePlan(id) {
    const plan = state.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.rev = rid(); lastRev[id] = plan.rev; plan.updatedBy = state.me?.name || '';
    dirty.delete(id);
    if (!state.online) return persistLocal();
    try { await req('PUT', '/plans/' + id, plan); } catch (e) { toast('Could not save plan: ' + e.message); }
  }
  async function deletePlan(id) {
    clearTimeout(saveTimers[id]); dirty.delete(id);
    state.plans = state.plans.filter((p) => p.id !== id);
    if (state.activePlanId === id) state.activePlanId = state.plans[0]?.id || null;
    if (!state.online) persistLocal();
    else try { await req('DELETE', '/plans/' + id); } catch (e) { toast('Could not delete: ' + e.message); }
    onPlansChanged();
  }

  // ── map ─────────────────────────────────────────────────────
  const TH_BOUNDS = L.latLngBounds([5.5, 97.3], [20.5, 105.7]);
  const map = L.map('map', {
    zoomControl: false, minZoom: 5, maxBounds: TH_BOUNDS.pad(0.25), maxBoundsViscosity: 1, worldCopyJump: false,
  }).fitBounds(TH_BOUNDS);
  L.control.zoom({ position: 'topright' }).addTo(map);
  const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 19,
  }).addTo(map);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
  });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; OpenStreetMap, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)', subdomains: 'abc', maxZoom: 17,
  });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagery &copy; Esri', maxZoom: 19,
  });
  L.control.layers({ '🗺️ Map (English)': street, '🛰️ Satellite': sat, '⛰️ Terrain (hiking)': topo, '🇹🇭 OpenStreetMap (Thai names)': osm }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  // Grey out neighbouring countries so Thailand stands out (sea stays clear for island hopping)
  map.createPane('mask');
  map.getPane('mask').style.zIndex = 350;
  map.getPane('mask').style.pointerEvents = 'none';
  if (window.NEIGHBORS) {
    L.geoJSON(window.NEIGHBORS, {
      pane: 'mask', interactive: false,
      style: { stroke: true, color: '#9ca3af', weight: 0.5, fillColor: '#64748b', fillOpacity: 0.55 },
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
    if (s.lat !== null && s.lat !== undefined) return { lat: s.lat, lng: s.lng, name: s.name || 'Custom stop' };
    return null;
  };
  const activePlan = () => state.plans.find((p) => p.id === state.activePlanId) || null;

  function renderRoute() {
    planLayer.clearLayers();
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

  function composeHtml({ placeId = '', parentId = '', lat = '', lng = '', key, placeholder = 'Write something for the family…' }) {
    return `<form class="compose" data-compose data-place="${esc(placeId)}" data-parent="${esc(parentId)}" data-lat="${lat}" data-lng="${lng}" data-form-key="${esc(key)}">
      <textarea name="text" data-key="${esc(key)}" required maxlength="2000" rows="2" placeholder="${esc(placeholder)}"></textarea>
      <div class="compose-row">
        ${parentId ? '' : `<select name="kind" data-key="k-${esc(key)}">${Object.entries(KINDS).map(([k, [i, l]]) => `<option value="${k}">${i} ${l}</option>`).join('')}</select>`}
        <button class="btn primary small" type="submit">${parentId ? 'Reply' : 'Post'}</button>
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
          ${withReplies ? `<button class="icon-btn" data-act="reply" data-id="${esc(n.id)}">↩ Reply</button>` : ''}
          ${mine ? `<button class="icon-btn" data-act="del-note" data-id="${esc(n.id)}">🗑 Delete</button>` : ''}
        </div>
        ${replies.length ? `<div class="replies">${replies.map((r) => commentHtml(r, false)).join('')}</div>` : ''}
        ${withReplies && state.openReplies.has(n.id) ? composeHtml({ parentId: n.id, placeId: n.placeId || '', key: 'r-' + n.id, placeholder: 'Reply…' }) : ''}
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
    } catch (e) { toast('Could not post: ' + e.message); }
    finally { btn.disabled = false; }
  }

  // ── panel: explore ──────────────────────────────────────────
  function renderChips() {
    const counts = {};
    PLACES.forEach((p) => { if (state.region === 'all' || p.region === state.region) counts[p.cat] = (counts[p.cat] || 0) + 1; });
    const all = state.cats.size === Object.keys(CATEGORIES).length;
    $('#chips').innerHTML = `<button class="chip ${all ? 'on' : ''}" data-act="cat-all" style="--c:var(--ink)">All</button>` +
      Object.entries(CATEGORIES).map(([k, c]) =>
        `<button class="chip ${!all && state.cats.has(k) ? 'on' : ''}" data-act="cat" data-id="${k}" style="--c:${c.color}">${c.icon} ${c.label} <span class="n">${counts[k] || 0}</span></button>`).join('');
  }

  function renderList() {
    const list = PLACES.filter(matches);
    if (!list.length) { $('#placeList').innerHTML = '<div class="empty">Nothing matches. Try another search or category.</div>'; return; }
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
    const planOpts = state.plans.map((pl) => `<option value="${esc(pl.id)}" ${pl.id === state.activePlanId ? 'selected' : ''}>${esc(pl.name)}</option>`).join('');
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
          ${p.iata ? `<span>IATA ${esc(p.iata)}${p.intl ? ' · International' : ' · Domestic'}</span>` : ''}
        </div>
        ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
        ${p.tip ? `<p class="tip"><b>Tip:</b> ${esc(p.tip)}</p>` : ''}
        <div class="detail-actions">
          <select data-plan-target>${planOpts}<option value="__new">＋ New day…</option></select>
          <button class="btn accent small" data-act="add-to-plan" data-id="${p.id}">Add to day</button>
        </div>
        <div class="detail-actions">
          <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 Directions</a>
          <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' Thailand')}">⭐ Reviews & photos</a>
          <button class="btn small" data-act="zoom" data-id="${p.id}">🔍 Zoom in</button>
          ${p.cat !== 'airport' ? `<button class="btn small" data-act="meet-here" data-id="${p.id}">🚩 Meet here</button>` : ''}
        </div>
        <div class="thread">
          <h5>💬 Family comments ${roots.length ? `(${commentCount(p.id)})` : ''}</h5>
          ${roots.length ? threadHtml(roots) : '<p class="muted" style="font-size:13px">No comments yet — be the first!</p>'}
          ${composeHtml({ placeId: p.id, key: 'place-' + p.id, placeholder: `What do you think about ${p.name}?` })}
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
    s.innerHTML = state.plans.length
      ? sortedPlans().map((p) => `<option value="${esc(p.id)}" ${p.id === state.activePlanId ? 'selected' : ''}>${p.date ? esc(p.date) + ' · ' : ''}${esc(p.name)} (${p.stops.length})</option>`).join('')
      : '<option value="">No days planned yet</option>';
  }

  function legText(a, b) {
    const ca = stopCoord(a), cb = stopCoord(b);
    if (!ca || !cb) return '';
    const d = km(ca, cb);
    if (d < 1.3) return `🚶 ~${Math.max(2, Math.round(d * 14))} min walk · ${(d * 1000).toFixed(0)} m`;
    const island = (s) => s.place && ['island', 'beach'].includes(PLACE[s.place]?.cat);
    if (island(a) && island(b)) return `🚤 ~${d.toFixed(1)} km by boat`;
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
      el.innerHTML = `<div class="plan-card empty">Create a day, pick a ready-made one below,<br/>or tap <b>Add to day</b> on any place.</div>`;
      return;
    }
    const stops = plan.stops;
    preserve(el, () => {
      el.innerHTML = `<div class="plan-card">
        <div class="plan-head">
          <input type="text" data-plan-field="name" data-key="pf-name" value="${esc(plan.name)}" maxlength="120" aria-label="Day name" />
          <input type="date" data-plan-field="date" data-key="pf-date" value="${esc(plan.date || '')}" aria-label="Date" />
        </div>
        <div class="plan-stats"><span>📍 ${stops.length} stops</span><span>📏 ~${totalKm(stops).toFixed(1)} km</span>
          ${plan.updatedBy ? `<span>✏️ ${esc(plan.updatedBy)}</span>` : ''}</div>
        ${stops.length ? `<ol class="stops">${stops.map((s, i) => {
          const c = stopCoord(s);
          return `${i ? `<li class="leg">${legText(stops[i - 1], s)}</li>` : ''}
          <li class="stop">
            <div class="num">${i + 1}</div>
            <div>
              <div class="name" data-act="goto-stop" data-idx="${i}">${esc(c?.name || 'Stop')}</div>
              <div class="row2">
                <input type="time" data-stop-field="time" data-idx="${i}" data-key="st-time-${esc(s.id)}" value="${esc(s.time || '')}" />
                <input type="text" data-stop-field="note" data-idx="${i}" data-key="st-note-${esc(s.id)}" value="${esc(s.note || '')}" placeholder="Note…" maxlength="500" />
              </div>
            </div>
            <div class="ctrl">
              <button class="icon-btn" data-act="stop-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
              <button class="icon-btn" data-act="stop-down" data-idx="${i}" ${i === stops.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
              <button class="icon-btn" data-act="stop-del" data-idx="${i}" aria-label="Remove">✕</button>
            </div>
          </li>`;
        }).join('')}</ol>` : '<p class="muted" style="font-size:13px">No stops yet. Open a place and tap <b>Add to day</b>, or add a custom stop on the map.</p>'}
        <div class="plan-foot">
          <button class="btn small" data-act="fit-plan">🗺️ Show on map</button>
          <button class="btn small" data-act="custom-stop">📌 Custom stop</button>
          <button class="btn small" data-act="sort-time">🕘 Sort by time</button>
          <button class="btn small" data-act="share-plan">📤 Share as text</button>
          <button class="btn small danger" data-act="del-plan">🗑 Delete day</button>
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
        <p>📍 ${t.stops.length} stops · ~${totalKm(t.stops).toFixed(0)} km</p>
        <div class="tpl-acts">
          <button class="btn small" data-act="preview-tpl" data-id="${t.id}">${state.preview?.id === t.id ? '✕ Hide preview' : '👀 Preview'}</button>
          <button class="btn small primary" data-act="use-tpl" data-id="${t.id}">＋ Use as a day</button>
        </div>
      </div>`).join('');
  }

  function newPlan(fields = {}) {
    const plan = { id: rid(), name: `Day ${state.plans.length + 1}`, date: '', type: '', stops: [], ...fields };
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
    toast(`Added to “${plan.name}” ✓`);
  }
  function planAsText(plan) {
    const lines = [`🇹🇭 ${plan.name}${plan.date ? ' — ' + plan.date : ''}`];
    plan.stops.forEach((s, i) => {
      const c = stopCoord(s);
      lines.push(`${i + 1}. ${s.time ? s.time + ' ' : ''}${c?.name || 'Stop'}${s.note ? ' — ' + s.note : ''}`);
      if (c) lines.push(`   https://maps.google.com/?q=${c.lat},${c.lng}`);
    });
    return lines.join('\n');
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
      card.innerHTML = `<h3>Plan together 👨‍👩‍👧‍👦</h3>
        <p class="muted" style="font-size:14px">Join a family with a shared code to comment on places, drop notes on the map and build day plans together — live.</p>
        <button class="btn primary" data-act="open-join">Join or create a family</button>`;
    } else {
      const local = /^(localhost|127\.)/.test(location.hostname);
      card.innerHTML = `<h3>${esc(state.family)}</h3>
        <p style="font-size:14px;margin:0">You are <b style="color:${esc(state.me.color)}">${esc(state.me.name)}</b>
          · ${state.online ? '<span style="color:var(--teal)">● live</span>' : '<span style="color:var(--saffron)">● this device only</span>'}</p>
        <div class="members">${members().map(([n, c]) => `<span class="member">${avatar(n, c)}${esc(n)}</span>`).join('')}</div>
        <div class="invite"><input readonly id="inviteInput" value="${esc(inviteLink())}" /><button class="btn small" data-act="copy-invite">Copy invite</button></div>
        ${local ? '<p class="muted" style="font-size:12px;margin:8px 0 0">This is a localhost link — family on the same Wi-Fi should use the network address shown in the terminal, or deploy the server (see README).</p>' : ''}
        <div style="margin-top:10px"><button class="btn small ghost" data-act="open-join">Change name / family</button></div>`;
    }
    renderFeed();
    renderLive();
  }

  function renderFeed() {
    const items = [...state.notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
    $('#feed').innerHTML = items.length ? items.map((n) => {
      const root = n.parentId ? state.notes.find((x) => x.id === n.parentId) : null;
      const where = n.placeId ? `📍 ${PLACE[n.placeId]?.name || 'a place'}` : root ? `↩ reply to ${root.author}` : '📌 Note on the map';
      return `<div class="comment kind-${esc(n.kind)}" data-act="goto-note" data-id="${esc(n.id)}">
        ${avatar(n.author, n.color)}
        <div class="body"><div class="who">${esc(n.author)}<time>${ago(n.createdAt)}</time></div>
        <div class="where">${esc(where)}</div><div class="txt">${esc(n.text)}</div></div></div>`;
    }).join('') : '<div class="empty">No comments yet.<br/>Tap 📍 Note on the map, or comment on any place.</div>';
    updateUnread();
  }
  function updateUnread() {
    const unread = state.notes.some((n) => n.createdAt > state.lastSeen && n.author !== state.me?.name);
    $('#unreadDot').classList.toggle('hidden', !unread || state.tab === 'family');
  }
  function renderBadge() {
    $('#familyBadge').innerHTML = state.family && state.me
      ? `${esc(state.me.name)} · family <b>${esc(state.family)}</b> ${state.online ? '🟢' : '🟠'}`
      : 'Tap to join your family →';
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
    $('#colorRow').innerHTML = COLORS.map((c) => `<button type="button" data-color="${c}" class="${c === pickedColor ? 'on' : ''}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('');
    $('#joinDialog').showModal();
  }
  function ensureMe() {
    if (state.me) return true;
    toast('Tell us who you are first 🙂'); openJoin(); return false;
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
    toast(`Welcome, ${name}! 🙏`);
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
    b.innerHTML = (mode === 'note' ? '📍 Tap anywhere on the map to drop a family note' : mode === 'meet' ? '🚩 Tap the map where everyone should meet' : `📌 Tap the map to add a custom stop to “${esc(activePlan()?.name || 'a new day')}”`) +
      ' <button data-act="cancel-mode">Cancel</button>';
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
        `<div class="popup"><h4>📍 New family note</h4>${composeHtml({ lat: lat.toFixed(6), lng: lng.toFixed(6), key: 'new-note', placeholder: 'e.g. “Great ice cream here!” or “Meet here at 6 pm”' })}</div>`,
      ).openOn(map);
      setTimeout(() => $('[data-key="new-note"]')?.focus(), 50);
    } else if (state.mode === 'meet') {
      openMeetupComposer(e.latlng);
    } else if (state.mode === 'stop') {
      L.popup({ minWidth: 230 }).setLatLng(e.latlng).setContent(
        `<form class="popup compose" data-customstop data-lat="${lat.toFixed(6)}" data-lng="${lng.toFixed(6)}">
          <h4>📌 Custom stop</h4>
          <input name="name" required maxlength="120" placeholder="Name, e.g. Our hotel" />
          <div class="compose-row"><input name="time" type="time" /><button class="btn primary small" type="submit">Add</button></div>
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
        addStop(target, { place: id });
        break;
      }
      case 'reply':
        if (!ensureMe()) break;
        state.openReplies.has(id) ? state.openReplies.delete(id) : state.openReplies.add(id);
        onNotesChanged();
        setTimeout(() => $(`[data-key="r-${CSS.escape(id)}"]`)?.focus(), 30);
        break;
      case 'del-note':
        if (!armed(t)) break;
        try { await deleteNote(id); toast('Deleted'); } catch (err) { toast('Could not delete: ' + err.message); }
        break;
      case 'goto-note': gotoNote(id); break;
      case 'open-join': openJoin(); break;
      case 'copy-invite': copy(inviteLink(), 'Invite link copied — send it to the family!'); break;
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
        const p = newPlan({ name: tpl.name, type: tpl.type, stops: tpl.stops.map((s) => ({ id: rid(), place: s.place, time: s.time, note: s.note })) });
        fitStops(p.stops); toast(`“${tpl.name}” added to your days ✓`);
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
        catch (err) { toast('Could not remove: ' + err.message); }
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
      case 'del-plan': if (plan && armed(t)) { await deletePlan(plan.id); toast('Day deleted'); } break;
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.matches('[data-compose]')) { e.preventDefault(); onCompose(f); }
    else if (f.matches('[data-meetup-form]')) { e.preventDefault(); createMeetup(f); }
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
  $('#newPlanBtn').addEventListener('click', () => { newPlan(); toast('New day created — add places to it'); });

  let searchT;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { state.query = e.target.value.trim(); onFilterChanged(); }, 150);
  });
  $('#region').innerHTML = Object.entries(REGIONS).map(([k, r]) => `<option value="${k}" ${k === 'all' ? 'selected' : ''}>${r.label}</option>`).join('');
  $('#region').addEventListener('change', (e) => {
    state.region = e.target.value;
    const r = REGIONS[state.region];
    if (state.region === 'all') map.flyToBounds(TH_BOUNDS); else map.flyTo(r.center, r.zoom);
    onFilterChanged();
  });

  $('#dropNoteBtn').addEventListener('click', () => { if (!ensureMe()) return; setMode(state.mode === 'note' ? null : 'note'); });
  $('#fitThaiBtn').addEventListener('click', () => map.flyToBounds(TH_BOUNDS));
  $('#familyBtn').addEventListener('click', fitFamily);
  $('#meetBtn').addEventListener('click', () => { if (!ensureMe()) return; setMode(state.mode === 'meet' ? null : 'meet'); });
  $('#locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location not available in this browser');
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!TH_BOUNDS.pad(0.1).contains(ll)) return toast('You’re outside Thailand — see you there soon! ✈️');
      if (meMarker) meMarker.remove();
      meMarker = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindTooltip('You are here');
      map.flyTo(ll, 15);
    }, () => toast('Could not get your location (it needs https or localhost)'), { enableHighAccuracy: true, timeout: 10000 });
  });
  $('#familyBadge').addEventListener('click', openJoin);

  function armed(btn) {
    if (btn.dataset.armed) return true;
    const old = btn.textContent; btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm';
    setTimeout(() => { if (btn.isConnected) { btn.textContent = old; delete btn.dataset.armed; } }, 2500);
    return false;
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); toast(msg); } catch { toast('Copy failed — select the text manually'); }
      ta.remove();
    }
  }
  async function share(text) {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    copy(text, 'Day plan copied — paste it in WhatsApp/Messenger');
  }

  // ── live locations & meetup points ──────────────────────────
  const memberId = LS.get('memberId', null) || (() => { const id = 'm' + rid(); LS.set('memberId', id); return id; })();
  const memberLayer = L.layerGroup().addTo(map);
  const meetupLayer = L.layerGroup().addTo(map);
  const memberMarkers = {};
  const meetupMarkers = {};
  const STALE = 10 * 60e3;
  const STATUS = { coming: ['🚶', 'On my way'], late: ['⏰', 'Running late'], here: ['✅', 'I’m here'], cant: ['❌', 'Can’t make it'] };
  let watchId = null, lastSent = null, lastSentAt = 0, myPos = null;
  const autoArrived = new Set();

  const initial = (n) => (n || '?').trim()[0]?.toUpperCase() || '?';
  const fmtDist = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);
  const eta = (d) => (d <= 3 ? `🚶 ${Math.max(1, Math.round((d / 4.5) * 60))} min` : `🚕 ${Math.round((d / 25) * 60 + 5)} min`);
  const fmtTime = (at) => {
    const d = new Date(at), today = new Date().toDateString() === d.toDateString();
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return today ? t : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
  };
  const countdown = (at) => {
    const m = Math.round((at - Date.now()) / 60000);
    if (Math.abs(m) < 1) return 'now';
    const s = Math.abs(m) >= 60 ? `${Math.floor(Math.abs(m) / 60)} h ${Math.abs(m) % 60} min` : `${Math.abs(m)} min`;
    return m > 0 ? `in ${s}` : `${s} ago`;
  };
  const activeMeetups = () => state.meetups
    .filter((m) => (m.at || m.createdAt) > Date.now() - 3 * 3600e3)
    .sort((a, b) => (a.at || a.createdAt) - (b.at || b.createdAt));
  const freshLocs = () => Object.values(state.locations).filter((l) => Date.now() - l.ts < 3 * 3600e3);

  // Sharing my position
  function startSharing() {
    if (!state.online) { toast('Live location needs the server connection'); return false; }
    if (!navigator.geolocation) { toast('Location is not available in this browser'); return false; }
    if (!window.isSecureContext) { toast('Location sharing needs https (or localhost) — see README'); return false; }
    stopWatch();
    watchId = navigator.geolocation.watchPosition(onPosition, (err) => {
      toast(err.code === 1 ? 'Location permission denied — allow it in browser settings' : 'Could not get your location yet…');
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
    } else toast('📡 Sharing your location with the family');
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
        toast(`✅ You’ve arrived at “${m.title}”`);
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
      const tip = `<b>${l.memberId === memberId ? 'You' : esc(l.name)}</b> · ${Date.now() - l.ts > STALE ? 'last seen ' : ''}${ago(l.ts)}`;
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
    return Object.entries(STATUS).filter(([k]) => c[k]).map(([k, [i]]) => `${i} ${c[k]}`).join(' · ') || 'no replies yet';
  }
  function meetupHtml(m) {
    const mine = m.status[memberId]?.status;
    const people = new Map();
    Object.entries(m.status).forEach(([id, s]) => people.set(id, { name: s.name, color: s.color, status: s.status }));
    freshLocs().forEach((l) => { const p = people.get(l.memberId) || { name: l.name, color: l.color }; p.loc = l; people.set(l.memberId, p); });
    const rows = [...people.entries()].map(([id, p]) => {
      const d = p.loc ? km(p.loc, m) : null;
      const st = p.status ? STATUS[p.status] : null;
      return `<div class="meet-row">${avatar(p.name, p.color)}<div class="body"><b>${id === memberId ? 'You' : esc(p.name)}</b>
        <div class="muted">${st ? st[0] + ' ' + st[1] : 'No reply yet'}${d !== null && p.status !== 'here' ? ` · ${fmtDist(d)} away${d > 0.06 ? ' · ' + eta(d) : ''}` : ''}</div></div></div>`;
    }).join('') || '<p class="muted" style="font-size:13px">Nobody has replied yet.</p>';
    return `<div class="popup meetup">
      <h4>🚩 ${esc(m.title)}</h4>
      <p>${m.at ? `<b>${fmtTime(m.at)}</b> · ${countdown(m.at)}` : 'No time set'} · set by ${esc(m.createdBy)}</p>
      <div class="status-btns">${Object.entries(STATUS).map(([k, [i, l]]) =>
        `<button class="btn small ${mine === k ? 'primary' : ''}" data-act="meet-status" data-id="${esc(m.id)}" data-status="${k}">${i} ${l}</button>`).join('')}</div>
      <div class="meet-people">${rows}</div>
      <div class="detail-actions">
        <a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking">🧭 Directions</a>
        <button class="btn small" data-act="share-meetup" data-id="${esc(m.id)}">📤 Share</button>
        <button class="btn small danger" data-act="del-meetup" data-id="${esc(m.id)}">🗑 Remove</button>
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
    if (!state.online) { toast('Meetups need the server connection'); return; }
    const t = new Date(Date.now() + 30 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    L.popup({ minWidth: 250 }).setLatLng(latlng).setContent(
      `<form class="popup compose" data-meetup-form data-lat="${(+latlng.lat).toFixed(6)}" data-lng="${(+latlng.lng).toFixed(6)}" data-place="${esc(placeId)}">
        <h4>🚩 New meetup point</h4>
        <input name="title" maxlength="120" value="${esc(title)}" placeholder="e.g. Meet at the pier, In front of 7-Eleven" />
        <div class="compose-row"><label style="font-size:13px;display:flex;gap:6px;align-items:center">⏰ <input name="time" type="time" value="${hhmm}" /></label>
          <button class="btn accent small" type="submit">Set meetup</button></div>
        <p class="muted" style="font-size:12px;margin:0">Everyone in the family gets notified.</p>
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
    const body = { title: f.title.value.trim() || 'Meet here', lat: Number(f.dataset.lat), lng: Number(f.dataset.lng), at,
      placeId: f.dataset.place || null, createdBy: state.me.name, color: state.me.color };
    try {
      const m = await req('POST', '/meetups', body);
      upsertMeetup(m);
      map.closePopup(); setMode(null);
      setTimeout(() => meetupMarkers[m.id]?.openPopup(), 50);
      toast('🚩 Meetup set — the family has been notified');
    } catch (e) { toast('Could not set meetup: ' + e.message); }
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
    } catch (e) { toast('Could not update: ' + e.message); }
  }
  function meetMidpoint() {
    const locs = freshLocs(); if (locs.length < 2) return toast('Need at least two people sharing their location');
    const c = { lat: locs.reduce((s, l) => s + l.lat, 0) / locs.length, lng: locs.reduce((s, l) => s + l.lng, 0) / locs.length };
    // snap to the nearest known place if one is close, so the meetup is somewhere recognisable
    let best = null;
    PLACES.forEach((p) => { if (p.cat === 'airport') return; const d = km(c, p); if (d < 0.5 && (!best || d < best.d)) best = { p, d }; });
    const target = best ? { lat: best.p.lat, lng: best.p.lng } : c;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15));
    map.once('moveend', () => openMeetupComposer(target, best ? { title: best.p.name, placeId: best.p.id } : { title: 'Halfway point' }));
  }
  function fitFamily() {
    const pts = [...freshLocs(), ...activeMeetups()].map((x) => [x.lat, x.lng]);
    if (!pts.length) { toast('Nobody is sharing a location yet'); switchTab('family'); return; }
    if (pts.length === 1) map.flyTo(pts[0], 16); else map.flyToBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 16 });
  }

  function renderLive() {
    const el = $('#liveCard'); if (!el) return;
    if (!state.family || !state.me) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const locs = Object.values(state.locations).sort((a, b) => (b.memberId === memberId) - (a.memberId === memberId) || b.ts - a.ts);
    const meets = activeMeetups();
    el.innerHTML = `
      <div class="live-head"><h3>📡 Where is everyone?</h3>
        <label class="switch"><input type="checkbox" data-share-toggle ${state.sharing ? 'checked' : ''} ${state.online ? '' : 'disabled'} /><span class="track"></span> Share me</label></div>
      <p class="muted small">${state.sharing ? 'The family can see where you are while ThaiMap is open on this device.' : 'Turn on so the family can find you. Only shared while the app is open — never stored on disk.'}</p>
      ${locs.length ? `<div class="people">${locs.map((l) => {
        const d = myPos && l.memberId !== memberId ? km(myPos, l) : null;
        return `<div class="meet-row clickable" data-act="goto-member" data-id="${esc(l.memberId)}">${avatar(l.name, l.color)}
          <div class="body"><b>${l.memberId === memberId ? 'You' : esc(l.name)}</b>
          <div class="muted">${Date.now() - l.ts > STALE ? '⚠️ last seen ' : '🟢 '}${ago(l.ts)}${d !== null ? ` · ${fmtDist(d)} from you` : ''}</div></div></div>`;
      }).join('')}</div>` : '<p class="muted small">Nobody is sharing their location right now.</p>'}
      <div class="detail-actions">
        ${locs.length ? '<button class="btn small" data-act="fit-family">👀 Show everyone</button>' : ''}
        ${freshLocs().length > 1 ? '<button class="btn small" data-act="meet-midpoint">🎯 Meet in the middle</button>' : ''}
      </div>
      <h3 style="margin-top:14px">🚩 Meetup points</h3>
      ${meets.length ? meets.map((m) => `<div class="meet-row clickable" data-act="goto-meetup" data-id="${esc(m.id)}"><div class="flag-ico">🚩</div>
        <div class="body"><b>${esc(m.title)}</b><div class="muted">${m.at ? `${fmtTime(m.at)} · ${countdown(m.at)}` : 'no time set'} · ${meetSummary(m)}</div></div></div>`).join('')
        : '<p class="muted small">If you split up, set a meetup point so everyone knows where to regroup.</p>'}
      <div class="detail-actions"><button class="btn small accent" data-act="new-meetup">🚩 Set a meetup point</button></div>`;
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
        toast(`🚩 ${m.createdBy} set a meetup: ${m.title}${m.at ? ' at ' + fmtTime(m.at) : ''}`);
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
  function onFilterChanged() { renderChips(); renderList(); renderMarkers(); }
  function onNotesChanged() { refreshAllIcons(); renderNotes(); renderList(); renderDetail(); renderFamily(); }
  function onPlansChanged() { renderPlanSelect(); renderPlanEditor(); renderRoute(); renderTemplates(); renderDetail(); renderFamily(); }
  function renderAll() {
    renderBadge(); onFilterChanged(); onNotesChanged(); onPlansChanged(); setConnBanner();
    renderMembers(); renderMeetups(); renderLive();
  }

  // Re-render "x min ago" labels now and then
  setInterval(() => { if (!document.activeElement?.closest?.('.compose')) { renderFeed(); } }, 60000);

  // ── boot ────────────────────────────────────────────────────
  const urlFamily = new URLSearchParams(location.search).get('family');
  if (urlFamily && urlFamily.toLowerCase() !== state.family) openJoin();
  else if (!state.me) setTimeout(openJoin, 400);
  connect();
})();
