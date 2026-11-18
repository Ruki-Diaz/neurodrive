// World geometry: road ribbons, clipped road-edge segments and spatial hash grids for fast
// ray casts / on-road queries. Units are metres, +x east, +y south (see SPEC.md).

const EDGE_CELL = 16; // metres per grid cell
const PIECE = 1.5; // edge subdivision length used when clipping edges at junctions
const JUNCTION_PAD = 3; // extra radius (m) of the drivable disc at each junction

export async function loadWorld(url = 'data/melbourne-cbd.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: HTTP ${res.status}`);
  const data = await res.json();
  return new World(data);
}

// Uniform grid of item indices. Items are inserted by bounding box.
export class SpatialHash {
  constructor(cell = EDGE_CELL) {
    this.cell = cell;
    this.cells = new Map();
  }
  key(cx, cy) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  insert(idx, minX, minY, maxX, maxY) {
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
        const k = this.key(cx, cy);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(idx);
      }
    }
  }
  at(cx, cy) {
    return this.cells.get(this.key(cx, cy));
  }
  // Calls fn(idx) for every item in cells overlapping the box (items may repeat across cells).
  query(minX, minY, maxX, maxY, fn) {
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (let i = 0; i < list.length; i++) fn(list[i]);
      }
    }
  }
}

// Squared distance from P to segment AB, plus the projection parameter t (0..1).
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}

// Ray (o + t*d, d unit) vs segment AB. Returns t or -1.
export function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const wx = ax - ox;
  const wy = ay - oy;
  const t = (wx * ey - wy * ex) / den;
  const u = (wx * dy - wy * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : -1;
}

export class World {
  constructor(data) {
    this.data = data;
    this.roads = data.roads;
    this.signalsRaw = data.signals || [];
    this.landmarks = data.landmarks || [];
    this.#bounds();
    this.#buildRoadSegments();
    this.#buildEdges();
    this.stamp = 0;
    this.edgeStamp = new Uint32Array(this.edgeCount);
  }

