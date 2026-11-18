# Antigravity: 3D machine on the landing page
Open the folder in Antigravity, start an agent, paste everything below the line.
---
Read SPEC.md (v2), especially "Landing-page 3D machine". You own ONLY index.html, css/style.css, js/ui.js, js/mapview.js, js/minimap.js, js/machine3d.js, assets/*, README.md. Never touch the engine files. reference/agentic-factory-3d.tsx is read-only input.

Add the interactive 3D machine from reference/agentic-factory-3d.tsx to the NeuroDrive landing page, as part of the hero.
1. Port it to vanilla JS in js/machine3d.js: `export function mountMachine(el, {embed, onStation})` -> returns dispose(). Remove React/TypeScript, keep the three.js scene code, controls, modes, cameras and the window.__machine API. Move the component's CSS (the STYLES string) into css/style.css, scoped under `.nd-machine`, converting its tokens to --onyx/--indigo/--mint.
2. In index.html add a `<script type="importmap">` before the module scripts: "three" -> https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js, "three/addons/" -> https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/, and map the component's `three/examples/jsm/` imports to the same CDN path. Dynamic-import machine3d.js only when the hero is in view; if WebGL fails, hide the machine and show the existing hero without errors.
3. Hero layout: wide screens (>900px) = headline + CTA + chips on the left, the machine on the right 58% (embed mode, auto-rotating, no panels). Mobile = machine above the headline at ~320px height, rotation disabled so the page scrolls. Replace the "0 libraries" chip with "$0 to run".
4. Retheme to the NeuroDrive pipeline. Stations in order: 01 Map (real OpenStreetMap streets), 02 Router (A* route, waypoint every 15 m), 03 Sensors (7 rays: road edges, cars, trams), 04 Brain (12-14-2 neural network), 05 Evolution (best drivers breed the next generation). Update station names, descriptions, step/output labels, the engraved plate ("NEURODRIVE / map - route - sensors - brain - evolution / Melbourne CBD"), the plaques, the in-scene screens (map thumbnail, route card "Flinders St Station -> Queen Victoria Market", ray fan, network diagram, generation/best-distance readout) and the packet cards. Recolor: amber -> #6331FB, copper -> #88F9C0, dark metal -> onyx/indigo tints, emissive lights indigo/mint. Remove the vibecoding.tech wordmark but keep the original credit in the file header comment.
5. Add a "How it works" section below the sim using the FULL version (embed: false, with mode and camera controls: Assembled, Cutaway, Stations, "One drive"), lazy-mounted when scrolled into view, disposed when far off-screen. Clicking a station scrolls to or highlights the matching line in the README-style explanation beside it.
6. Live link: if window.NeuroDrive exists, on('generation') pulse the Evolution station and repaint its screen with the generation number and best distance in metres; show success rate on the Brain screen. Must degrade silently when the engine is absent.
Performance: cap pixel ratio at 1.5, pause rendering when off-screen, respect prefers-reduced-motion (no auto-rotate). WCAG AA for all overlay text. Do NOT commit.
---
## Commit (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git add -A
git commit -m "feat: 3D NeuroDrive machine on the landing page and how-it-works section"
git push
```
