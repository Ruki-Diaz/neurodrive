// Feed-forward neural network + live visualizer. No dependencies.

// Inputs: 7 rays, speed, sin/cos bearing to next waypoint, next-signal distance + state.
// Outputs: steer (-1 left .. +1 right), pedal (-1 brake .. +1 accelerate).
export const LAYERS = [12, 14, 2];
const OUTPUT_LABELS = ['steer', 'gas'];
const FALLBACK = { onyx: '#01010D', indigo: '#6331FB', mint: '#88F9C0' };

const lerp = (a, b, t) => a + (b - a) * t;
const rand = () => Math.random() * 2 - 1;
// Weights span ±2 (biases ±1) so sensor inputs in 0..1 can outweigh the bias and random
// brains actually react to obstacles; this markedly speeds up early learning.
const WEIGHT_RANGE = 2;
const randW = () => rand() * WEIGHT_RANGE;

class Level {
  constructor(inCount, outCount) {
    this.inputs = new Array(inCount).fill(0);
    this.outputs = new Array(outCount).fill(0);
    this.biases = new Array(outCount).fill(0);
    this.weights = Array.from({ length: inCount }, () => new Array(outCount).fill(0));
  }

  randomize() {
    for (const row of this.weights) for (let o = 0; o < row.length; o++) row[o] = randW();
    for (let o = 0; o < this.biases.length; o++) this.biases[o] = rand();
    return this;
  }

  feed(inputs) {
    for (let i = 0; i < this.inputs.length; i++) this.inputs[i] = inputs[i] ?? 0;
    for (let o = 0; o < this.outputs.length; o++) {
      let sum = this.biases[o];
      for (let i = 0; i < this.inputs.length; i++) sum += this.inputs[i] * this.weights[i][o];
      this.outputs[o] = Math.tanh(sum);
    }
    return this.outputs;
  }
}

export class NeuralNetwork {
  constructor(layers = LAYERS, randomize = true) {
    this.layers = [...layers];
    this.levels = [];
    for (let i = 0; i < layers.length - 1; i++) {
      const lvl = new Level(layers[i], layers[i + 1]);
      if (randomize) lvl.randomize();
      this.levels.push(lvl);
    }
  }

  feedForward(inputs) {
    let out = inputs;
    for (const lvl of this.levels) out = lvl.feed(out);
    return out;
  }

  randomize() {
    for (const lvl of this.levels) lvl.randomize();
    return this;
  }

  // Pull every parameter toward a random value by `amount` (0 = no change, 1 = fully random).
  mutate(amount = 0.1) {
    for (const lvl of this.levels) {
      for (let o = 0; o < lvl.biases.length; o++) lvl.biases[o] = lerp(lvl.biases[o], rand(), amount);
      for (const row of lvl.weights) for (let o = 0; o < row.length; o++) row[o] = lerp(row[o], randW(), amount);
    }
    return this;
  }

  clone() {
    return NeuralNetwork.fromJSON(this.toJSON());
  }

  toJSON() {
    return {
      layers: [...this.layers],
      levels: this.levels.map((l) => ({ weights: l.weights.map((r) => [...r]), biases: [...l.biases] })),
    };
  }

  static fromJSON(data) {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    if (!obj || !Array.isArray(obj.layers) || !Array.isArray(obj.levels)) throw new Error('Invalid brain');
    const net = new NeuralNetwork(obj.layers, false);
    if (obj.levels.length !== net.levels.length) throw new Error('Brain shape mismatch');
    obj.levels.forEach((src, i) => {
      const lvl = net.levels[i];
      if (src.biases.length !== lvl.biases.length || src.weights.length !== lvl.weights.length) {
        throw new Error('Brain shape mismatch');
      }
      lvl.biases = src.biases.map(Number);
      lvl.weights = src.weights.map((r) => {
        if (r.length !== lvl.outputs.length) throw new Error('Brain shape mismatch');
        return r.map(Number);
      });
    });
    return net;
  }
}

// ---- Shared rendering helpers -------------------------------------------

let paletteCache = null;
let paletteTime = 0;

// Colors come from CSS vars on :root; cached for 1s so theme edits still apply.
export function palette() {
  const now = performance.now();
  if (paletteCache && now - paletteTime < 1000) return paletteCache;
  const css = getComputedStyle(document.documentElement);
  const get = (name, key) => css.getPropertyValue(name).trim() || FALLBACK[key];
  paletteCache = { onyx: get('--onyx', 'onyx'), indigo: get('--indigo', 'indigo'), mint: get('--mint', 'mint') };
  paletteTime = now;
  return paletteCache;
}

