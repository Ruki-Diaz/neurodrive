// 7 ray sensors. Each ray reports proximity 0 (nothing within range) .. 1 (touching) to the nearest
// road edge or traffic car. Ray lengths are tuned per angle: long straight ahead, short to the sides
// (side rays mostly measure where the car sits within its lane).

import { raySeg } from './world.js';

export const RAY_ANGLES = [-90, -45, -20, 0, 20, 45, 90].map((d) => (d * Math.PI) / 180);
export const RAY_LENGTHS = [10, 20, 35, 50, 35, 20, 10];
const TRAFFIC_REACH = 55;

export class Sensor {
  constructor(car) {
    this.car = car;
    this.count = RAY_ANGLES.length;
    this.dist = new Float64Array(this.count);
    this.proximity = new Float64Array(this.count);
    this.hitCar = new Uint8Array(this.count); // 1 if the ray hit a traffic car rather than a kerb
  }

  update(world, traffic) {
    const { x, y, heading } = this.car;
    const near = this.#nearTraffic(traffic, x, y);
    for (let i = 0; i < this.count; i++) {
      const a = heading + RAY_ANGLES[i];
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      const len = RAY_LENGTHS[i];
      let d = world.raycast(x, y, dx, dy, len);
      let hitCar = 0;
      for (let k = 0; k < near.length; k++) {
        const c = near[k].corners;
        for (let j = 0; j < 4; j++) {
          const jn = (j + 1) & 3;
          const t = raySeg(x, y, dx, dy, c[j * 2], c[j * 2 + 1], c[jn * 2], c[jn * 2 + 1]);
          if (t >= 0 && t < d) {
            d = t;
            hitCar = 1;
          }
        }
      }
      this.dist[i] = d;
      this.hitCar[i] = hitCar;
      this.proximity[i] = 1 - d / len;
    }
  }

  #nearTraffic(traffic, x, y) {
    const out = (this.near ||= []);
    out.length = 0;
    const r2 = TRAFFIC_REACH * TRAFFIC_REACH;
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy < r2) out.push(t);
    }
    return out;
  }

  // Draw in world coordinates (caller has applied the camera transform; lw = 1 screen px in metres).
  draw(ctx, color, lw) {
    const { x, y, heading } = this.car;
    ctx.save();
    ctx.lineWidth = 1.2 * lw;
    for (let i = 0; i < this.count; i++) {
      const a = heading + RAY_ANGLES[i];
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      const d = this.dist[i];
      const hit = d < RAY_LENGTHS[i] - 1e-6;
      ctx.globalAlpha = hit ? 0.75 : 0.35;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * d, y + dy * d);
      ctx.stroke();
      if (hit) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = this.hitCar[i] ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(x + dx * d, y + dy * d, 2.5 * lw, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
