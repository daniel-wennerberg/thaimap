// The map, independent of any view framework: base layers, Thailand mask, places, notes, routes, trip, family, meetups.
// Shells tell it which screen area is covered (insets) and listen to its click events.
import L from './leaflet';
import {
  CATEGORIES, PLACES, PLACE, REGIONS, T, LS, esc, Emitter, matchesQuery, stopCoord, stayColor, store,
  type LatLng, type Place, type Stop, type TemplateStop, type Trip,
} from '../../core';
import { ui } from '../shared/ui-store';
import { KINDS, isMapNote } from '../shared/constants';

export interface Insets { l: number; t: number; r: number; b: number }
export interface MapEvents extends Record<string, unknown> {
  place: string; note: string; meetup: string; member: string; stay: string; tap: LatLng;
}

const TH_BOUNDS = L.latLngBounds([5.5, 97.3], [20.5, 105.7]);
const MASK_BOX = L.latLngBounds([-1, 90], [28, 112]);
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const initial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?';

export const placeMatches = (p: Place) => ui.cats.has(p.cat) && matchesQuery(p, ui.query);
export const placeInList = (p: Place) => placeMatches(p) && (ui.region === 'all' || p.region === ui.region);

export class MapController {
  readonly map: L.Map;
  readonly events = new Emitter<MapEvents>();
  private insets: () => Insets;
  private cluster: L.MarkerClusterGroup;
  private airports = L.layerGroup();
  private notes = L.layerGroup();
  private plan = L.layerGroup();
  private people = L.layerGroup();
  private meets = L.layerGroup();
  private placeMarkers: Record<string, L.Marker> = {};
  private me: L.CircleMarker | null = null;