// Match the backing store to the CSS size * devicePixelRatio; returns CSS-pixel dims.
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr, ctx };
}

// ---- Visualizer -----------------------------------------------------------

export function drawNetwork(ctx, net, opts = {}) {
  const { w, h } = fitCanvas(ctx.canvas);
  const pal = opts.palette || palette();
  const t = opts.time ?? performance.now() / 1000;
  ctx.clearRect(0, 0, w, h);
  if (!net) return;

  const values = [net.levels[0].inputs, ...net.levels.map((l) => l.outputs)];
  const horizontal = w >= h;
  const maxN = Math.max(...values.map((v) => v.length));
  const across = horizontal ? h : w;
  const r = Math.max(3, Math.min(14, Math.min(w, h) / 20, (across * 0.8) / (maxN * 2.6)));
  const pad = r * 2.2;
  const labelRoom = horizontal ? r * 4.5 : 0; // space for output labels on the right

  // Horizontal: inputs left → outputs right. Vertical: inputs bottom → outputs top.
  const pos = (li, ni) => {
    const n = values[li].length;
    const a = li / (values.length - 1);
    const b = n === 1 ? 0.5 : ni / (n - 1);
    // Smaller layers are centred instead of stretched across the full height.
    const spanFrac = Math.min(1, (n - 1) / Math.max(1, maxN - 1) + 0.25);
    const bb = 0.5 + (b - 0.5) * spanFrac;
    return horizontal
      ? { x: lerp(pad, w - pad - labelRoom, a), y: lerp(pad, h - pad, bb) }
      : { x: lerp(pad, w - pad, bb), y: lerp(h - pad - r * 2, pad, a) };
  };

  ctx.save();
  ctx.lineCap = 'round';

  net.levels.forEach((lvl, li) => {
    for (let i = 0; i < lvl.inputs.length; i++) {
      const act = Math.min(1, Math.abs(lvl.inputs[i]));
      const A = pos(li, i);
      for (let o = 0; o < lvl.outputs.length; o++) {
        const wt = lvl.weights[i][o];
        const mag = Math.min(1, Math.abs(wt));
        const B = pos(li + 1, o);
        ctx.strokeStyle = wt >= 0 ? pal.mint : pal.indigo;
        ctx.globalAlpha = 0.08 + 0.6 * mag * (0.3 + 0.7 * act);
        ctx.lineWidth = 0.5 + 2.4 * mag;
        // Dashes flow toward the output while the source neuron is firing.
        if (act > 0.05) {
          ctx.setLineDash([4, 7]);
          ctx.lineDashOffset = -t * 28;
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
    }
  });
  ctx.setLineDash([]);

  const last = values.length - 1;
  values.forEach((layer, li) => {
    layer.forEach((v, ni) => {
      const p = pos(li, ni);
      const a = Math.min(1, Math.abs(v));
      const isOut = li === last;
      const on = isOut && v > 0;

      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.onyx;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      const pulse = 1 + 0.12 * a * Math.sin(t * 6 + ni + li);
      if (on) {
        ctx.shadowColor = pal.mint;
        ctx.shadowBlur = 16;
      }
      ctx.globalAlpha = 0.15 + 0.85 * a;
      ctx.fillStyle = v >= 0 ? pal.mint : pal.indigo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.78 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = on ? 0.9 : 0.35;
      ctx.strokeStyle = on ? pal.mint : '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();

      if (isOut && OUTPUT_LABELS[ni]) {
        ctx.globalAlpha = on ? 1 : 0.45;
        ctx.fillStyle = on ? pal.mint : '#ffffff';
        ctx.font = `600 ${Math.max(10, Math.round(r * 1.1))}px Inter, system-ui, sans-serif`;
        ctx.textAlign = horizontal ? 'left' : 'center';
        ctx.textBaseline = 'middle';
        const lx = horizontal ? p.x + r * 1.6 : p.x;
        const ly = horizontal ? p.y : p.y - r * 2;
        ctx.fillText(OUTPUT_LABELS[ni], lx, ly);
      }
    });
  });
  ctx.restore();
}
