// AI traffic: cars that follow the road graph at the speed limit, keep left on two-way streets,
// keep a following distance (simplified IDM) and stop for red signals. They're obstacles for the
// learner cars; they ignore learners (which retire on contact anyway).

import { carCorners, CAR_LENGTH } from './car.js';
import { laneOffset } from './router.js';

const MAX_CARS = 50;
const SPAWN_RADIUS = 350; // m from the route
const START_CLEAR = 40; // m: keep the learners' start free
const IDM_A = 1.5;
const IDM_B = 3;
const IDM_S0 = 2.5;
const IDM_T = 1.3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class TrafficCar {
  constructor() {
    this.corners = new Float64Array(8);
    this.sig = { i: -1, dist: 0, state: 'green' };
  }
}

export class Traffic {
  constructor(world, graph, signals) {
    this.world = world;
    this.graph = graph;
    this.signals = signals;
    this.density = 0;
    this.cars = [];
    this.pool = [];
    this.seed = 1;
    this.frame = 0;
  }

  // Prepare for a route: candidate spawn edges near it. Same seed => same traffic every generation.
  setRoute(route, seed) {
    this.route = route;
    this.seed = seed;
    const [sx, sy] = route.points[0];
    this.spawnEdges = this.graph.edges.filter((e) => {
      if (e.len < 12 || e.road.class === 'service') return false;
      const m = e.pts[Math.floor(e.pts.length / 2)];
      return route.distanceTo(m[0], m[1]) < SPAWN_RADIUS && Math.hypot(m[0] - sx, m[1] - sy) > START_CLEAR;
    });
    if (!this.spawnEdges.length) this.spawnEdges = this.graph.edges.filter((e) => e.len > 12);
  }

  reset() {
    this.rng = mulberry32(this.seed);
    this.cars.length = 0;
    this.frame = 0;
    this.#fill();
  }

  setDensity(d) {
    this.density = Math.max(0, Math.min(1, d));
    this.#fill();
  }

  #fill() {
    if (!this.route) return;
    const want = Math.round(this.density * MAX_CARS);
    while (this.cars.length > want) this.pool.push(this.cars.pop());
    let guard = 0;
    while (this.cars.length < want && guard++ < want * 10) {
      const c = this.pool.pop() || new TrafficCar();
      if (this.#spawn(c)) this.cars.push(c);
      else this.pool.push(c);
    }
  }

  #spawn(c) {
    const e = this.spawnEdges[Math.floor(this.rng() * this.spawnEdges.length)];
    const s = 4 + this.rng() * Math.max(0, e.len - 8);
    c.edge = e;
    c.s = s;
    c.seg = 0;
    c.shade = 0.55 + this.rng() * 0.4;
    c.speed = this.#limit(e) * (0.6 + 0.3 * this.rng());
    this.#place(c);
    const [sx, sy] = this.route.points[0];
    if (Math.hypot(c.x - sx, c.y - sy) < START_CLEAR) return false;
    for (const o of this.cars) if (Math.abs(o.x - c.x) < 9 && Math.abs(o.y - c.y) < 9) return false;
    return true;
  }

  #limit(e) {
    return Math.min(e.road.maxspeedKmh || 40, 40) / 3.6;
  }

  // Position c on its edge at arc length c.s (with left-lane offset), updating heading & corners.
  #place(c) {
    const p = c.edge.pts;
    if (c.seg >= p.length - 1) c.seg = 0;
    let acc = 0;
    // Walk from the start of the edge (edges are short; cache the running sum per segment).
    let i = 0;
    for (; i < p.length - 2; i++) {
      const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (acc + l >= c.s) break;
      acc += l;
    }
    const a = p[i];
    const b = p[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.max(0, Math.min(1, (c.s - acc) / l));
    const dx = (b[0] - a[0]) / l;
    const dy = (b[1] - a[1]) / l;
    const off = laneOffset(c.edge);
    c.x = a[0] + (b[0] - a[0]) * t + dy * off;
    c.y = a[1] + (b[1] - a[1]) * t - dx * off;
    const h = Math.atan2(dx, -dy);
    if (c.heading === undefined) c.heading = h;
    else c.heading += Math.atan2(Math.sin(h - c.heading), Math.cos(h - c.heading)) * 0.25; // smooth turns
    carCorners(c.x, c.y, c.heading, c.corners);
  }

  update(dt) {
    this.frame++;
    const cars = this.cars;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k];
      const fx = Math.sin(c.heading);
      const fy = -Math.cos(c.heading);
      let gap = Infinity;
      let lead = 0;
      for (let j = 0; j < cars.length; j++) {
        if (j === k) continue;
        const o = cars[j];
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const along = dx * fx + dy * fy;
        if (along <= 0 || along > 50) continue;
        if (Math.abs(dx * fy - dy * fx) > 2.2) continue;
        // Only follow cars going our way; crossing traffic at a junction would otherwise gridlock.
        if (Math.sin(o.heading) * fx - Math.cos(o.heading) * fy < 0.3) continue;
        const g = along - CAR_LENGTH;
        if (g < gap) {
          gap = g;
          lead = o.speed;
        }
      }
      const sig = this.signals.ahead(c.x, c.y, fx, fy, c.sig, 50);
      if (sig && sig.state !== 'green') {
        const stopDist = sig.dist - 3;
        const canStop = stopDist > (c.speed * c.speed) / (2 * IDM_B * 1.5);
        if ((sig.state === 'red' || canStop) && stopDist > -1 && stopDist < gap) {
          gap = Math.max(0.1, stopDist);
          lead = 0;
        }
      }
      const v0 = this.#limit(c.edge);
      const v = c.speed;
      const sStar = IDM_S0 + v * IDM_T + (v * (v - lead)) / (2 * Math.sqrt(IDM_A * IDM_B));
      let acc = IDM_A * (1 - (v / v0) ** 4);
      if (gap < Infinity) acc -= IDM_A * (sStar / Math.max(gap, 0.1)) ** 2;
      c.speed = Math.max(0, v + Math.max(-9, acc) * dt);
      c.s += c.speed * dt;
      // Safety valve: anything stopped for 20 s (not at a red light) is recycled.
      c.stuck = c.speed < 0.2 && !(sig && sig.state !== 'green') ? (c.stuck || 0) + dt : 0;
      if (c.stuck > 20) {
        c.stuck = 0;
        this.#respawn(c);
        continue;
      }

      while (c.s > c.edge.len) {
        c.s -= c.edge.len;
        const next = this.#nextEdge(c.edge);
        if (!next) {
          this.#respawn(c);
          break;
        }
        c.edge = next;
      }
      this.#place(c);
    }

    // Recycle cars that wandered far from the route.
    if (this.frame % 120 === 0) {
      for (const c of cars) if (this.route.distanceTo(c.x, c.y) > SPAWN_RADIUS + 150) this.#respawn(c);
    }
  }

  #nextEdge(e) {
    const outs = this.graph.nodes[e.to].out;
    let options = outs.filter((id) => id !== e.twin && this.graph.edges[id].road.class !== 'service');
    if (!options.length) options = outs.filter((id) => id !== e.twin);
    if (!options.length) return null;
    return this.graph.edges[options[Math.floor(this.rng() * options.length)]];
  }

  #respawn(c) {
    for (let tries = 0; tries < 10; tries++) if (this.#spawn(c)) return;
  }
}
