# NeuroDrive: shared contract (read this first)

Self-driving cars that learn in the browser. Plain HTML/CSS/JS (ES modules), no build step, no paid services, $0 hosting.

## Palette (only these)
- Onyx Black   #01010D  (background)
- Electric Indigo #6331FB (primary)
- Tropical Mint #88F9C0 (accent / best car / success)
Fonts (Google Fonts, free): Anton (headlines), Instrument Serif italic (accent words), Inter (body).

## File ownership (avoid merge conflicts)
| Owner | Files |
|---|---|
| VS Code + Claude Code | js/network.js, js/sensor.js, js/car.js, js/road.js, js/evolution.js, js/main.js |
| Antigravity | index.html, css/style.css, js/ui.js, assets/*, README.md |
Never edit the other side's files. Ask for a contract change by editing this SPEC.md only.

## DOM contract (Antigravity creates, Claude Code uses)
- `<canvas id="road">`    simulation (engine draws it, sized by CSS; engine handles devicePixelRatio)
- `<canvas id="network">` live network visualizer (engine draws it)
- Engine reads colors from CSS variables on :root: `--onyx`, `--indigo`, `--mint`.

## JS contract (Claude Code exposes, Antigravity consumes)
`js/main.js` sets `window.NeuroDrive`:
```js
NeuroDrive = {
  state: { generation, alive, population, bestDistance, history: number[], paused, mutation, lanes, traffic },
  on(event, fn),   // 'stats' (~10/s), 'generation' (new gen), 'brain' (saved/loaded)
  actions: { start(), pause(), reset(), saveBrain(), loadBrain(), discardBrain(),
             setMutation(0..1), setPopulation(n), setLanes(2..5), setTraffic(0..1) }
}
```
`js/ui.js` (Antigravity) imports nothing from the engine; it only uses `window.NeuroDrive` after `DOMContentLoaded`.
Until the engine exists, ui.js must feature-detect and run on a mock so the UI can be built independently.

## Git (user runs commits, agents never commit)
See prompts/*.md for exact commands.
