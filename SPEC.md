# NeuroDrive v2: Melbourne CBD (shared contract, read first)

Self-driving cars that learn on the REAL Melbourne CBD street network (Hoddle Grid) in the browser.
Plain HTML/CSS/JS (ES modules), no build step, no paid services, no API keys, $0 hosting.
Data: OpenStreetMap (c) OpenStreetMap contributors, ODbL. Attribution is REQUIRED in the footer and README.

## Palette (only these) and fonts
Onyx #01010D (bg), Electric Indigo #6331FB (primary), Tropical Mint #88F9C0 (accent / best car / route).
Fonts: Anton (headlines), Instrument Serif italic (accents), Inter (body). Map must look like a dark, premium
night-city map (NOT cartoon): indigo-tinted roads, onyx ground, subtle building footprints, mint route.

## File ownership (never edit the other side's files; change contracts here only)
| Owner | Files |
|---|---|
| VS Code + Claude Code | scripts/fetch-osm.mjs, data/*, js/world.js, js/graph.js, js/router.js, js/car.js, js/sensor.js, js/traffic.js, js/signals.js, js/network.js, js/evolution.js, js/scenarios.js, js/main.js (delete js/road.js when replaced) |
| Antigravity | index.html, css/style.css, js/ui.js, js/mapview.js, js/minimap.js, js/machine3d.js, assets/*, README.md (reference/ is read-only input) |

## World data: data/melbourne-cbd.json (Claude Code generates via `node scripts/fetch-osm.mjs`)
Equirectangular projection around origin, units = METRES, +x east, +y SOUTH (screen-down).
```json
{ "bbox":{"s":-37.8230,"w":144.9480,"n":-37.8060,"e":144.9790},
  "origin":{"lat":-37.8140,"lon":144.9635},
  "roads":[{"id":1,"name":"Swanston Street","class":"primary","oneway":false,"lanes":2,"maxspeedKmh":40,"width":7,"points":[[x,y],...]}],
  "buildings":[[[x,y],...]],
  "tram":[[[x,y],...]],
  "signals":[{"x":0,"y":0}],
  "landmarks":[{"name":"Flinders Street Station","x":0,"y":0}] }
```
Round coordinates to 0.1 m. Keep file under ~4 MB (simplify/skip tiny buildings). Commit the generated file.

## MapView contract (Antigravity writes js/mapview.js; engine calls it)
```js
window.MapView = {
  init(world),                      // world = parsed JSON; pre-render static layers to offscreen canvas
  drawBase(ctx, cam),               // ground, buildings, roads, tram lines, bridges. cam = {x,y,zoom,rotation,w,h} (metres, px/metre)
  drawOverlay(ctx, cam, hud)        // street labels, landmarks, route line (hud.route = [[x,y]...]), destination pin, signals state (hud.signals=[{x,y,state:'green'|'amber'|'red'}])
}
```
Engine draws cars between drawBase and drawOverlay. Engine owns camera and the game loop.
Clarifications (engine, v2.1): ctx is passed in CSS pixels (transform = devicePixelRatio scale only); cam.x/cam.y is
the world point at the canvas centre, so screen = rotate((p - cam) * zoom, rotation) + (w/2, h/2); rotation is
currently always 0. hud also carries `destination` ({name,x,y}) and `car` (same object as state.car). hud.signals
is [] while signals are switched off.

## Engine contract (Claude Code exposes `window.NeuroDrive`)
```js
NeuroDrive = {
  state: { generation, alive, population, bestDistance /*m progressed along route*/, history:[m],
           paused, mutation, traffic /*0..1*/, signalsOn /*bool*/, scenarioId,
           success /*0..1 fraction of cars that reached destination last gen*/,
           car: { x, y, headingDeg, speedKmh, street, limitKmh, routeProgress /*0..1*/ },   // best car, live
           route: [[x,y]...], destination:{name,x,y}, scenarios:[{id,name,description,difficulty}] },
  on(event, fn),  // 'stats' (~10/s, payload=state), 'generation' ({generation,best,success,history}), 'brain' ({action,ok}), 'scenario' ({id}) ; returns unsubscribe
  actions: { start(), pause(), reset(), saveBrain(), loadBrain(), discardBrain(),
             setMutation(0..1), setPopulation(n), setTraffic(0..1), setSignals(bool),
             setScenario(id), setView('follow'|'overview'), zoom(delta) }
}
```
Clarifications (engine, v2.1): `car.headingDeg` is a compass bearing (0 = north / -y, 90 = east, clockwise).
`zoom(delta)`: positive zooms in (x1.25 per unit); setView resets the user zoom. `window.NeuroDrive` exists as soon as
js/main.js runs; `route`/`destination` fill in once data/melbourne-cbd.json has loaded (a 'scenario' event fires then).
setScenario applies that scenario's default traffic/signals; the toggles can override afterwards.
Canvas ids: `#road` (main map+cars), `#network` (net visualizer), `#spark`, `#minimap` (Antigravity draws minimap in js/minimap.js from state.car + world + route).
Colors from CSS vars --onyx --indigo --mint.

## Driving model (Claude Code)
- Real scale: cars ~4.5 m x 1.9 m, CBD limit 40 km/h, max accel/brake realistic, steering limited by speed.
- Net inputs (12): 7 ray distances (road edge / car / tram), speed, sin+cos of bearing to next waypoint, distance+state of next signal ahead. Layers [12,14,2]; outputs steer, accel/brake.
- Route: A* over road graph (graph.js) honouring one-way streets; waypoints every ~15 m.
- Fitness: metres progressed along route; big bonus for reaching destination; penalties: leaving road, wrong way on one-way, running red, collision, stalling.
- Traffic: AI cars following graph at limit with simple following distance; signals cycle per intersection (Hoddle Grid).
- Scenarios (curriculum, scenarios.js): 1 straight Swanston St block, 2 one turn, 3 Flinders St Station -> Queen Victoria Market multi-turn, 4 same with traffic+signals, 5 CBD loop. Auto-advance when success >= 70%.

## Landing-page 3D machine (Antigravity, js/machine3d.js)
Source: reference/agentic-factory-3d.tsx (React + Tailwind-free, three.js, procedural, no models/images).
Port to VANILLA JS: `export function mountMachine(el, { embed, onStation })` returning `dispose()`. Strip TypeScript and React;
keep the scene code as is. three.js comes from a pinned CDN importmap (jsdelivr, three@0.170.0, plus `three/addons/`), added in index.html.
Lazy-load with dynamic import + IntersectionObserver so the Melbourne sim stays fast. Hero uses `embed: true` (machine on the right 58%).
Retheme the machine to the NeuroDrive pipeline (stations): Map (OSM streets) -> Router (A*) -> Sensors (7 rays) -> Brain (12-14-2 net) -> Evolution (fitness).
Recolor: amber 0xff7a1a -> indigo 0x6331FB, copper -> mint 0x88F9C0, background transparent over onyx. Remove the vibecoding.tech wordmark.
Live link: on NeuroDrive 'generation' pulse the Evolution station and paint generation + best distance on its screen; success rate on the Brain screen.
Header comment must keep the original credit line. Hero "0 libraries" chip becomes "$0 to run" (the sim is library-free, the 3D explainer uses three.js).

## Git (user runs commits; everything on main, no branches)
git add -A && git commit -m "..." && git push
