import { Car } from './car.js';
import { NeuralNetwork } from './network.js';
import { START_Y } from './road.js';

const LAG_LIMIT = 900; // cars this far behind the leader are retired
const HISTORY_MAX = 1000;
const MAX_BOOST = 4;

export const toMeters = (units) => Math.round(units / 10);

export class Evolution {
  constructor({ size = 100, mutation = 0.1, brain = null, immigrants = 0.1 } = {}) {
    this.size = size;
    this.immigrants = immigrants; // fraction of fresh random brains each generation (keeps diversity)
    this.mutation = mutation;
    this.elite = brain;
    this.eliteDistance = 0;
    this.stagnant = 0; // generations without a new best; drives adaptive mutation
    this.generation = 1;
    this.history = [];
    this.bestDistance = 0; // all-time, world units
    this.cars = [];
    this.alive = 0;
    this.leader = null;
    this.rearY = START_Y;
  }

  // Car 0 gets the elite brain untouched; everyone else gets a mutated copy. Mutation strength
  // ramps from 0.25x to 2x the setting across the population: small tweaks refine, big ones explore.
  // While progress stalls, both mutation and the share of fresh random brains are boosted.
  populate(road) {
    const x = road.laneCenter(Math.floor(road.lanes / 2));
    const n = this.size;
    const boost = Math.min(MAX_BOOST, 1 + this.stagnant);
    const rate = this.mutation * boost;
    const fresh = Math.floor(n * Math.min(0.4, this.immigrants * boost));
    this.cars = Array.from({ length: n }, (_, i) => {
      let brain;
      if (!this.elite || (i > 0 && i >= n - fresh)) brain = new NeuralNetwork();
      else {
        brain = this.elite.clone();
        if (i > 0) brain.mutate(Math.min(1, rate * (0.25 + (1.75 * i) / Math.max(1, n - 1))));
      }
      return new Car(x, START_Y, { brain });
    });
    this.alive = this.cars.length;
    this.leader = this.cars[0];
    this.rearY = START_Y;
  }

  update(borders, traffic) {
    for (const car of this.cars) car.update(borders, traffic);

    let leader = null;
    for (const car of this.cars) {
      if (!car.damaged && (!leader || car.distance > leader.distance)) leader = car;
    }

    let alive = 0;
    let rear = -Infinity;
    for (const car of this.cars) {
      if (car.damaged) continue;
      if (leader && car.y - leader.y > LAG_LIMIT) {
        car.damaged = true;
        continue;
      }
      alive++;
      if (car.y > rear) rear = car.y;
    }

    this.alive = alive;
    this.leader = leader || this.best();
    this.rearY = alive ? rear : this.leader.y;
    if (this.leader.distance > this.bestDistance) this.bestDistance = this.leader.distance;
  }

  best() {
    let best = this.cars[0];
    for (const car of this.cars) if (car.distance > best.distance) best = car;
    return best;
  }

  // Like best(), but ties go to a random car. Many brains often die at the same spot; always
  // keeping the old elite there would freeze evolution on a plateau.
  #pickElite() {
    const top = this.best().distance;
    const ties = this.cars.filter((c) => c.distance >= top - 1);
    return ties[Math.floor(Math.random() * ties.length)];
  }

  evolve(road) {
    const best = this.#pickElite();
    this.history.push(toMeters(best.distance));
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.stagnant = this.elite && best.distance < this.eliteDistance + 10 ? this.stagnant + 1 : 0;
    this.elite = best.brain.clone();
    this.eliteDistance = best.distance;
    this.generation++;
    this.populate(road);
    return best;
  }

  // Keep the current leader as elite when restarting mid-generation, if it's at least as good.
  adoptLeader() {
    const l = this.leader;
    if (l && l.brain && (!this.elite || l.distance >= this.eliteDistance)) {
      this.elite = l.brain.clone();
      this.eliteDistance = l.distance;
    }
  }

  reset(brain = null) {
    this.elite = brain;
    this.eliteDistance = 0;
    this.stagnant = 0;
    this.generation = 1;
    this.history.length = 0; // keep array identity for consumers holding a reference
    this.bestDistance = 0;
  }
}
