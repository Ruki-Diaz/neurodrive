// A* routing over the directed road graph, and the Route object cars follow.

export const WAYPOINT_SPACING = 15; // metres

// Australia drives on the left: on two-way streets keep to the left half of the carriageway.
export function laneOffset(edge) {
  return edge.twin >= 0 ? Math.min(edge.road.width / 4, 3.5) : 0;
}

// Polyline shifted `d` metres to the left of its direction of travel (+y is south, so left = (dy, -dx)).
export function offsetLeft(pts, d) {
  if (!d) return pts.map((p) => [p[0], p[1]]);
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + ((b[1] - a[1]) / len) * d, p[1] - ((b[0] - a[0]) / len) * d];
  });
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, key) {
    const a = this.items;
    a.push([key, item]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

// Shortest path from any source node to any target node. Returns edge ids, or null if unreachable.
export function astar(graph, sources, targets) {
  const targetSet = new Set(targets.map((n) => n.id));
  const tx = targets.reduce((s, n) => s + n.x, 0) / targets.length;
  const ty = targets.reduce((s, n) => s + n.y, 0) / targets.length;
  const spread = Math.max(...targets.map((n) => Math.hypot(n.x - tx, n.y - ty)));
  const h = (n) => Math.max(0, Math.hypot(n.x - tx, n.y - ty) - spread); // admissible: cost >= length

  const g = new Map();
  const via = new Map(); // node -> edge id used to reach it
  const open = new MinHeap();
  for (const s of sources) {
    g.set(s.id, 0);
    open.push(s.id, h(s));
  }
  const closed = new Set();
  while (open.size) {
    const id = open.pop();
    if (closed.has(id)) continue;
    closed.add(id);
    if (targetSet.has(id)) {
      const path = [];
      let cur = id;
      while (via.has(cur)) {
        const e = graph.edges[via.get(cur)];
        path.push(e.id);
        cur = e.from;
      }
      return path.reverse();
    }
    const gc = g.get(id);
    for (const eid of graph.nodes[id].out) {
      const e = graph.edges[eid];
      const ng = gc + e.cost;
      if (ng < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, ng);
        via.set(e.to, eid);
        open.push(e.to, ng + h(graph.nodes[e.to]));
      }
    }
  }
  return null;
}

// Route through a list of anchors (each an array of candidate nodes). Each leg continues from the
// exact node the previous leg ended on, so multi-leg routes stay continuous.
export function planRoute(graph, anchors) {
  const edges = [];
  let from = anchors[0];
  for (let i = 1; i < anchors.length; i++) {
    const leg = astar(graph, from, anchors[i]);
    if (!leg) return null;
    edges.push(...leg);
    const last = leg.length ? graph.edges[leg.at(-1)].to : from[0].id;
    from = [graph.nodes[last]];
  }
  if (!edges.length) return null;
  // Concatenate lane-offset edge polylines. At each junction the previous edge's end and the next
  // edge's start (offset differently) are merged into their midpoint to avoid a hook.
  const pts = [];
  for (const eid of edges) {
    const e = graph.edges[eid];
    const lane = offsetLeft(e.pts, laneOffset(e));
    if (pts.length) {
      const q = pts.at(-1);
      q[0] = (q[0] + lane[0][0]) / 2;
      q[1] = (q[1] + lane[0][1]) / 2;
      lane.shift();
    }
    pts.push(...lane);
  }
  return new Route(smooth(dedupe(pts)), edges);
}

function dedupe(pts) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.3);
}

// Chaikin corner cutting (keeps the end points) so turns become arcs instead of point kinks.
function smooth(pts, iterations = 3) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      // Cut at most 4 m from each end so long straight segments stay straight.
      const c = Math.min(0.25, 4 / Math.max(len, 1e-6));
      if (i > 0) out.push([ax + (bx - ax) * c, ay + (by - ay) * c]);
      if (i < p.length - 2) out.push([bx - (bx - ax) * c, by - (by - ay) * c]);
    }
    out.push(p.at(-1));
    p = out;
  }
  return p;
}

export class Route {
  constructor(points, edgeIds = []) {
    this.points = points;
    this.edgeIds = edgeIds;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    this.length = this.cum.at(-1);
    this.waypoints = [];
    this.wpS = [];
    const n = Math.max(1, Math.round(this.length / WAYPOINT_SPACING));
    for (let k = 1; k <= n; k++) {
      const s = (k / n) * this.length;
      this.waypoints.push(this.pointAt(s));
      this.wpS.push(s);
    }
  }

  pointAt(s) {
    const c = this.cum;
    if (s <= 0) return [...this.points[0]];
    if (s >= this.length) return [...this.points.at(-1)];
    let lo = 0;
    let hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid] <= s) lo = mid;
      else hi = mid;
    }
    const t = (s - c[lo]) / (c[hi] - c[lo] || 1);
    const a = this.points[lo];
    const b = this.points[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  // Project (x, y) onto the route, searching segments near `hint` only (cars move forward slowly).
  // Returns { s, dist, seg }.
  project(x, y, hint = 0, back = 1, ahead = 6) {
    const p = this.points;
    const lo = Math.max(0, hint - back);
    const hi = Math.min(p.length - 2, hint + ahead);
    let best = { s: 0, dist: Infinity, seg: hint };
    for (let i = lo; i <= hi; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const L = dx * dx + dy * dy;
      let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (d < best.dist) best = { s: this.cum[i] + t * Math.sqrt(L), dist: d, seg: i };
    }
    return best;
  }

  // Index of the first waypoint at least `minAhead` metres beyond progress s.
  nextWaypoint(s, minAhead = 5) {
    const w = this.wpS;
    let lo = 0;
    let hi = w.length - 1;
    const target = s + minAhead;
    if (w[hi] <= target) return hi;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (w[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  // Distance from (x, y) to the closest route point (coarse; used for traffic spawning).
  distanceTo(x, y) {
    let best = Infinity;
    for (const [px, py] of this.waypoints) best = Math.min(best, (px - x) ** 2 + (py - y) ** 2);
    return Math.sqrt(best);
  }
}