  constructor(el: HTMLElement, opts: { insets: () => Insets; controls?: 'full' | 'minimal' }) {
    this.insets = opts.insets;
    const map = this.map = L.map(el, {
      zoomControl: false, attributionControl: true, minZoom: 5,
      maxBounds: L.latLngBounds([-28, 62], [48, 140]), maxBoundsViscosity: 1, worldCopyJump: false,
    }).fitBounds(TH_BOUNDS);

    // base maps
    const bases: Record<string, [string, L.Layer]> = {
      sat: [T('🛰️ Satellite'), L.layerGroup([
        L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery &copy; Esri', maxZoom: 19, crossOrigin: true }),
        L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, crossOrigin: true }),
        L.tileLayer(ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.55, crossOrigin: true }),
      ])],
      dark: [T('🌑 Dark map'), L.layerGroup([
        L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 16, crossOrigin: true }),
        L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, crossOrigin: true }),
      ])],
      street: [T('🗺️ Map (English)'), L.tileLayer(ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19, crossOrigin: true })],
      topo: [T('⛰️ Terrain (hiking)'), L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: 'Map data &copy; OpenStreetMap, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)', subdomains: 'abc', maxZoom: 17, crossOrigin: true })],
      osm: [T('🇹🇭 OpenStreetMap (Thai names)'), L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, crossOrigin: true })],
    };
    (bases[LS.get('base', 'sat')] || bases.sat)[1].addTo(map);
    if (opts.controls !== 'minimal') L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.layers(Object.fromEntries(Object.values(bases)), undefined, { position: 'topright' }).addTo(map);
    map.on('baselayerchange', (e: L.LayersControlEvent) => { const k = Object.keys(bases).find((x) => bases[x][1] === e.layer); if (k) LS.set('base', k); });
    if (opts.controls !== 'minimal') L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    // dark mask around Thailand (outside the data window + neighbouring countries)
    map.createPane('mask');
    const pane = map.getPane('mask')!; pane.style.zIndex = '350'; pane.style.pointerEvents = 'none';
    L.polygon([[[-85, -180], [85, -180], [85, 180], [-85, 180]],
      [[MASK_BOX.getSouth(), MASK_BOX.getWest()], [MASK_BOX.getNorth(), MASK_BOX.getWest()], [MASK_BOX.getNorth(), MASK_BOX.getEast()], [MASK_BOX.getSouth(), MASK_BOX.getEast()]]],
    { pane: 'mask', interactive: false, stroke: false, fillColor: '#05070a', fillOpacity: 0.6 }).addTo(map);
    import('./neighbors.json').then(({ default: N }) => {
      L.geoJSON(N as GeoJSON.GeoJsonObject, { pane: 'mask', interactive: false,
        style: { stroke: true, color: 'rgba(255,255,255,.35)', weight: 0.6, fillColor: '#05070a', fillOpacity: 0.6 } }).addTo(map);
    });
    const syncZoom = () => map.getContainer().classList.toggle('zoomed-out', map.getZoom() < 7);
    map.on('zoomend', syncZoom); syncZoom();

    this.cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 42, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 15,
      iconCreateFunction: (c) => L.divIcon({ className: 'marker-cluster-custom', html: `<div>${c.getChildCount()}</div>`, iconSize: [40, 40] }),
    }).addTo(map);
    [this.airports, this.notes, this.plan, this.people, this.meets].forEach((l) => l.addTo(map));

    PLACES.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: this.placeIcon(p), title: p.name, riseOnHover: true });
      m.bindTooltip(esc(p.name), { direction: 'top', offset: p.cat === 'airport' ? [0, -10] : [0, -36] });
      m.on('click', () => this.events.emit('place', p.id));
      this.placeMarkers[p.id] = m;
    });
    map.on('click', (e: L.LeafletMouseEvent) => { if (ui.mode) this.events.emit('tap', { lat: e.latlng.lat, lng: e.latlng.lng }); });
  }

  // ── viewport aware of floating UI ──
  private centreFor(ll: LatLng, z: number) {
    const P = this.insets();
    return this.map.unproject(this.map.project(L.latLng(ll.lat, ll.lng), z).add(L.point((P.r - P.l) / 2, (P.b - P.t) / 2)), z);
  }
  private boundsTarget(b: L.LatLngBounds, extra = 0, maxZoom = 18) {
    const P = this.insets();
    const tl = L.point(P.l + extra, P.t + extra), br = L.point(P.r + extra, P.b + extra);
    const z = Math.min(maxZoom, this.map.getBoundsZoom(b, false, tl.add(br)));
    const c = this.map.project(b.getSouthWest(), z).add(this.map.project(b.getNorthEast(), z)).divideBy(2).add(br.subtract(tl).divideBy(2));
    return { c: this.map.unproject(c, z), z };
  }
  flyTo(ll: LatLng, zoom = this.map.getZoom()) { this.map.flyTo(this.centreFor(ll, zoom), zoom, { duration: 0.8 }); }
  fitBounds(pts: LatLng[], extra = 50, maxZoom = 15) {
    if (!pts.length) return;
    if (pts.length === 1) return this.flyTo(pts[0], maxZoom);
    const t = this.boundsTarget(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple)), extra, maxZoom);
    this.map.flyTo(t.c, t.z, { duration: 0.9 });
  }
  fitThailand(animate = true) {
    const t = this.boundsTarget(TH_BOUNDS, 10);
    if (animate) this.map.flyTo(t.c, t.z); else this.map.setView(t.c, t.z, { animate: false });
  }
  showRegion(region: string) {
    if (region === 'all') return this.fitThailand();
    const r = REGIONS[region]; this.flyTo({ lat: r.center[0], lng: r.center[1] }, r.zoom);
  }
  fitStops(stops: (Partial<Stop> | TemplateStop)[]) { this.fitBounds(stops.map(stopCoord).filter(Boolean) as LatLng[], 60, 15); }
  fitTrip(trip: Trip) { this.fitBounds(trip.stays.filter((s) => s.lat != null) as unknown as LatLng[], 50, 11); }
  focusPlace(id: string) {
    const p = PLACE[id]; if (!p) return;
    this.flyTo(p, Math.max(this.map.getZoom(), p.cat === 'island' ? 12 : 15));
  }
  /** Nudge the view when the covered area changes (panel slides in/out, sheet snaps). */
  shiftForInsets(before: Insets) {
    const P = this.insets();
    this.map.panBy([((P.r - P.l) - (before.r - before.l)) / 2, ((P.b - P.t) - (before.b - before.t)) / 2], { animate: true });
  }
  currentInsets() { return this.insets(); }
  setCrosshair(on: boolean) { this.map.getContainer().classList.toggle('crosshair', on); }
  invalidate() { this.map.invalidateSize(); }
  showMe(ll: LatLng) {
    this.me?.remove();
    this.me = L.circleMarker([ll.lat, ll.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(this.map).bindTooltip(T('You are here'));
    this.flyTo(ll, 15);
  }
  isInThailand(ll: LatLng) { return TH_BOUNDS.pad(0.1).contains([ll.lat, ll.lng]); }

  // ── rendering from core + view state ──
  render() {
    this.renderPlaces();
    this.renderNotes();
    this.renderRoute();
    this.renderPeople();
    this.renderMeetups();
  }

  private placeIcon(p: Place) {
    if (p.cat === 'airport') {
      return L.divIcon({ className: '', iconSize: [70, 24], iconAnchor: [35, 12],
        html: `<div style="display:flex;justify-content:center"><div class="airport-pin ${p.intl ? 'intl' : ''} ${ui.selected === p.id ? 'sel' : ''}">✈️<span class="code">${esc(p.iata)}</span></div></div>` });
    }
    const c = CATEGORIES[p.cat];
    const n = store.state.notes.filter((x) => x.placeId === p.id).length;
    return L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 41], tooltipAnchor: [0, -36],
      html: `<div class="pin-wrap"><div class="pin ${ui.selected === p.id ? 'sel' : ''}" style="--c:${c.color}"><span>${c.icon}</span></div>${n ? `<div class="pin-count">${n}</div>` : ''}</div>` });
  }
  private lastFilter = '';
  private renderPlaces() {
    const key = [...ui.cats].join() + '|' + ui.query;
    if (key !== this.lastFilter) {
      this.lastFilter = key;
      this.cluster.clearLayers(); this.airports.clearLayers();
      const visible = PLACES.filter(placeMatches);
      this.cluster.addLayers(visible.filter((p) => p.cat !== 'airport').map((p) => this.placeMarkers[p.id]));
      visible.filter((p) => p.cat === 'airport').forEach((p) => this.airports.addLayer(this.placeMarkers[p.id]));
    }
    PLACES.forEach((p) => this.placeMarkers[p.id].setIcon(this.placeIcon(p)));
  }
  private renderNotes() {
    this.notes.clearLayers();
    store.state.notes.filter(isMapNote).forEach((n) => {
      L.marker([n.lat!, n.lng!], { zIndexOffset: 500, icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="note-pin" style="--c:${esc(n.color)}">${KINDS[n.kind]?.[0] || '📝'}</div>` }) })
        .bindTooltip(`${esc(n.author)}: ${esc(n.text.slice(0, 50))}${n.text.length > 50 ? '…' : ''}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => this.events.emit('note', n.id))
        .addTo(this.notes);
    });
  }
  private renderRoute() {
    this.plan.clearLayers();
    const trip = store.activeTrip();
    if (!ui.preview && trip && ui.view !== 'day') return this.drawTrip(trip);
    const stops = ui.preview ? ui.preview.stops : store.activePlan()?.stops || [];
    const pts = stops.map(stopCoord).filter(Boolean) as (LatLng & { name: string })[];
    if (pts.length > 1) {
      L.polyline(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: '#fff', weight: 8, opacity: 0.8 }).addTo(this.plan);
      L.polyline(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: ui.preview ? '#0f766e' : '#ea580c', weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(this.plan);
    }
    let i = 0;
    stops.forEach((s) => {
      const c = stopCoord(s); if (!c) return; i++;
      L.marker([c.lat, c.lng], { zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div class="stop-pin" style="${ui.preview ? 'background:#0f766e;color:#fff' : ''}">${i}</div>` }) })
        .bindTooltip(`${s.time ? esc(s.time) + ' · ' : ''}${esc(c.name)}`, { direction: 'top', offset: [0, -12] })
        .on('click', () => { if (s.place) this.events.emit('place', s.place); })
        .addTo(this.plan);
    });
  }
  private drawTrip(trip: Trip) {
    const pts = trip.stays.filter((s) => s.lat != null);
    if (pts.length > 1) {
      L.polyline(pts.map((s) => [s.lat!, s.lng!] as L.LatLngTuple), { color: '#fff', weight: 7, opacity: 0.8 }).addTo(this.plan);
      L.polyline(pts.map((s) => [s.lat!, s.lng!] as L.LatLngTuple), { color: '#0f766e', weight: 3.5, dashArray: '6 8', lineCap: 'round' }).addTo(this.plan);
    }
    pts.forEach((s) => {
      L.marker([s.lat!, s.lng!], { zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="stay-pin" style="--c:${stayColor(trip, s)}">${trip.stays.indexOf(s) + 1}</div>` }) })
        .bindTooltip(`${esc(s.name)} · ${s.nights} ${T(s.nights === 1 ? 'night' : 'nights')}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => this.events.emit('stay', s.id))
        .addTo(this.plan);
    });
  }
  private renderPeople() {
    this.people.clearLayers();
    Object.values(store.state.locations).forEach((l) => {
      const stale = Date.now() - l.ts > store.STALE;
      const mine = l.memberId === store.memberId;
      L.circle([l.lat, l.lng], { radius: Math.min(l.acc || 0, 300), weight: 1, fillOpacity: 0.08, color: l.color, fillColor: l.color, interactive: false }).addTo(this.people);
      L.marker([l.lat, l.lng], { zIndexOffset: 2000, icon: L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
        html: `<div class="member-pin ${stale ? 'stale' : ''} ${mine ? 'me' : ''}" style="--c:${esc(l.color)}">${esc(initial(l.name))}</div>` }) })
        .bindTooltip(`<b>${mine ? T('You') : esc(l.name)}</b>`, { direction: 'top', offset: [0, -20] })
        .on('click', () => this.events.emit('member', l.memberId))
        .addTo(this.people);
    });
  }
  private renderMeetups() {
    this.meets.clearLayers();
    store.activeMeetups().forEach((m) => {
      const time = m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' : '';
      L.marker([m.lat, m.lng], { zIndexOffset: 1500, icon: L.divIcon({ className: '', iconSize: [40, 46], iconAnchor: [14, 44],
        html: `<div class="meet-pin"><div class="flag">🚩</div><div class="lbl">${esc(time)}${esc(m.title)}</div></div>` }) })
        .on('click', () => this.events.emit('meetup', m.id))
        .addTo(this.meets);
    });
  }
}
