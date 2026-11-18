// Traffic signals on the real OSM signal nodes. Nearby nodes are grouped into one intersection;
// each intersection runs a two-phase cycle. Phase is chosen by the approach direction relative to
// the Hoddle Grid axis (computed from the data), so N-S and E-W streets alternate.

import { SpatialHash } from './world.js';

const CLUSTER_RADIUS = 30; // m: signal nodes this close belong to the same intersection
export const SIGNAL_RANGE = 60; // m: how far ahead cars look for a signal
const GREEN = 18;
const AMBER = 3;
const ALL_RED = 2;
const HALF = GREEN + AMBER + ALL_RED;
const CYCLE = HALF * 2;

export class Signals {
  constructor(world, { enabled = true, seed = 7 } = {}) {
    this.enabled = enabled;
    this.time = 0;
    this.axis = gridAxis(world);
    this.nodes = [];
    this.clusters = [];
    this.grid = new SpatialHash(40);

    for (const { x, y } of world.signalsRaw) {
      const near = world.nearestRoad(x, y, 15);
      if (!near) continue; // signal on a footpath/cycleway we don't model
      const s = near.seg;
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
      const dx = (s.bx - s.ax) / len;
      const dy = (s.by - s.ay) / len;
      let a = Math.atan2(dy, dx) - this.axis;
      a = ((a % Math.PI) + Math.PI) % Math.PI; // 0..PI
      const phase = a < Math.PI / 4 || a > (3 * Math.PI) / 4 ? 0 : 1;

      let cluster = this.clusters.find((c) => Math.hypot(c.x - x, c.y - y) < CLUSTER_RADIUS);
      if (!cluster) {
        // Deterministic offset per intersection so the CBD doesn't change in lock-step.
        const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453) % 1;
        cluster = { x, y, offset: h * CYCLE };
        this.clusters.push(cluster);
      }
      const i = this.nodes.length;
      this.nodes.push({ x, y, dx, dy, phase, cluster, hud: { x, y, state: 'green' } });
      this.grid.insert(i, x, y, x, y);
    }
    this.hudList = this.nodes.map((n) => n.hud);
  }

  reset() {
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  state(i) {
    if (!this.enabled) return 'green';
    const n = this.nodes[i];
    const t = (this.time + n.cluster.offset) % CYCLE;
    const local = n.phase === 0 ? t : (t + HALF) % CYCLE;
    if (local < GREEN) return 'green';
    if (local < GREEN + AMBER) return 'amber';
    return 'red';
  }

  // Nearest signal ahead of a car at (x, y) facing (fx, fy) that controls its direction of travel.
  // Writes into `out` ({ i, dist, state }) and returns it, or returns null.
  ahead(x, y, fx, fy, out, range = SIGNAL_RANGE) {
    if (!this.nodes.length) return null;
    let best = -1;
    let bestAlong = range;
    const cx = x + fx * range * 0.5;
    const cy = y + fy * range * 0.5;
    const r = range * 0.5 + 8;
    this.grid.query(cx - r, cy - r, cx + r, cy + r, (i) => {
      const n = this.nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      const along = dx * fx + dy * fy;
      if (along <= 0 || along >= bestAlong) return;
      if (Math.abs(dx * fy - dy * fx) > 7) return; // too far to the side
      if (Math.abs(n.dx * fx + n.dy * fy) < 0.7) return; // controls the cross street
      best = i;
      bestAlong = along;
    });
    if (best < 0) return null;
    out.i = best;
    out.dist = bestAlong;
    out.state = this.state(best);
    return out;
  }

  // Live list for MapView's overlay ([] when signals are switched off). Objects are reused.
  hud() {
    if (!this.enabled) return EMPTY;
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].hud.state = this.state(i);
    return this.hudList;
  }
}

const EMPTY = [];

// Dominant street direction (radians, mod 90°) from length-weighted segment angles of major roads.
function gridAxis(world) {
  const bins = new Float64Array(90);
  for (const s of world.roadSegs) {
    const cls = world.roads[s.road].class;
    if (cls === 'service' || cls === 'residential') continue;
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const len = Math.hypot(dx, dy);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    deg = ((deg % 90) + 90) % 90;
    bins[Math.floor(deg) % 90] += len;
  }
  let best = 0;
  for (let i = 1; i < 90; i++) if (bins[i] > bins[best]) best = i;
  return ((best + 0.5) * Math.PI) / 180;
}
