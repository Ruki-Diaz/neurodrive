# NeuroDrive

**Teach cars to drive *without limits*.**

NeuroDrive is a zero-dependency, browser-native self-driving car simulator and neuroevolution lab built with plain HTML5 Canvas, CSS3, and ES Modules. Watch a population of 100 autonomous vehicles learn how to navigate multi-lane highway traffic from scratch using ray-cast sensors, feed-forward neural networks, and genetic mutation.

---

## How It Works

### 1. 5-Ray Lidar Perception (`js/sensor.js`)
Every autonomous car casts **5 forward-facing sensor rays** spread across a fan angle ahead of the chassis. On each animation frame, line-segment intersection math computes the exact distance from the car to:
- Highway lane boundaries (`js/road.js`)
- Slower moving traffic drones ahead

Each ray returns a normalized proximity reading between `0` (clear) and `1` (immediate collision).

### 2. `[5, 6, 4]` Feed-Forward Neural Network (`js/network.js`)
The 5 normalized sensor values feed directly into each car's individual neural network:
- **Input layer:** `5` neurons (one per ray sensor)
- **Hidden layer:** `6` neurons with `tanh` activation
- **Output layer:** `4` neurons (`[forward, left, right, reverse]`) driving the vehicle's physics and steering (`js/car.js`)

The live **Neural Network Visualizer** (`#network`) renders the leading car's weights and activations in real time:
- **Tropical Mint (`#88F9C0`)** synapses indicate positive weights
- **Electric Indigo (`#6331FB`)** synapses indicate negative weights

### 3. Genetic Evolution (`js/evolution.js`)
1. A population of `N` cars (default `100`) spawns simultaneously with randomized neural weights.
2. The camera tracks the **best car** (the vehicle that has traveled the furthest vertical distance), rendered in solid **Tropical Mint** while the rest of the cohort runs in semi-transparent **Electric Indigo**.
3. When all cars crash (or when you reset/advance), the fittest car's neural network is cloned across the next generation and mutated according to the **Mutation Rate** slider (`0..1`).
4. You can persist your best-performing brain to `localStorage` (`"neurodrive.brain"`) at any time using **Save brain** (`S`), reload it across sessions with **Load brain**, or clear it with **Discard**.

---

## Controls & Keyboard Shortcuts

| Control / Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / **Start / Pause** | Pause or resume the simulation loop |
| <kbd>R</kbd> / **Reset** | Reset generation counter and respawn population |
| <kbd>S</kbd> / **Save brain** | Save the current best neural network to `localStorage` |
| **Load brain** / **Discard** | Restore or delete the saved brain from `localStorage` |
| **Mutation Rate** (`0% – 100%`) | Adjust genetic perturbation between generations |
| **Traffic Density** (`0% – 100%`) | Control obstacle car spawn density on the highway |
| **Population** (`50` / `100` / `200`) | Set cohort size per generation |
| **Road Lanes** (`2` / `3` / `4` / `5`) | Reconfigure highway width and lane count |

---

## Design System

- **Onyx Black** (`#01010D`) — Deep space canvas & glassmorphism base
- **Electric Indigo** (`#6331FB`) — Primary accent, population glow & negative weights
- **Tropical Mint** (`#88F9C0`) — Leader vehicle, positive weights, CTAs & telemetry highlights
- **Typography:** `Anton` (display headlines), `Instrument Serif` italic (editorial accents), `Inter` (UI & tabular telemetry)

---

## Running Locally

No build step, bundler, or package installation is required. Run any static file server from the project root:

```bash
npx serve
```

Then open the local URL printed in your terminal (typically `http://localhost:3000`).

---

## Project Structure

```text
neurodrive/
├── index.html          # Landing page & simulation workspace DOM
├── css/
│   └── style.css       # Pure CSS glassmorphism, responsive layout & palette variables
├── js/
│   ├── main.js         # Simulation loop & window.NeuroDrive public API
│   ├── ui.js           # Telemetry counters, sparkline chart, controls & mock fallback
│   ├── network.js      # [5, 6, 4] feed-forward neural network & #network visualizer
│   ├── sensor.js       # 5-ray intersection casting
│   ├── car.js          # Vehicle physics, polygon collision & AI actuation
│   ├── road.js         # Infinite scrolling multi-lane highway
│   └── evolution.js    # Population management, fitness tracking & mutation
├── assets/
│   ├── favicon.svg     # Indigo/mint vector favicon
│   └── og-image.svg    # Social preview card
└── SPEC.md             # Shared architecture & DOM/JS contract
```

---

Built by **Rukshan** · [github.com/Ruki-Diaz](https://github.com/Ruki-Diaz)
