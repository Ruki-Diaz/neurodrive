import { Sensor, getIntersection } from './sensor.js';
import { NeuralNetwork } from './network.js';

// Cars whose average forward progress (EMA, ~1s window) drops below MIN_PACE are retired.
// MIN_PACE sits just above traffic speed: otherwise braking behind a traffic car forever outscores
// every failed overtake attempt and evolution never discovers lane changes. Also catches stalls,
// circling and reversing.
const MIN_PACE = 2.3;
const PACE_EMA = 1 / 60;

export function polysIntersect(p1, p2) {
  for (let i = 0; i < p1.length; i++) {
    const a = p1[i];
    const b = p1[(i + 1) % p1.length];
    for (let j = 0; j < p2.length; j++) {
      if (getIntersection(a, b, p2[j], p2[(j + 1) % p2.length])) return true;
    }
  }
  return false;
}

export class Car {
  constructor(x, y, { width = 30, height = 50, maxSpeed = 3.5, type = 'ai', brain = null } = {}) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.type = type;
    this.angle = 0;
    this.speed = 0;
    this.maxSpeed = maxSpeed;
    this.acceleration = 0.2;
    this.friction = 0.05;
    this.damaged = false;
    this.controls = { forward: false, left: false, right: false, reverse: false };

    if (type === 'ai') {
      this.sensor = new Sensor(this);
      this.brain = brain || new NeuralNetwork();
      this.startY = y;
      this.distance = 0;
      this.pace = maxSpeed; // optimistic start so the launch from standstill isn't penalised
    } else {
      this.speed = maxSpeed;
      this.shade = 0.6;
    }
    this.polygon = this.#createPolygon();
  }

  update(borders, traffic) {
    if (this.damaged) return;
    if (this.type !== 'ai') {
      this.y -= this.speed; // traffic cruises at constant speed
      this.polygon = this.#createPolygon();
      return;
    }

    const prevY = this.y;
    this.#move();
    this.polygon = this.#createPolygon();
    if (this.#assessDamage(borders, traffic)) {
      this.damaged = true;
      this.speed = 0;
      return;
    }

    this.sensor.update(borders, traffic);
    const out = this.brain.feedForward(this.sensor.proximity);
    this.controls.forward = out[0] > 0;
    this.controls.left = out[1] > 0;
    this.controls.right = out[2] > 0;
    this.controls.reverse = out[3] > 0;

    this.distance = Math.max(this.distance, this.startY - this.y);
    this.pace += (prevY - this.y - this.pace) * PACE_EMA;
    if (this.pace < MIN_PACE) this.damaged = true;
  }

  #move() {
    const c = this.controls;
    if (c.forward) this.speed += this.acceleration;
    if (c.reverse) this.speed -= this.acceleration;
    this.speed = Math.max(-this.maxSpeed / 2, Math.min(this.maxSpeed, this.speed));
    if (Math.abs(this.speed) <= this.friction) this.speed = 0;
    else this.speed -= Math.sign(this.speed) * this.friction;

    if (this.speed !== 0) {
      const flip = this.speed > 0 ? 1 : -1; // steering inverts when reversing
      if (c.left) this.angle += 0.03 * flip;
      if (c.right) this.angle -= 0.03 * flip;
    }
    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }

  #createPolygon() {
    const rad = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);
    const { x, y, angle } = this;
    return [
      { x: x - Math.sin(angle - alpha) * rad, y: y - Math.cos(angle - alpha) * rad },
      { x: x - Math.sin(angle + alpha) * rad, y: y - Math.cos(angle + alpha) * rad },
      { x: x - Math.sin(Math.PI + angle - alpha) * rad, y: y - Math.cos(Math.PI + angle - alpha) * rad },
      { x: x - Math.sin(Math.PI + angle + alpha) * rad, y: y - Math.cos(Math.PI + angle + alpha) * rad },
    ];
  }

  #assessDamage(borders, traffic) {
    for (const b of borders) if (polysIntersect(this.polygon, b)) return true;
    const reach = this.height * 1.5;
    for (const t of traffic) {
      if (Math.abs(t.y - this.y) > reach) continue;
      if (polysIntersect(this.polygon, t.polygon)) return true;
    }
    return false;
  }

  draw(ctx, color, alpha = 1, { sensor = false, glow = false } = {}) {
    if (sensor && this.sensor) this.sensor.draw(ctx, color);
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 7);
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = '#01010D';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 9, w - 8, 9); // windshield
    ctx.fillRect(-w / 2 + 5, h / 2 - 11, w - 10, 6); // rear window
    ctx.restore();
  }
}
