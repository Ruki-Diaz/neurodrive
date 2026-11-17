import { Car } from './car.js';

const INF = 1e7;
export const START_Y = 0;
export const TRAFFIC_SPEED = 2;
const SPAWN_AHEAD = 1200; // world units ahead of the leader where traffic rows appear
const CULL_BEHIND = 500;

const lerp = (a, b, t) => a + (b - a) * t;

// Small seeded RNG so every generation faces the same traffic layout (fair comparison).
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

export class Road {
  constructor(lanes = 3, laneWidth = 70) {
    this.laneWidth = laneWidth;
    this.setLanes(lanes);
  }

  setLanes(n) {
    this.lanes = Math.max(2, Math.min(5, Math.round(Number(n)) || 3));
    this.width = this.lanes * this.laneWidth;
    this.left = -this.width / 2;
    this.right = this.width / 2;
    this.borders = [
      [{ x: this.left, y: -INF }, { x: this.left, y: INF }],
      [{ x: this.right, y: -INF }, { x: this.right, y: INF }],
    ];
  }

  laneCenter(i) {
    const lane = Math.max(0, Math.min(this.lanes - 1, i));
    return this.left + this.laneWidth * (lane + 0.5);
  }

  draw(ctx, top, bottom, pal) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = pal.indigo;
    ctx.fillRect(this.left, top, this.width, bottom - top);

    // Dash phase is anchored to world y so lane markings scroll with the camera.
    const period = 44;
    const start = Math.floor(top / period) * period;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, period - 20]);
    for (let i = 1; i < this.lanes; i++) {
      const x = this.left + i * this.laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, start);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = pal.indigo;
    ctx.shadowColor = pal.indigo;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 4;
    for (const [a, b] of this.borders) {
      ctx.beginPath();
      ctx.moveTo(a.x, top);
      ctx.lineTo(b.x, bottom);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class Traffic {
  constructor(road, { density = 0.5, seed = 1 } = {}) {
    this.road = road;
    this.density = density;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.cars = [];
    this.nextRowY0 = START_Y - 380; // row position at frame 0
  }

  get gap() {
    return lerp(560, 190, this.density);
  }

  update(frame, leaderY, rearY) {
    // Rows are defined by their frame-0 position so layout is identical regardless of spawn timing.
    while (this.nextRowY0 - TRAFFIC_SPEED * frame > leaderY - SPAWN_AHEAD) {
      const y = this.nextRowY0 - TRAFFIC_SPEED * frame;
      // Skip rows that would appear right on top of the cars (e.g. density raised from 0 mid-run).
      if (this.density > 0 && y < leaderY - 250) this.#spawnRow(y);
      this.nextRowY0 -= this.gap;
    }
    for (const c of this.cars) c.update();
    const limit = rearY + CULL_BEHIND;
    if (this.cars.some((c) => c.y > limit)) this.cars = this.cars.filter((c) => c.y <= limit);
  }

  #spawnRow(y) {
    const { lanes } = this.road;
    const order = Array.from({ length: lanes }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const count = 1 + Math.floor(this.rng() * (lanes - 1)); // always leave at least one lane open
    for (let k = 0; k < count; k++) {
      const car = new Car(this.road.laneCenter(order[k]), y + (this.rng() - 0.5) * 40, {
        type: 'dummy',
        maxSpeed: TRAFFIC_SPEED,
      });
      car.shade = 0.55 + this.rng() * 0.4;
      this.cars.push(car);
    }
  }

  draw(ctx, top, bottom) {
    for (const c of this.cars) {
      if (c.y < top - c.height || c.y > bottom + c.height) continue;
      c.draw(ctx, '#ffffff', c.shade);
    }
  }
}
