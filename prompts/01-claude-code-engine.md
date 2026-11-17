# VS Code + Claude Code: engine
Open this folder in VS Code, run `claude`, paste everything below the line.
---
Read SPEC.md first and obey the file ownership table. You own ONLY js/network.js, sensor.js, car.js, road.js, evolution.js, main.js.

Build the self-driving car engine from scratch (no libraries):
- road.js: vertical multi-lane road, lane count 2-5, infinite scroll via camera following the best car, borders as line segments.
- sensor.js: 5 ray sensors per car, return normalized proximity (0..1) to road borders and traffic.
- network.js: feed-forward net, layers [5, 6, 4], tanh, randomize + mutate(amount) + clone + JSON (de)serialize. Include drawNetwork(ctx, net) that renders nodes and weighted lines (mint = positive, indigo = negative) with animated activations on #network.
- car.js: physics (accel, friction, steering), polygon collision with borders/traffic, AI control from network outputs [forward, left, right, reverse].
- evolution.js: population N (default 100), when all crash copy best brain, mutate rest, respawn. Track best distance, generation, history[].
- Traffic: dummy cars spawned ahead, density from state.traffic.
- main.js: game loop on #road, expose window.NeuroDrive exactly as in SPEC.md. Save/load/discard brain via localStorage key "neurodrive.brain".
- Read colors from CSS vars --onyx --indigo --mint. Best car mint, others indigo at 0.25 alpha, traffic white/grey.
- Until Antigravity's index.html exists, make a temporary test.html (delete it later) with the two canvases.
Verify: `npx serve`, no console errors, cars improve within ~10 generations. Write short comments only where logic is non-obvious.

When done, DO NOT commit. Tell me what to run.
---
## Commit commands (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git init
git add js/ SPEC.md
git commit -m "feat: neural network, sensors and genetic evolution engine"
```
