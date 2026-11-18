# NeuroDrive v2 — Melbourne CBD

**Teach cars to drive Melbourne *on its own*.**

NeuroDrive v2 is a zero-dependency, browser-native autonomous driving simulator and neuroevolution lab set on the real **Melbourne CBD street network (Hoddle Grid)**. Built with plain HTML5 Canvas, CSS3, and ES Modules, it trains 100 self-driving cars to navigate real streets, one-way laneways, tram corridors, and traffic signals using OpenStreetMap data.

---

## How It Works

### 1. Real OpenStreetMap World & Directed Road Graph (`js/world.js`, `js/graph.js`)
- Real OpenStreetMap geometries of the Melbourne CBD (`-37.8230°` to `-37.8060°` S, `144.9480°` to `144.9790°` E) are projected into metric coordinates (`+x` east, `+y` south) around the CBD origin (`-37.8140, 144.9635`).
- Road polylines are split at intersections to form a directed graph honouring road widths, speed limits (`40 km/h` CBD limit), and one-way Little streets.
- Road edge segments and building footprints are indexed into a spatial hash grid for 60 fps collision and ray-cast queries.

### 2. A* Waypoint Routing (`js/router.js`, `js/scenarios.js`)
- Between any origin and destination landmark, **A\*** computes the shortest legal path across the directed road graph, generating route waypoints spaced every `~15 m`.
- **5-Stage Melbourne Curriculum** (auto-advances when arrival success reaches `≥ 70%`):
  1. **Swanston St Sprint** — Straight 1-block run along Swanston Street
  2. **Collins Intersection Turn** — Single Hoddle Grid turn onto Collins Street
  3. **Flinders to Queen Victoria Market** — Multi-turn route across the CBD
  4. **Peak Hour & Signals** — Flinders St Station to QVM with active AI traffic and cycling intersection signals
  5. **Grand Melbourne CBD Loop** — Full circuit navigating major arterials and one-way Little streets

### 3. 7-Ray Lidar & Intersection Telemetry (`js/sensor.js`, `js/signals.js`)
Each realistic `4.5 m × 1.9 m` vehicle collects **12 normalized neural inputs** every frame:
- **7 forward ray distances** to road edges, AI traffic cars, and trams
- **Current vehicle speed** (normalized against street limit)
- **`sin` and `cos` of relative bearing** to the next A* waypoint
- **Distance and phase state** (`green` / `amber` / `red`) of the next traffic signal ahead

### 4. `[12, 14, 2]` Neural Network & Genetic Evolution (`js/network.js`, `js/evolution.js`)
- A 3-layer feed-forward network (`[12, 14, 2]`) with `tanh` activations outputs continuous **steering** and **throttle/braking** commands.
- Fitness rewards **metres progressed along the A\* route** plus a large completion bonus for reaching the destination, with penalties for leaving the roadway, driving the wrong way on a one-way street, running a red signal, colliding, or stalling.
- The best-performing brain can be saved to `localStorage` (`"neurodrive.brain.v2"`).

### 5. Night-City Multi-Tier Map Renderer (`js/mapview.js`, `js/minimap.js`)
- `window.MapView` pre-renders static city layers (onyx ground, indigo building footprints, multi-width road ribbons with major-road glow, one-way directional chevrons, and mint dotted tram lines) to offscreen canvases across multiple zoom tiers to sustain **60 fps**.
- Dynamic overlays render collision-culled rotated street labels, landmark pins, glowing mint A* routes, pulsing destination beacons, and live traffic signal states.
- `window.Minimap` renders a live whole-CBD overview with the route and pulsing leader position.

---

### 6. Interactive 3D Pipeline Machine (`js/machine3d.js`)
- Lazy-loaded via `IntersectionObserver` and a pinned `three@0.170.0` importmap so the Melbourne simulation starts immediately.
- **Hero Embed (`embed: true`)**: Renders the 5-station autonomous driving pipeline on the right 58% of wide screens (and above the headline on mobile with touch rotation disabled for smooth scrolling).
- **How It Works Explorer (`embed: false`)**: Full interactive 3D machine supporting **Assembled**, **Cutaway**, **Stations**, and **One drive** modes, 5 camera presets (`Overview`, `Side`, `Top`, `Station`, `Flight`), and two-way station selection synced with the 5-stage architecture guide (`01 Map` → `02 Router` → `03 Sensors` → `04 Brain` → `05 Evolution`).
- **Live Engine Link**: Subscribes to `window.NeuroDrive.on('generation')` to pulse the **05 Evolution** station and repaint its in-scene display with the latest generation and best distance (`m`), plus the current arrival success rate on the **04 Brain** screen.

---

## Controls & Keyboard Shortcuts

| Control / Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / **Start / Pause** | Pause or resume the simulation loop |
| <kbd>R</kbd> / **Reset** | Reset generation counter and respawn population |
| <kbd>S</kbd> / **Save brain** | Save the current best neural network to `localStorage` |
| <kbd>+</kbd> / <kbd>-</kbd> | Zoom camera in or out |
| **Scenario Cards** (`01` – `05`) | Switch active Melbourne CBD curriculum scenario |
| **Traffic / Signals / View** | Toggle AI traffic, intersection signals, or Follow/Overview camera |
| **Mutation & Traffic Sliders** | Adjust genetic mutation rate (`0..1`) and CBD traffic density (`0..1`) |
| **Population** (`50` / `100` / `200`) | Set cohort size per generation |

---

## Running Locally

No build step or external dependencies are required. Serve the root directory with:

```bash
npx serve
```

---

## Data Attribution & Credits

- **Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors**, licensed under the Open Data Commons Open Database License (**ODbL**).
- Built by **Rukshan** · [github.com/Ruki-Diaz](https://github.com/Ruki-Diaz)
