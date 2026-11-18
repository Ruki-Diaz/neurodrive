// Learner car: metric kinematic bicycle model driven by a neural network.
// Heading is a compass bearing in radians (0 = north, clockwise); forward = (sin h, -cos h).

import { Sensor } from './sensor.js';
import { NeuralNetwork } from './network.js';
import { SIGNAL_RANGE } from './signals.js';

export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.9;
export const WHEELBASE = 2.7;
export const VMAX = 40 / 3.6; // CBD limit, m/s

const ACCEL = 3.0; // m/s² full throttle
const BRAKE = 7.0; // m/s² full brake
const ROLL = 0.3; // m/s² rolling resistance
// Aerodynamic-style drag (∝ v²) calibrated so full throttle tops out exactly at the 40 km/h limit.
// Cruise speed is then a smooth function of the pedal (80% ≈ 35 km/h, 60% ≈ 29 km/h), which gives
// evolution a gradient towards "slow down for corners" instead of an all-or-nothing throttle.
const DRAG_K = (ACCEL - ROLL) / (VMAX * VMAX);
const MAX_STEER = 0.6; // rad, at walking pace
const A_LAT = 8; // m/s² lateral grip limit (~0.8 g) -> steering lock shrinks with speed
const STEER_RATE = 2.0; // rad/s
const OFF_ROUTE = 15; // m from the planned route = took a wrong turn
const STALL_TIME = 3; // s stopped for no reason
const NO_PROGRESS_TIME = 15; // s without gaining route progress

export const PENALTY = { offroad: 30, collision: 50, wrongway: 60, red: 100, stall: 20, lost: 20 };

export function maxSteer(v) {
  return Math.min(MAX_STEER, Math.atan((WHEELBASE * A_LAT) / Math.max(v * v, 0.01)));
}

// Writes the 4 corners (x0,y0,..x3,y3: front-left, front-right, rear-right, rear-left) into out.
export function carCorners(x, y, h, out, len = CAR_LENGTH, wid = CAR_WIDTH) {
  const fx = Math.sin(h) * (len / 2);
  const fy = -Math.cos(h) * (len / 2);
  const rx = Math.cos(h) * (wid / 2);
  const ry = Math.sin(h) * (wid / 2);
  out[0] = x + fx - rx; out[1] = y + fy - ry;
  out[2] = x + fx + rx; out[3] = y + fy + ry;
  out[4] = x - fx + rx; out[5] = y - fy + ry;
  out[6] = x - fx - rx; out[7] = y - fy - ry;
  return out;
}

