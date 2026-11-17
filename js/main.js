// Engine entry: game loop on #road, visualizer on #network, public API on window.NeuroDrive.
import { Road, Traffic, START_Y } from './road.js';
import { Evolution, toMeters } from './evolution.js';
import { NeuralNetwork, drawNetwork, palette, fitCanvas } from './network.js';

const STORAGE_KEY = 'neurodrive.brain';
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;
const STATS_MS = 100;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

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
    return null; // missing, corrupt, or storage blocked
  }
}

// ---- World ----------------------------------------------------------------

const state = {
  generation: 1,
  alive: 0,
  population: 100,
  bestDistance: 0, // metres (1 m = 10 world units)
  history: [], // best distance (metres) of each finished generation
  paused: false,
  mutation: 0.1,
  lanes: 3,
  traffic: 0.5,
};

const road = new Road(state.lanes);
const traffic = new Traffic(road, { density: state.traffic, seed: newSeed() });
const evo = new Evolution({ size: state.population, mutation: state.mutation, brain: readSavedBrain() });
state.history = evo.history;

let frame = 0;
let camY = START_Y;

function sync() {
  state.generation = evo.generation;
  state.alive = evo.alive;
  state.population = evo.size;
  state.bestDistance = toMeters(evo.bestDistance);
  state.mutation = evo.mutation;
  state.lanes = road.lanes;
  state.traffic = traffic.density;
}

function emitStats() {
  sync();
  emit('stats', state);
}

function restartGeneration() {
  traffic.reset();
  evo.populate(road);
  frame = 0;
  emitStats();
}

function step() {
  frame++;
  traffic.update(frame, evo.leader.y, evo.rearY);
  evo.update(road.borders, traffic.cars);
  if (evo.alive === 0) {
    const best = evo.evolve(road);
    traffic.reset();
    frame = 0;
    sync();
    emit('generation', { generation: state.generation, best: toMeters(best.distance), history: state.history });
  }
}

// ---- Rendering ------------------------------------------------------------

const roadCanvas = document.getElementById('road');
const netCanvas = document.getElementById('network');
const netCtx = netCanvas?.getContext('2d');

function renderRoad() {
  const pal = palette();
  const { w, h, ctx } = fitCanvas(roadCanvas);
  ctx.fillStyle = pal.onyx;
  ctx.fillRect(0, 0, w, h);

  const leader = evo.leader;
  const target = leader ? leader.y : START_Y;
  camY = Math.abs(target - camY) > 600 ? target : camY + (target - camY) * 0.2;

  const scale = Math.min(w / (road.width + 120), h / 560);
  const anchor = h * 0.72; // leader sits low on screen so you see what's ahead
  const top = camY - anchor / scale;
  const bottom = camY + (h - anchor) / scale;

  ctx.save();
  ctx.translate(w / 2, anchor);
  ctx.scale(scale, scale);
  ctx.translate(0, -camY);

  road.draw(ctx, top, bottom, pal);
  traffic.draw(ctx, top, bottom);
  for (const car of evo.cars) {
    if (car === leader || car.damaged || car.y < top - 60 || car.y > bottom + 60) continue;
    car.draw(ctx, pal.indigo, 0.25);
  }
  if (leader) leader.draw(ctx, pal.mint, 1, { sensor: true, glow: true });
  ctx.restore();
}

let last = performance.now();
let acc = 0;
let lastStats = 0;

function loop(now) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!state.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP_MS && n < MAX_STEPS_PER_FRAME) {
      step();
      acc -= STEP_MS;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) acc = 0; // drop backlog instead of spiralling
  }
  if (roadCanvas) renderRoad();
  if (netCtx) drawNetwork(netCtx, evo.leader?.brain, { time: now / 1000 });
  if (now - lastStats >= STATS_MS) {
    lastStats = now;
    emitStats();
  }
  requestAnimationFrame(loop);
}

// ---- Public API -----------------------------------------------------------

const actions = {
  start() {
    state.paused = false;
    emitStats();
  },
  pause() {
    state.paused = true;
    emitStats();
  },
  reset() {
    evo.reset(null);
    traffic.reset(newSeed());
    camY = START_Y;
    restartGeneration();
    emit('generation', { generation: state.generation, best: 0, history: state.history });
  },
  saveBrain() {
    const brain = evo.leader?.brain;
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
  loadBrain() {
    const brain = readSavedBrain();
    if (brain) {
      evo.elite = brain;
      evo.eliteDistance = 0;
      restartGeneration();
    }
    emit('brain', { action: 'loaded', ok: !!brain });
    return !!brain;
  },
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
    evo.mutation = clamp(Number(v) || 0, 0, 1); // applies from the next generation
    emitStats();
  },
  setPopulation(n) {
    evo.size = clamp(Math.round(Number(n)) || 100, 1, 1000);
    evo.adoptLeader();
    restartGeneration();
  },
  setLanes(n) {
    road.setLanes(n);
    evo.adoptLeader();
    restartGeneration();
  },
  setTraffic(v) {
    traffic.density = clamp(Number(v) || 0, 0, 1);
    emitStats();
  },
};

window.NeuroDrive = { state, on, actions };

if (!roadCanvas) console.warn('[NeuroDrive] #road canvas not found; simulation runs without rendering.');
evo.populate(road);
sync();
requestAnimationFrame(loop);
