// Neuroevolution (elitism + mutation) and the DOM-free simulation that runs one scenario.

import { Car } from './car.js';
import { NeuralNetwork } from './network.js';
import { Traffic } from './traffic.js';
import { Signals } from './signals.js';
import { SCENARIOS, buildScenario } from './scenarios.js';

const HISTORY_MAX = 1000;
const MAX_BOOST = 4;
export const ADVANCE_AT = 0.7; // success rate that unlocks the next scenario

export class Evolution {
  constructor({ size = 100, mutation = 0.1, brain = null } = {}) {
    this.size = size;
    this.mutation = mutation;
    this.elite = brain;
    this.parents = brain ? [brain] : []; // elite + next-best brains of the last generation
    this.eliteFitness = -Infinity;
    this.stagnant = 0;
    this.lastSuccess = 0;
  }

  // Replace the gene pool with a single brain (loaded from storage, reset, ...).
  seed(brain) {
    this.elite = brain;
    this.parents = brain ? [brain] : [];
  }

  // The parents (elite + up to 4 runners-up) are kept untouched; everyone else is a mutated copy of
  // one of them. Several parents keep the population from collapsing onto one fragile driver.
  // Mutation strength ramps quadratically from 0.05x to 1.5x the setting (most stay close, a few
  // explore). While nobody arrives and progress stalls, mutation is boosted and random brains mixed
  // in; once cars do arrive, mutation drops to 20% so the policy is refined rather than wrecked.
  brains() {
    const n = this.size;
    if (!this.elite) return Array.from({ length: n }, () => new NeuralNetwork());
    const P = this.parents.length ? this.parents : [this.elite];
    const boost = Math.min(MAX_BOOST, 1 + this.stagnant);
    const refine = this.lastSuccess > 0 ? 0.2 : 1;
    const fresh = this.stagnant ? Math.floor(n * Math.min(0.3, 0.05 * boost)) : 0;
    return Array.from({ length: n }, (_, i) => {
      if (i < P.length) return P[i].clone();
      if (i >= n - fresh) return new NeuralNetwork();
      const k = i / Math.max(1, n - 1);
      const ramp = 0.05 + 1.45 * k * k;
      return P[i % P.length].clone().mutate(Math.min(1, this.mutation * boost * ramp * refine));
    });
  }

  // Pick the next elite. Ties (within 0.5) go to a random car so evolution can drift off plateaus.
  // Stagnation only counts while nobody arrives: once cars reach the destination, small fitness
  // gains (a slightly faster time) are fine and boosting mutation would just wreck a working policy.
  select(cars, timeLimit) {
    let top = -Infinity;
    for (const c of cars) top = Math.max(top, c.fitness(timeLimit));
    const ties = cars.filter((c) => c.fitness(timeLimit) >= top - 0.5);
    const best = ties[Math.floor(Math.random() * ties.length)];
    const arriving = cars.some((c) => c.reached);
    this.lastSuccess = cars.filter((c) => c.reached).length / cars.length;
    this.stagnant = arriving || top > this.eliteFitness + 1 ? 0 : this.stagnant + 1;
    this.elite = best.brain.clone();
    this.eliteFitness = top;
    const ranked = [...cars].sort((a, b) => b.fitness(timeLimit) - a.fitness(timeLimit));
    this.parents = [this.elite, ...ranked.filter((c) => c !== best).slice(0, 4).map((c) => c.brain.clone())];
    return best;
  }

  forgetFitness() {
    // New scenario: old fitness isn't comparable, but keep the brain.
    this.eliteFitness = -Infinity;
    this.stagnant = 0;
    this.lastSuccess = 0;
  }
}

