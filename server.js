// ThaiMap server — zero dependencies. Serves the app and a tiny shared-family API
// with live updates over Server-Sent Events.
//   node server.js            (PORT=3000 by default)

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'families');
const MAX_BODY = 64 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// ── family store ──────────────────────────────────────────────
const cache = new Map();     // code -> state
const queues = new Map();    // code -> promise chain (serialises writes)
const streams = new Map();   // code -> Set<res>

const validCode = (c) => /^[a-z0-9-]{3,40}$/.test(c);
const fileFor = (code) => path.join(DATA_DIR, `${code}.json`);
const clip = (v, n) => String(v ?? '').slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

async function load(code) {
  if (cache.has(code)) return cache.get(code);
  let state;
  try { state = JSON.parse(await fsp.readFile(fileFor(code), 'utf8')); }
  catch { state = { code, createdAt: Date.now(), notes: [], plans: [] }; }
  state.meetups ||= [];
  state.locations = {}; // live positions are kept in memory only (never written to disk)
  cache.set(code, state);
  return state;
}

function mutate(code, fn) {
  const prev = queues.get(code) || Promise.resolve();
  const next = prev.then(async () => {
    const state = await load(code);
    const result = fn(state);
    const tmp = fileFor(code) + '.tmp';
    const { locations, ...persisted } = state;
    await fsp.writeFile(tmp, JSON.stringify(persisted));
    await fsp.rename(tmp, fileFor(code));
    return result;
  });
  queues.set(code, next.catch(() => {}));
  return next;
}

function broadcast(code, event) {
  const set = streams.get(code);
  if (!set) return;
  const msg = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) res.write(msg);
}

// ── helpers ──────────────────────────────────────────────────
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sanitizeNote(b) {
  const note = {
    id: crypto.randomUUID(),
    author: clip(b.author, 40) || 'Someone',
    color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#0d9488',
    text: clip(b.text, 2000).trim(),
    placeId: b.placeId ? clip(b.placeId, 60) : null,
    parentId: b.parentId ? clip(b.parentId, 60) : null,
    lat: num(b.lat), lng: num(b.lng),
    kind: ['note', 'idea', 'warning', 'love'].includes(b.kind) ? b.kind : 'note',
    createdAt: Date.now(),
  };
  if (!note.text) throw Object.assign(new Error('Text required'), { status: 400 });
  if (!note.placeId && !note.parentId && (note.lat === null || note.lng === null))
    throw Object.assign(new Error('A note needs a place, a parent or coordinates'), { status: 400 });
  return note;
}

function sanitizePlan(id, b) {
  const stops = Array.isArray(b.stops) ? b.stops.slice(0, 40).map((s) => ({
    id: clip(s.id, 60) || crypto.randomUUID(),
    place: s.place ? clip(s.place, 60) : null,
    name: clip(s.name, 120),
    lat: num(s.lat), lng: num(s.lng),
    time: clip(s.time, 10),
    note: clip(s.note, 500),
  })) : [];
  return {
    id,
    name: clip(b.name, 120) || 'Untitled day',
    date: clip(b.date, 10),
    type: clip(b.type, 20),
    stops,
    updatedBy: clip(b.updatedBy, 40),
    rev: clip(b.rev, 40),
    updatedAt: Date.now(),
  };
}

