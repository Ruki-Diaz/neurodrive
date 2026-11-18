// Engine entry: loads the Melbourne CBD world, runs the simulation loop on #road (map via
// window.MapView, cars drawn by the engine), the network visualizer on #network, and exposes
// window.NeuroDrive exactly as described in SPEC.md.

import { loadWorld } from './world.js';
import { Graph } from './graph.js';
import { Simulation } from './evolution.js';
import { scenarioList } from './scenarios.js';
import { NeuralNetwork, drawNetwork, palette, fitCanvas } from './network.js';
import { drawCar } from './car.js';

const STORAGE_KEY = 'neurodrive.brain.v2';
const DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const STATS_MS = 100;
const FOLLOW_SPAN = 110; // metres visible across the shorter canvas side in follow mode

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- Events ---------------------------------------------------------------

const listeners = new Map();
function on(event, fn) {
  if (typeof fn !== 'function') return () => {};
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[NeuroDrive] '${event}' listener failed`, err);
    }
  }
}

// ---- Storage --------------------------------------------------------------

function readSavedBrain() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? NeuralNetwork.fromJSON(raw) : null;
  } catch {
    return null; // missing, corrupt, wrong shape or storage blocked
  }
}

// ---- State (shape per SPEC.md) --------------------------------------------

const state = {
  generation: 1,
  alive: 0,
  population: 100,
  bestDistance: 0, // m progressed along the route (best this scenario)
  history: [], // best m progressed, per finished generation
  paused: false,
  mutation: 0.1,
  traffic: 0,
  signalsOn: false,
  scenarioId: 1,
  success: 0, // fraction of cars that reached the destination last generation
  car: { x: 0, y: 0, headingDeg: 0, speedKmh: 0, street: '', limitKmh: 40, routeProgress: 0 },
  route: [],
  destination: null,
  scenarios: scenarioList(),
};

let sim = null; // created once the world JSON has loaded
let worldData = null;
let view = 'follow';
let userZoom = 1;
const cam = { x: 0, y: 0, zoom: 4, rotation: 0, w: 1, h: 1 };
let camReady = false;

function sync() {
  if (!sim) return;
  state.generation = sim.generation;
  state.alive = sim.alive;
  state.population = sim.evo.size;
  state.bestDistance = Math.round(sim.bestDistance);
  state.mutation = sim.evo.mutation;
  state.traffic = sim.traffic.density;
  state.signalsOn = sim.signals.enabled;
  state.scenarioId = sim.scenario.def.id;
  state.success = sim.success;
  const l = sim.leader;
  if (l) {
    const c = state.car;
    c.x = Math.round(l.x * 10) / 10;
    c.y = Math.round(l.y * 10) / 10;
    c.headingDeg = Math.round((((l.heading * 180) / Math.PI) % 360 + 360) % 360);
    c.speedKmh = Math.round(l.speed * 3.6);
    c.street = l.street?.name || c.street || '';
    c.limitKmh = Math.min(l.street?.maxspeedKmh || 40, 40);
    c.routeProgress = clamp(l.maxProgress / sim.scenario.route.length, 0, 1);
  }
}

function syncScenario() {
  state.route = sim.scenario.route.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const d = sim.scenario.destination;
  state.destination = { name: d.name, x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 };
  state.history = sim.history;
  camReady = false;
}

function emitStats() {
  sync();
  emit('stats', state);
}

// ---- Simulation loop ------------------------------------------------------

const roadCanvas = document.getElementById('road');
const netCanvas = document.getElementById('network');
const netCtx = netCanvas?.getContext('2d');

let last = performance.now();
let acc = 0;
let lastStats = 0;
let frameCount = 0;

function loop(now) {
  const elapsed = Math.min(250, now - last);
  last = now;
  frameCount++;
  if (sim && !state.paused) {
    acc += elapsed / 1000;
    let n = 0;
    while (acc >= DT && n < MAX_STEPS_PER_FRAME) {
      sim.step(DT);
      acc -= DT;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) acc = 0; // drop the backlog rather than spiral
  }
  try {
    if (roadCanvas) render(elapsed / 1000);
    if (netCtx && (frameCount & 1) === 0) drawNetwork(netCtx, sim?.leader?.brain, { time: now / 1000 });
  } catch (err) {
    console.error('[NeuroDrive] render failed', err);
  }
  if (now - lastStats >= STATS_MS) {
    lastStats = now;
    emitStats();
  }
  requestAnimationFrame(loop);
}

// ---- Camera & rendering ---------------------------------------------------

let mapViewReady = false;

function ensureMapView() {
  const mv = window.MapView;
  if (!mv || !worldData) return false;
  if (!mapViewReady) {
    try {
      mv.init(worldData);
      mapViewReady = true;
    } catch (err) {
      console.error('[NeuroDrive] MapView.init failed, using fallback renderer', err);
      window.MapView = undefined;
      return false;
    }
  }
  return true;
}

function updateCamera(dt, w, h) {
  cam.w = w;
  cam.h = h;
  let tx = 0;
  let ty = 0;
  let tz = 1;
  if (sim && view === 'follow' && sim.leader) {
    const l = sim.leader;
    // Look a little ahead of the car so more of the road in front is visible.
    tx = l.x + Math.sin(l.heading) * 12;
    ty = l.y - Math.cos(l.heading) * 12;
    tz = (Math.min(w, h) / FOLLOW_SPAN) * userZoom;
  } else if (sim) {
    const pts = sim.scenario.route.points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    tx = (minX + maxX) / 2;
    ty = (minY + maxY) / 2;
    tz = Math.min(w / (maxX - minX + 240), h / (maxY - minY + 240)) * userZoom;
  }
  tz = clamp(tz, 0.15, 30);
  if (!camReady) {
    cam.x = tx;
    cam.y = ty;
    cam.zoom = tz;
    camReady = true;
    return;
  }
  const k = 1 - Math.exp(-dt * 5); // frame-rate independent smoothing
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom *= Math.pow(tz / cam.zoom, k);
}

function render(dt) {
  const pal = palette();
  const { w, h, dpr, ctx } = fitCanvas(roadCanvas);
  updateCamera(dt, w, h);
  const hasMap = ensureMapView();

  // MapView expects a context in CSS pixels (devicePixelRatio already applied) and applies cam itself.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (hasMap) window.MapView.drawBase(ctx, cam);
  else fallbackBase(ctx, pal);

  if (sim) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawVehicles(ctx, pal, w, h);
    ctx.restore();
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hud = sim
    ? { route: state.route, signals: sim.signals.hud(), destination: state.destination, car: state.car }
    : { route: [], signals: [], destination: null };
  if (hasMap) window.MapView.drawOverlay(ctx, cam, hud);
  else fallbackOverlay(ctx, pal, hud);
}

function drawVehicles(ctx, pal, w, h) {
  const half = Math.hypot(w, h) / (2 * cam.zoom) + 10;
  const visible = (o) => Math.abs(o.x - cam.x) < half && Math.abs(o.y - cam.y) < half;
  const tiny = cam.zoom < 1.5; // overview: cars would be sub-pixel, draw dots instead
  const dot = (x, y, r, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r / cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const t of sim.traffic.cars) {
    if (!visible(t)) continue;
    if (tiny) dot(t.x, t.y, 1.6, '#ffffff', t.shade * 0.8);
    else drawCar(ctx, t.x, t.y, t.heading, '#ffffff', t.shade);
  }
  const leader = sim.leader;
  for (const c of sim.cars) {
    if (!c.alive || c === leader || !visible(c)) continue;
    if (tiny) dot(c.x, c.y, 1.6, pal.indigo, 0.35);
    else drawCar(ctx, c.x, c.y, c.heading, pal.indigo, 0.25);
  }
  if (leader) {
    ctx.globalAlpha = 1;
    if (!tiny) leader.sensor.draw(ctx, pal.mint, 1 / cam.zoom);
    if (tiny) dot(leader.x, leader.y, 4, pal.mint, 1);
    else drawCar(ctx, leader.x, leader.y, leader.heading, pal.mint, 1, 14);
  }
  ctx.globalAlpha = 1;
}

// Plain renderer used only when js/mapview.js isn't loaded (lets the engine be tested alone).
let fallbackPath = null;
function fallbackBase(ctx, pal) {
  ctx.fillStyle = pal.onyx;
  ctx.fillRect(0, 0, cam.w, cam.h);
  if (!worldData) return;
  if (!fallbackPath) {
    fallbackPath = worldData.roads.map((r) => {
      const p = new Path2D();
      r.points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      return { p, width: r.width };
    });
  }
  ctx.save();
  ctx.translate(cam.w / 2, cam.h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.indigo;
  ctx.globalAlpha = 0.3;
  for (const r of fallbackPath) {
    ctx.lineWidth = r.width;
    ctx.stroke(r.p);
  }
  ctx.restore();
}

function fallbackOverlay(ctx, pal, hud) {
  ctx.save();
  ctx.translate(cam.w / 2, cam.h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  if (hud.route.length > 1) {
    ctx.strokeStyle = pal.mint;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2 / cam.zoom;
    ctx.setLineDash([8 / cam.zoom, 6 / cam.zoom]);
    ctx.beginPath();
    hud.route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const colors = { green: pal.mint, amber: '#ffffff', red: pal.indigo };
  for (const s of hud.signals) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = colors[s.state];
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3 / cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hud.destination) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.mint;
    ctx.beginPath();
    ctx.arc(hud.destination.x, hud.destination.y, 6 / cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Public API -----------------------------------------------------------

function whenReady(fn) {
  return (...args) => {
    if (!sim) {
      pending.push(() => fn(...args));
      return undefined;
    }
    return fn(...args);
  };
}
const pending = [];

const actions = {
  start() {
    state.paused = false;
    emitStats();
  },
  pause() {
    state.paused = true;
    emitStats();
  },
  reset: whenReady(() => {
    sim.reset();
    emitStats();
    emit('generation', { generation: sim.generation, best: 0, success: 0, history: sim.history });
  }),
  saveBrain() {
    const brain = sim?.evo.elite || sim?.leader?.brain;
    let ok = false;
    try {
      if (brain) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(brain.toJSON()));
        ok = true;
      }
    } catch (err) {
      console.warn('[NeuroDrive] could not save brain', err);
    }
    emit('brain', { action: 'saved', ok });
    return ok;
  },
  loadBrain: whenReady(() => {
    const brain = readSavedBrain();
    if (brain) {
      sim.evo.seed(brain);
      sim.evo.forgetFitness();
      sim.spawn();
      emitStats();
    }
    emit('brain', { action: 'loaded', ok: !!brain });
    return !!brain;
  }),
  discardBrain() {
    let ok = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      ok = false;
    }
    emit('brain', { action: 'discarded', ok });
    return ok;
  },
  setMutation(v) {
    state.mutation = clamp(Number(v) || 0, 0, 1);
    if (sim) sim.evo.mutation = state.mutation; // applies from the next generation
    emitStats();
  },
  setPopulation: whenReady((n) => {
    sim.evo.size = clamp(Math.round(Number(n)) || 100, 1, 500);
    sim.restart();
    emitStats();
  }),
  setTraffic(v) {
    state.traffic = clamp(Number(v) || 0, 0, 1);
    if (sim) sim.traffic.setDensity(state.traffic);
    emitStats();
  },
  setSignals(on) {
    state.signalsOn = Boolean(on);
    if (sim) sim.signals.enabled = state.signalsOn;
    emitStats();
  },
  setScenario: whenReady((id) => {
    sim.setScenario(Number(id)); // fires 'scenario' via sim.onScenario
    emitStats();
  }),
  setView(mode) {
    view = mode === 'overview' ? 'overview' : 'follow';
    userZoom = 1;
  },
  zoom(delta) {
    userZoom = clamp(userZoom * Math.pow(1.25, Number(delta) || 0), 0.2, 6);
  },
};

window.NeuroDrive = { state, on, actions };

// ---- Boot -----------------------------------------------------------------

async function boot() {
  try {
    const world = await loadWorld('data/melbourne-cbd.json');
    worldData = world.data;
    const graph = new Graph(world);
    const saved = readSavedBrain();
    sim = new Simulation(world, graph, {
      population: state.population,
      mutation: state.mutation,
      brain: saved,
    });
    sim.onScenario = ({ id }) => {
      syncScenario();
      sync();
      emit('scenario', { id });
    };
    sim.onGeneration = ({ generation, best, success, history }) => {
      sync();
      emit('generation', { generation, best, success, history });
    };
    sim.setScenario(state.scenarioId);
    if (saved) emit('brain', { action: 'loaded', ok: true });
    while (pending.length) pending.shift()();
    emitStats();
  } catch (err) {
    console.error('[NeuroDrive] failed to start the engine', err);
  }
}

if (!roadCanvas) console.warn('[NeuroDrive] #road canvas not found; simulation runs without rendering.');
boot();
requestAnimationFrame(loop);
