#!/usr/bin/env node
// Fetch Melbourne CBD from OpenStreetMap (Overpass API) and write data/melbourne-cbd.json.
// Node 18+, no dependencies. Usage: node scripts/fetch-osm.mjs [--cached]
//   --cached  reuse the last raw Overpass response (saved in the OS temp dir) instead of re-querying.
// Map data (c) OpenStreetMap contributors, ODbL.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'melbourne-cbd.json');
const RAW_CACHE = join(tmpdir(), 'neurodrive-osm-raw.json');

const BBOX = { s: -37.823, w: 144.948, n: -37.806, e: 144.979 };
const ORIGIN = { lat: -37.814, lon: 144.9635 };
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const DRIVABLE = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
];
const LANDMARKS = [
  'Flinders Street Station', 'Federation Square', 'Melbourne Central', 'Queen Victoria Market',
  'State Library Victoria', 'Southern Cross Station',
];
// Service roads that are not part of the street network (they'd just carve holes into buildings).
const SKIP_SERVICE = new Set(['parking_aisle', 'driveway', 'drive-through', 'emergency_access']);

// Default total lanes when the way has no lanes=* tag.
const DEFAULT_LANES = {
  motorway: 3, trunk: 3, primary: 4, secondary: 4, tertiary: 2, unclassified: 2, residential: 2,
  living_street: 1, service: 1,
};
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);

const bb = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
const QUERY = `[out:json][timeout:180];
(
  way["highway"~"^(${DRIVABLE.join('|')})$"]["area"!="yes"](${bb});
  way["building"](${bb});
  way["railway"="tram"](${bb});
)->.w;
.w out geom qt;
node["highway"="traffic_signals"](${bb});
out qt;
nwr["name"~"^(${LANDMARKS.join('|')})$"](${bb});
out center qt;`;

// ---- Projection (equirectangular around origin; +x east, +y south, metres) ----
const R = 6378137;
const k = Math.cos((ORIGIN.lat * Math.PI) / 180);
const r1 = (v) => Math.round(v * 10) / 10;
const project = (lat, lon) => [
  r1(((lon - ORIGIN.lon) * Math.PI * R * k) / 180),
  r1((-(lat - ORIGIN.lat) * Math.PI * R) / 180),
];
const [X0, Y1] = project(BBOX.s, BBOX.w); // south-west corner -> (minX, maxY)
const [X1, Y0] = project(BBOX.n, BBOX.e);
const inBox = ([x, y], pad = 0) => x >= X0 - pad && x <= X1 + pad && y >= Y0 - pad && y <= Y1 + pad;