// Separating-axis test for two convex quads given as corner arrays.
export function quadsOverlap(a, b) {
  for (const q of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const ax = q[(i + 1) * 2] - q[i * 2];
      const ay = q[(i + 1) * 2 + 1] - q[i * 2 + 1];
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (let j = 0; j < 4; j++) {
        const pa = a[j * 2] * ax + a[j * 2 + 1] * ay;
        const pb = b[j * 2] * ax + b[j * 2 + 1] * ay;
        if (pa < amin) amin = pa;
        if (pa > amax) amax = pa;
        if (pb < bmin) bmin = pb;
        if (pb > bmax) bmax = pb;
      }
      if (amax < bmin || bmax < amin) return false;
    }
  }
  return true;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Car {
  constructor(x, y, heading, brain = null) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.brain = brain || new NeuralNetwork();
    this.sensor = new Sensor(this);
    this.corners = carCorners(x, y, heading, new Float64Array(8));
    this.inputs = new Float64Array(12);

    this.alive = true; // still driving
    this.reached = false;
    this.reason = '';
    this.time = 0;
    this.progress = 0;
    this.maxProgress = 0;
    this.lastGain = 0;
    this.seg = 0;
    this.stallT = 0;
    this.penalty = 0;
    this.frame = 0;
    this.sig = { i: -1, dist: 0, state: 'green' };
    this.prevSig = -1;
    this.prevSigState = 'green';
    this.street = null; // nearest road object (refreshed every 10 frames)
  }

  retire(reason) {
    this.alive = false;
    this.reason = reason;
    this.penalty += PENALTY[reason] || 0;
  }

  fitness(timeLimit) {
    let f = this.maxProgress - this.penalty;
    // Small time bonus only: a big one rewards the most aggressive (and most fragile) drivers.
    if (this.reached) f += 1000 + Math.max(0, timeLimit - this.time);
    return f;
  }

  // sim: { world, route, signals, traffic: TrafficCar[] }
  update(dt, sim) {
    if (!this.alive) return;
    this.time += dt;
    this.frame++;
    const { world, route, signals, traffic } = sim;
    const fx = Math.sin(this.heading);
    const fy = -Math.cos(this.heading);

    // ---- sense ----
    this.sensor.update(world, traffic);
    const inp = this.inputs;
    for (let i = 0; i < 7; i++) inp[i] = this.sensor.proximity[i];
    inp[7] = this.speed / VMAX;
    // Next waypoint: interpolated route point 5 m + 0.6 s ahead (smoother than jumping between the
    // 15 m waypoints, and far enough ahead at speed for a corner to show up in time to brake).
    const wp = route.pointAt(this.progress + 5 + this.speed * 0.6);
    const rel = wrapAngle(Math.atan2(wp[0] - this.x, -(wp[1] - this.y)) - this.heading);
    inp[8] = Math.sin(rel);
    inp[9] = Math.cos(rel);
    const sig = signals.ahead(this.x, this.y, fx, fy, this.sig);
    inp[10] = sig ? 1 - sig.dist / SIGNAL_RANGE : 0;
    inp[11] = !sig ? 0 : sig.state === 'red' ? 1 : sig.state === 'amber' ? 0.5 : 0;

    // ---- act ----
    const out = this.brain.feedForward(inp);
    const target = out[0] * maxSteer(this.speed);
    const ds = STEER_RATE * dt;
    this.steer += Math.max(-ds, Math.min(ds, target - this.steer));
    const pedal = out[1];
    const acc = (pedal >= 0 ? ACCEL * pedal : BRAKE * pedal) - ROLL - DRAG_K * this.speed * this.speed;
    // Speed limiter: the street's posted limit, never above the 40 km/h CBD limit.
    const limit = Math.min(VMAX, (this.street?.maxspeedKmh || 40) / 3.6);
    this.speed = Math.max(0, Math.min(limit, this.speed + acc * dt));
    this.heading += (this.speed / WHEELBASE) * Math.tan(this.steer) * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.y -= Math.cos(this.heading) * this.speed * dt;
    carCorners(this.x, this.y, this.heading, this.corners);

    // ---- judge ----
    const c = this.corners;
    for (let i = 0; i < 4; i++) {
      if (!world.onRoad(c[i * 2], c[i * 2 + 1])) return this.retire('offroad');
    }
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      if (Math.abs(t.x - this.x) < 5 && Math.abs(t.y - this.y) < 5 && quadsOverlap(c, t.corners)) {
        return this.retire('collision');
      }
    }

    const pr = route.project(this.x, this.y, this.seg);
    if (pr.dist > OFF_ROUTE) return this.retire('lost');
    this.seg = pr.seg;
    this.progress = pr.s;
    if (pr.s > this.maxProgress + 0.5) {
      this.maxProgress = pr.s;
      this.lastGain = this.time;
    }
    if (this.maxProgress >= route.length - 5) {
      this.reached = true;
      this.alive = false;
      this.reason = 'arrived';
      return;
    }

    // Ran a red: the signal we were approaching is now behind us and it was red.
    if (this.prevSig >= 0 && (!sig || sig.i !== this.prevSig)) {
      const n = signals.nodes[this.prevSig];
      const behind = (n.x - this.x) * fx + (n.y - this.y) * fy <= 0;
      if (behind && this.prevSigState === 'red') return this.retire('red');
    }
    this.prevSig = sig ? sig.i : -1;
    this.prevSigState = sig ? sig.state : 'green';

    if (this.frame % 10 === 0) {
      const near = world.nearestRoad(this.x, this.y, 8);
      this.street = near ? near.road : this.street;
      if (near && near.road.oneway && near.dist < near.road.width / 2) {
        const s = near.seg;
        if ((s.bx - s.ax) * fx + (s.by - s.ay) * fy < -0.5 * Math.hypot(s.bx - s.ax, s.by - s.ay)) {
          return this.retire('wrongway');
        }
      }
    }

    // Stalling: stopped without a red light or a car in front to justify it.
    const waiting = (sig && sig.state !== 'green') || (this.sensor.hitCar[3] && this.sensor.dist[3] < 12);
    if (waiting) this.lastGain = this.time; // the no-progress clock pauses at lights and in queues
    this.stallT = this.speed < 0.5 && !waiting ? this.stallT + dt : 0;
    if (this.stallT > STALL_TIME) return this.retire('stall');
    if (this.time - this.lastGain > NO_PROGRESS_TIME) return this.retire('stall');
  }
}

// Draw a car body in world units (caller applied the camera transform).
export function drawCar(ctx, x, y, heading, color, alpha = 1, glow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  const w = CAR_WIDTH;
  const l = CAR_LENGTH;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-w / 2, -l / 2, w, l, 0.5);
  else ctx.rect(-w / 2, -l / 2, w, l);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#01010D';
  ctx.fillRect(-w / 2 + 0.25, -l / 2 + 1.0, w - 0.5, 0.8); // windscreen
  ctx.fillRect(-w / 2 + 0.3, l / 2 - 1.0, w - 0.6, 0.5); // rear window
  ctx.restore();
}