export class Simulation {
  constructor(world, graph, { population = 100, mutation = 0.1, traffic = 0, signalsOn = false, brain = null, seed } = {}) {
    this.world = world;
    this.graph = graph;
    this.evo = new Evolution({ size: population, mutation, brain });
    this.signals = new Signals(world, { enabled: signalsOn });
    this.traffic = new Traffic(world, graph, this.signals);
    this.traffic.density = traffic;
    this.seed = seed ?? ((Math.random() * 2 ** 32) >>> 0);
    this.generation = 1;
    this.history = [];
    this.bestDistance = 0;
    this.success = 0;
    this.cars = [];
    this.leader = null;
    this.alive = 0;
    this.time = 0;
    this.onGeneration = null; // ({generation, best, success, history})
    this.onScenario = null; // ({id})
    this.ctx = { world, route: null, signals: this.signals, traffic: this.traffic.cars };
  }

  setScenario(id, { applyDefaults = true } = {}) {
    const def = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    this.scenario = buildScenario(def, this.world, this.graph);
    this.ctx.route = this.scenario.route;
    if (applyDefaults) {
      this.traffic.density = def.traffic;
      this.signals.enabled = def.signals;
    }
    this.traffic.setRoute(this.scenario.route, this.seed + id);
    this.evo.forgetFitness();
    this.bestDistance = 0;
    this.success = 0;
    this.spawn();
    this.onScenario?.({ id: def.id });
  }

  // Start a generation with the current elite (+ mutants).
  spawn() {
    const { start } = this.scenario;
    this.cars = this.evo.brains().map((b) => new Car(start.x, start.y, start.heading, b));
    this.leader = this.cars[0];
    this.alive = this.cars.length;
    this.time = 0;
    this.signals.reset();
    this.traffic.reset();
  }

  step(dt) {
    this.time += dt;
    this.signals.update(dt);
    this.traffic.update(dt);
    let alive = 0;
    let leader = null;
    for (const car of this.cars) {
      car.update(dt, this.ctx);
      if (car.alive) {
        alive++;
        if (!leader || car.maxProgress > leader.maxProgress) leader = car;
      }
    }
    this.alive = alive;
    if (leader) this.leader = leader;
    else if (!this.leader || this.leader.alive) this.leader = this.#bestByProgress();
    if (this.leader.maxProgress > this.bestDistance) this.bestDistance = this.leader.maxProgress;

    if (alive === 0 || this.time >= this.scenario.timeLimit) this.endGeneration();
  }

  #bestByProgress() {
    let best = this.cars[0];
    for (const c of this.cars) {
      if (c.reached > best.reached || (c.reached === best.reached && c.maxProgress > best.maxProgress)) best = c;
    }
    return best;
  }

  endGeneration() {
    const limit = this.scenario.timeLimit;
    for (const c of this.cars) if (c.alive) c.retire('timeout');
    const reached = this.cars.filter((c) => c.reached).length;
    this.success = reached / this.cars.length;
    const best = this.evo.select(this.cars, limit);
    const bestProgress = Math.round(Math.max(...this.cars.map((c) => c.maxProgress)));
    this.history.push(bestProgress);
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.generation++;
    this.onGeneration?.({ generation: this.generation, best: bestProgress, success: this.success, history: this.history, bestCar: best });

    const id = this.scenario.def.id;
    if (this.success >= ADVANCE_AT && id < SCENARIOS.length) this.setScenario(id + 1);
    else this.spawn();
  }

  // Restart the current generation (e.g. population changed), keeping the leader if it's better.
  restart() {
    const l = this.leader;
    if (l && (!this.evo.elite || l.fitness(this.scenario.timeLimit) > this.evo.eliteFitness)) {
      this.evo.seed(l.brain.clone());
    }
    this.spawn();
  }

  reset() {
    this.evo.seed(null);
    this.evo.forgetFitness();
    this.generation = 1;
    this.history.length = 0;
    this.bestDistance = 0;
    this.success = 0;
    this.seed = (Math.random() * 2 ** 32) >>> 0;
    this.setScenario(this.scenario.def.id, { applyDefaults: false });
  }
}
