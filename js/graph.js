// Directed road graph built from OSM polylines. Nodes are points shared by 2+ roads (junctions)
// plus road endpoints; each road is split at its junctions. One-way roads get a single forward
// edge (fetch-osm already normalises oneway=-1), two-way roads get an edge in each direction.

// Route cost multiplier by class, so A* prefers real streets over service lanes.
const CLASS_COST = {
  motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1.05, unclassified: 1.25,
  residential: 1.3, living_street: 2, service: 2,
};

const polyLen = (pts) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

export class Graph {
  constructor(world) {
    this.nodes = []; // { id, x, y, out: [edgeId], in: [edgeId], roads: Set<name> }
    this.edges = []; // { id, from, to, pts, len, cost, road, twin }
    const key = (p) => p[0] + ',' + p[1];
    const use = new Map();
    for (const r of world.roads) {
      const seen = new Set();
      for (const p of r.points) {
        const k = key(p);
        if (seen.has(k)) continue;
        seen.add(k);
        use.set(k, (use.get(k) || 0) + 1);
      }
    }
    const nodeAt = new Map();
    const getNode = (p) => {
      const k = key(p);
      let id = nodeAt.get(k);
      if (id === undefined) {
        id = this.nodes.length;
        nodeAt.set(k, id);
        this.nodes.push({ id, x: p[0], y: p[1], out: [], in: [], roads: new Set() });
      }
      return id;
    };

    for (const road of world.roads) {
      const p = road.points;
      let start = 0;
      for (let i = 1; i < p.length; i++) {
        const isNode = i === p.length - 1 || use.get(key(p[i])) > 1;
        if (!isNode) continue;
        const pts = p.slice(start, i + 1);
        const a = getNode(p[start]);
        const b = getNode(p[i]);
        start = i;
        if (a === b) continue;
        this.nodes[a].roads.add(road.name);
        this.nodes[b].roads.add(road.name);
        const fwd = this.#addEdge(a, b, pts, road);
        if (!road.oneway) {
          const back = this.#addEdge(b, a, [...pts].reverse(), road);
          fwd.twin = back.id;
          back.twin = fwd.id;
        }
      }
    }
  }

  #addEdge(from, to, pts, road) {
    const len = polyLen(pts);
    const mult = CLASS_COST[road.class.replace('_link', '')] ?? 1.5;
    const e = { id: this.edges.length, from, to, pts, len, cost: len * mult, road, twin: -1 };
    this.edges.push(e);
    this.nodes[from].out.push(e.id);
    this.nodes[to].in.push(e.id);
    return e;
  }

  // Junction nodes where the streets named `a` and `b` meet (dual carriageways give several).
  intersection(a, b) {
    return this.nodes.filter((n) => n.roads.has(a) && n.roads.has(b));
  }

  // Drivable nodes on named streets near (x, y): the nearest one plus any within `spread` m of it.
  nodesNear(x, y, spread = 25) {
    const ok = (n) => n.out.length && n.in.length && [...n.roads].some((r) => r);
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (!ok(n)) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best) return [];
    return this.nodes.filter((n) => ok(n) && Math.hypot(n.x - best.x, n.y - best.y) <= spread);
  }
}