// ── API ──────────────────────────────────────────────────────
async function api(req, res, parts) {
  // parts: ['api','family',code, resource?, id?]
  const code = (parts[2] || '').toLowerCase();
  if (parts[1] !== 'family' || !validCode(code)) return send(res, 404, { error: 'Not found' });
  const [, , , resource, id] = parts;

  if (req.method === 'GET' && !resource) {
    const s = await load(code);
    pruneLocations(s);
    return send(res, 200, { code, notes: s.notes, plans: s.plans, meetups: s.meetups, locations: Object.values(s.locations) });
  }

  if (req.method === 'GET' && resource === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); streams.get(code)?.delete(res); });
    return;
  }

  if (resource === 'notes') {
    if (req.method === 'POST' && !id) {
      const note = sanitizeNote(await readBody(req));
      await mutate(code, (s) => { s.notes.push(note); if (s.notes.length > 5000) s.notes.shift(); });
      broadcast(code, { type: 'note:add', note });
      return send(res, 201, note);
    }
    if (req.method === 'DELETE' && id) {
      const removed = await mutate(code, (s) => {
        const ids = new Set([id]);
        s.notes.forEach((n) => { if (n.parentId === id) ids.add(n.id); });
        const before = s.notes.length;
        s.notes = s.notes.filter((n) => !ids.has(n.id));
        return before !== s.notes.length ? [...ids] : null;
      });
      if (!removed) return send(res, 404, { error: 'Note not found' });
      broadcast(code, { type: 'note:delete', ids: removed });
      return send(res, 200, { ok: true });
    }
  }

  if (resource === 'plans' && id && /^[\w-]{1,60}$/.test(id)) {
    if (req.method === 'PUT') {
      const plan = sanitizePlan(id, await readBody(req));
      await mutate(code, (s) => {
        const i = s.plans.findIndex((p) => p.id === id);
        if (i >= 0) s.plans[i] = plan; else s.plans.push(plan);
      });
      broadcast(code, { type: 'plan:put', plan });
      return send(res, 200, plan);
    }
    if (req.method === 'DELETE') {
      await mutate(code, (s) => { s.plans = s.plans.filter((p) => p.id !== id); });
      broadcast(code, { type: 'plan:delete', id });
      return send(res, 200, { ok: true });
    }
  }

  // Live locations: PUT/DELETE /locations/:memberId (memory only)
  if (resource === 'locations' && id && /^[\w-]{4,60}$/.test(id)) {
    const s = await load(code);
    if (req.method === 'PUT') {
      const b = await readBody(req);
      const lat = num(b.lat), lng = num(b.lng);
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return send(res, 400, { error: 'Bad coordinates' });
      const loc = {
        memberId: id, name: clip(b.name, 40) || 'Someone',
        color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#0d9488',
        lat, lng, acc: Math.min(5000, Math.max(0, num(b.acc) ?? 0)), ts: Date.now(),
      };
      s.locations[id] = loc;
      broadcast(code, { type: 'loc:put', loc });
      return send(res, 200, loc);
    }
    if (req.method === 'DELETE') {
      delete s.locations[id];
      broadcast(code, { type: 'loc:delete', memberId: id });
      return send(res, 200, { ok: true });
    }
  }

  // Meetup points: POST /meetups, DELETE /meetups/:id, PUT /meetups/:id/status/:memberId
  if (resource === 'meetups') {
    if (req.method === 'POST' && !id) {
      const b = await readBody(req);
      const lat = num(b.lat), lng = num(b.lng);
      if (lat === null || lng === null) return send(res, 400, { error: 'Bad coordinates' });
      const meetup = {
        id: crypto.randomUUID(), title: clip(b.title, 120).trim() || 'Meet here',
        lat, lng, at: num(b.at), placeId: b.placeId ? clip(b.placeId, 60) : null,
        createdBy: clip(b.createdBy, 40) || 'Someone',
        color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#ea580c',
        status: {}, createdAt: Date.now(),
      };
      await mutate(code, (s) => {
        const cutoff = Date.now() - 12 * 3600e3; // drop meetups more than 12 h old
        s.meetups = s.meetups.filter((m) => (m.at || m.createdAt) > cutoff).slice(-30);
        s.meetups.push(meetup);
      });
      broadcast(code, { type: 'meetup:put', meetup });
      return send(res, 201, meetup);
    }
    const statusFor = parts[6];
    if (req.method === 'PUT' && id && parts[5] === 'status' && statusFor && /^[\w-]{4,60}$/.test(statusFor)) {
      const b = await readBody(req);
      const st = ['coming', 'late', 'here', 'cant'].includes(b.status) ? b.status : null;
      const meetup = await mutate(code, (s) => {
        const m = s.meetups.find((x) => x.id === id);
        if (!m) return null;
        if (st) m.status[statusFor] = { name: clip(b.name, 40), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#475569', status: st, ts: Date.now() };
        else delete m.status[statusFor];
        return m;
      });
      if (!meetup) return send(res, 404, { error: 'Meetup not found' });
      broadcast(code, { type: 'meetup:put', meetup });
      return send(res, 200, meetup);
    }
    if (req.method === 'DELETE' && id && !parts[5]) {
      await mutate(code, (s) => { s.meetups = s.meetups.filter((m) => m.id !== id); });
      broadcast(code, { type: 'meetup:delete', id });
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

// Forget positions nobody has updated for 6 hours
function pruneLocations(s) {
  const cutoff = Date.now() - 6 * 3600e3;
  for (const [k, v] of Object.entries(s.locations)) if (v.ts < cutoff) delete s.locations[k];
}

// ── static files ─────────────────────────────────────────────
async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname.startsWith('/api/')) return await api(req, res, pathname.split('/').filter(Boolean));
    return await serveStatic(req, res, pathname);
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
    if (!err.status) console.error(err);
  }
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  🇹🇭  ThaiMap running\n  Local:   http://localhost:${PORT}`);
  if (lan) console.log(`  Family on same Wi-Fi:  http://${lan.address}:${PORT}`);
  console.log('');
});