// ---- Geometry helpers ----
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
};
// Split a polyline into runs that stay inside the (padded) bbox.
function clipRuns(pts, pad) {
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (inBox(p, pad)) cur.push(p);
    else {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
function parseSpeed(v) {
  if (!v) return null;
  const n = num(v);
  if (n == null) return null;
  return /mph/.test(v) ? Math.round(n * 1.609) : n;
}

async function fetchOverpass() {
  // Overpass servers are often busy (502/504/429): try each endpoint, a few rounds with backoff.
  for (let round = 0; round < 3; round++) {
    if (round) {
      console.log(`Retrying in ${round * 15}s ...`);
      await new Promise((r) => setTimeout(r, round * 15000));
    }
    const data = await tryEndpoints();
    if (data) return data;
  }
  throw new Error('All Overpass endpoints failed');
}

async function tryEndpoints() {
  for (const url of ENDPOINTS) {
    try {
      console.log(`Querying ${url} ...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'neurodrive-fetch/1.0' },
        body: 'data=' + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`  failed: ${err.message}`);
    }
  }
  return null;
}

function build(osm) {
  const roads = [];
  const buildings = [];
  const tram = [];
  const signals = [];
  const landmarks = new Map();
  let oneways = 0;

  for (const el of osm.elements) {
    const t = el.tags || {};

    if (el.type === 'node' && t.highway === 'traffic_signals') {
      const p = project(el.lat, el.lon);
      if (inBox(p)) signals.push({ x: p[0], y: p[1] });
    }

    if (t.name && LANDMARKS.includes(t.name) && !landmarks.has(t.name)) {
      const c = el.type === 'node' ? el : el.center;
      if (c) {
        const [x, y] = project(c.lat, c.lon);
        landmarks.set(t.name, { name: t.name, x, y });
      }
    }

    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map((g) => project(g.lat, g.lon));

    if (t.highway && DRIVABLE.includes(t.highway)) {
      if (t.highway === 'service' && SKIP_SERVICE.has(t.service)) continue;
      // Honour car restrictions (e.g. the trams-only blocks of Swanston St).
      const mv = t.motor_vehicle ?? t.motorcar;
      if (mv === 'no' || mv === 'private') continue;
      if ((t.access === 'private' || t.access === 'no') && !['yes', 'permit', 'destination'].includes(mv)) continue;
      if (t.tunnel === 'yes' || t.tunnel === 'building_passage') continue;

      const cls = t.highway;
      const base = cls.replace('_link', '');
      let ow = t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' || t.oneway === '-1';
      if (!ow && (t.junction === 'roundabout' || cls === 'motorway' || cls === 'motorway_link')) ow = true;
      let line = pts;
      if (t.oneway === '-1') line = [...pts].reverse(); // normalise: points always run in the legal direction
      const linkLanes = cls.endsWith('_link') ? 1 : null;
      let lanes = num(t.lanes) ?? linkLanes ?? DEFAULT_LANES[base] ?? 2;
      if (!t.lanes && ow && !linkLanes) lanes = Math.max(1, Math.ceil(lanes / 2));
      lanes = Math.max(1, Math.round(lanes));
      // OSM rarely tags width; 3.5 m per lane plus kerb/parking margin (CBD streets almost all have
      // a parking or bike lane). Floor of 5.5 m so a 1.9 m car can turn into single-lane carriageways.
      const inferred = lanes * 3.5 + (MAJOR.has(base) ? 3 : 2);
      const width = r1(Math.max(5.5, num(t.width) ?? inferred));
      const maxspeedKmh = parseSpeed(t.maxspeed) ?? 40;

      for (const run of clipRuns(line, 30)) {
        roads.push({
          id: el.id, name: t.name || '', class: cls, oneway: ow, lanes, maxspeedKmh, width,
          points: simplify(run, 0.3),
        });
        if (ow) oneways++;
      }
      continue;
    }

    if (t.railway === 'tram') {
      for (const run of clipRuns(pts, 30)) tram.push(simplify(run, 0.5));
      continue;
    }

    if (t.building) {
      if (!pts.some((p) => inBox(p))) continue;
      let ring = pts;
      if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1);
      ring = simplify(ring, 0.6);
      if (ring.length >= 3 && area(ring) >= 25) buildings.push(ring);
    }
  }

  return {
    bbox: BBOX,
    origin: ORIGIN,
    roads,
    buildings,
    tram,
    signals,
    landmarks: LANDMARKS.filter((n) => landmarks.has(n)).map((n) => landmarks.get(n)),
    _oneways: oneways,
  };
}

let osm;
if (process.argv.includes('--cached') && existsSync(RAW_CACHE)) {
  console.log(`Using cached Overpass response ${RAW_CACHE}`);
  osm = JSON.parse(readFileSync(RAW_CACHE, 'utf8'));
} else {
  osm = await fetchOverpass();
  writeFileSync(RAW_CACHE, JSON.stringify(osm));
}
const world = build(osm);
const oneways = world._oneways;
delete world._oneways;

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(world);
writeFileSync(OUT, json);

const mb = (json.length / 1024 / 1024).toFixed(2);
const missing = LANDMARKS.filter((n) => !world.landmarks.find((l) => l.name === n));
console.log(`\nWrote ${OUT}`);
console.log(`  size       ${mb} MB${json.length > 4 * 1024 * 1024 ? '  (WARNING: over 4 MB)' : ''}`);
console.log(`  roads      ${world.roads.length}  (one-way: ${oneways})`);
console.log(`  buildings  ${world.buildings.length}`);
console.log(`  tram lines ${world.tram.length}`);
console.log(`  signals    ${world.signals.length}`);
console.log(`  landmarks  ${world.landmarks.length}${missing.length ? '  missing: ' + missing.join(', ') : ''}`);
