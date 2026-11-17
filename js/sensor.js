// Ray sensors: each ray reports proximity 0 (nothing in range) .. 1 (touching).

export const lerp = (a, b, t) => a + (b - a) * t;

// Segment AB vs segment CD. Returns hit point and `offset` (0..1 along AB) or null.
export function getIntersection(A, B, C, D) {
  const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
  const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
  const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);
  if (bottom !== 0) {
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), offset: t };
    }
  }
  return null;
}

export class Sensor {
  constructor(car, { rayCount = 5, rayLength = 170, raySpread = Math.PI / 2 } = {}) {
    this.car = car;
    this.rayCount = rayCount;
    this.rayLength = rayLength;
    this.raySpread = raySpread;
    this.rays = [];
    this.readings = [];
    this.proximity = new Array(rayCount).fill(0);
  }

  update(borders, traffic) {
    this.#castRays();
    for (let i = 0; i < this.rays.length; i++) {
      const hit = this.#read(this.rays[i], borders, traffic);
      this.readings[i] = hit;
      this.proximity[i] = hit ? 1 - hit.offset : 0;
    }
  }

  #castRays() {
    const { x, y, angle } = this.car;
    this.rays.length = 0;
    for (let i = 0; i < this.rayCount; i++) {
      const k = this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1);
      const a = lerp(this.raySpread / 2, -this.raySpread / 2, k) + angle;
      this.rays.push([
        { x, y },
        { x: x - Math.sin(a) * this.rayLength, y: y - Math.cos(a) * this.rayLength },
      ]);
    }
  }

  #read([s, e], borders, traffic) {
    let best = null;
    const consider = (hit) => {
      if (hit && (!best || hit.offset < best.offset)) best = hit;
    };
    for (const b of borders) consider(getIntersection(s, e, b[0], b[1]));
    const reach = this.rayLength + 60;
    for (const t of traffic) {
      if (Math.abs(t.y - this.car.y) > reach) continue;
      const p = t.polygon;
      for (let j = 0; j < p.length; j++) consider(getIntersection(s, e, p[j], p[(j + 1) % p.length]));
    }
    return best;
  }

  draw(ctx, color) {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < this.rays.length; i++) {
      const [s, e] = this.rays[i];
      const hit = this.readings[i];
      const end = hit || e;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (hit) {
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(hit.x, hit.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