  #bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of this.roads) {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [x, y] of r.points) {
        if (x < a) a = x;
        if (y < b) b = y;
        if (x > c) c = x;
        if (y > d) d = y;
      }
      r.bbox = [a, b, c, d];
      minX = Math.min(minX, a); minY = Math.min(minY, b); maxX = Math.max(maxX, c); maxY = Math.max(maxY, d);
    }
    this.bounds = { minX, minY, maxX, maxY };
  }

  // Centre-line segments with half-width, indexed in a grid (used for on-road tests & street lookup).
  // Junctions (points shared by 2+ roads) also get a disc of drivable space: real CBD intersections
  // are far roomier than two crossing ribbons with knife-edge inner corners.
  #buildRoadSegments() {
    const segs = [];
    this.roads.forEach((road, ri) => {
      const hw = road.width / 2;
      const p = road.points;
      for (let i = 0; i < p.length - 1; i++) {
        segs.push({ ax: p[i][0], ay: p[i][1], bx: p[i + 1][0], by: p[i + 1][1], hw, road: ri, junction: false });
      }
    });
    // A junction is a point with 3+ distinct neighbours (not just two OSM ways of one street joining).
    const meet = new Map();
    const key = (pt) => pt[0] + ',' + pt[1];
    this.roads.forEach((road, ri) => {
      const p = road.points;
      p.forEach((pt, i) => {
        const k = key(pt);
        const m = meet.get(k) || { x: pt[0], y: pt[1], roads: new Set(), nbrs: new Set(), hw: 0 };
        m.roads.add(ri);
        if (i > 0) m.nbrs.add(key(p[i - 1]));
        if (i < p.length - 1) m.nbrs.add(key(p[i + 1]));
        m.hw = Math.max(m.hw, road.width / 2);
        meet.set(k, m);
      });
    });
    // Junctions get a padded disc; plain bends (incl. where two OSM ways of one street meet at an
    // angle) get a round join of the ribbon's own width, which fills the wedge-shaped gap outside.
    this.junctions = [];
    for (const m of meet.values()) {
      let r;
      if (m.nbrs.size >= 3) r = m.hw + JUNCTION_PAD;
      else if (m.nbrs.size === 2) {
        const [a, b] = [...m.nbrs].map((k) => k.split(',').map(Number));
        const ux = a[0] - m.x, uy = a[1] - m.y, vx = b[0] - m.x, vy = b[1] - m.y;
        const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
        if (cos < -0.9994) continue; // practically straight (< 2°): no gap to fill
        r = m.hw;
      } else continue;
      this.junctions.push({ x: m.x, y: m.y, r });
      segs.push({ ax: m.x, ay: m.y, bx: m.x, by: m.y, hw: r, road: [...m.roads][0], junction: true });
    }
    this.roadSegs = segs;
    this.roadGrid = new SpatialHash(EDGE_CELL);
    segs.forEach((s, i) => {
      this.roadGrid.insert(i, Math.min(s.ax, s.bx) - s.hw, Math.min(s.ay, s.by) - s.hw,
        Math.max(s.ax, s.bx) + s.hw, Math.max(s.ay, s.by) + s.hw);
    });
  }

  // Strictly inside some road ribbon (margin keeps a ribbon's own boundary from counting as inside).
  #insideAny(x, y, margin) {
    const list = this.roadGrid.at(Math.floor(x / EDGE_CELL), Math.floor(y / EDGE_CELL));
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const s = this.roadSegs[list[i]];
      const r = s.hw - margin;
      if (r > 0 && segDist2(x, y, s.ax, s.ay, s.bx, s.by) < r * r) return true;
    }
    return false;
  }

  onRoad(x, y) {
    return this.#insideAny(x, y, 0);
  }

  // Road edges = each ribbon's two offset lines (+ caps at dead ends), with the parts that fall
  // inside another ribbon removed. What's left approximates the kerb line of the whole network,
  // so junctions stay open for driving straight through.
  #buildEdges() {
    const raw = [];
    const endUse = new Map();
    const k = (p) => p[0] + ',' + p[1];
    for (const r of this.roads) {
      for (const p of r.points) endUse.set(k(p), (endUse.get(k(p)) || 0) + 1);
    }
    for (const r of this.roads) {
      const hw = r.width / 2;
      const p = r.points;
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) continue;
        const nx = (-(by - ay) / len) * hw;
        const ny = ((bx - ax) / len) * hw;
        raw.push([ax + nx, ay + ny, bx + nx, by + ny], [ax - nx, ay - ny, bx - nx, by - ny]);
      }
      // Cap dead ends (points used by no other road) so cars can't drive off the end of a street.
      for (const [i, j] of [[0, 1], [p.length - 1, p.length - 2]]) {
        if (endUse.get(k(p[i])) > 1) continue;
        const [ax, ay] = p[i];
        const [bx, by] = p[j];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = (-(by - ay) / len) * hw;
        const ny = ((bx - ax) / len) * hw;
        raw.push([ax + nx, ay + ny, ax - nx, ay - ny]);
      }
    }
    // Junction disc outlines (16-gons); the parts inside roads get clipped away like everything else.
    for (const j of this.junctions) {
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = ((i + 1) / 16) * Math.PI * 2;
        raw.push([j.x + Math.cos(a0) * j.r, j.y + Math.sin(a0) * j.r, j.x + Math.cos(a1) * j.r, j.y + Math.sin(a1) * j.r]);
      }
    }

    const out = [];
    for (const [ax, ay, bx, by] of raw) {
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(len / PIECE));
      let runStart = -1;
      for (let i = 0; i <= n; i++) {
        let keep = false;
        if (i < n) {
          const t = (i + 0.5) / n;
          keep = !this.#insideAny(ax + (bx - ax) * t, ay + (by - ay) * t, 0.05);
        }
        if (keep && runStart < 0) runStart = i;
        if (!keep && runStart >= 0) {
          const t0 = runStart / n;
          const t1 = i / n;
          out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1);
          runStart = -1;
        }
      }
    }

    this.edges = new Float32Array(out);
    this.edgeCount = out.length / 4;
    this.edgeGrid = new SpatialHash(EDGE_CELL);
    const e = this.edges;
    for (let i = 0; i < this.edgeCount; i++) {
      const o = i * 4;
      this.edgeGrid.insert(i, Math.min(e[o], e[o + 2]), Math.min(e[o + 1], e[o + 3]),
        Math.max(e[o], e[o + 2]), Math.max(e[o + 1], e[o + 3]));
    }
  }

  // Distance along a ray to the nearest road edge (grid DDA, so only cells along the ray are tested).
  raycast(ox, oy, dx, dy, maxLen) {
    const c = EDGE_CELL;
    const e = this.edges;
    const stampArr = this.edgeStamp;
    const stamp = ++this.stamp;
    if (stamp === 0xffffffff) {
      stampArr.fill(0);
      this.stamp = 1;
    }
    let best = maxLen;
    let cx = Math.floor(ox / c);
    let cy = Math.floor(oy / c);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? c / Math.abs(dx) : Infinity;
    const tdy = dy !== 0 ? c / Math.abs(dy) : Infinity;
    let tmx = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * c - ox) / dx : Infinity;
    let tmy = dy !== 0 ? ((cy + (dy > 0 ? 1 : 0)) * c - oy) / dy : Infinity;
    let t = 0;
    while (t <= best) {
      const list = this.edgeGrid.at(cx, cy);
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const idx = list[i];
          if (stampArr[idx] === this.stamp) continue;
          stampArr[idx] = this.stamp;
          const o = idx * 4;
          const h = raySeg(ox, oy, dx, dy, e[o], e[o + 1], e[o + 2], e[o + 3]);
          if (h >= 0 && h < best) best = h;
        }
      }
      if (tmx < tmy) {
        t = tmx;
        tmx += tdx;
        cx += stepX;
      } else {
        t = tmy;
        tmy += tdy;
        cy += stepY;
      }
    }
    return best;
  }

  // Nearest road centre-line within `radius` m: { road, seg, dist } or null.
  nearestRoad(x, y, radius = 12) {
    let best = null;
    let bestD = radius * radius;
    this.roadGrid.query(x - radius, y - radius, x + radius, y + radius, (i) => {
      const s = this.roadSegs[i];
      if (s.junction) return;
      const d = segDist2(x, y, s.ax, s.ay, s.bx, s.by);
      // Prefer the segment whose ribbon we're inside; among those the closest centre line.
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    });
    return best ? { road: this.roads[best.road], seg: best, dist: Math.sqrt(bestD) } : null;
  }
}
