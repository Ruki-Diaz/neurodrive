# VS Code + Claude Code: Melbourne engine
Open the folder in VS Code, run `claude`, paste everything below the line.
---
Read SPEC.md (v2) fully. You own ONLY the files listed for Claude Code. Convert NeuroDrive from the cartoon road to the REAL Melbourne CBD.

1. scripts/fetch-osm.mjs (Node 18+, no dependencies): POST an Overpass QL query for the bbox in SPEC.md to https://overpass-api.de/api/interpreter (fallback https://overpass.kumi.systems/api/interpreter) for: highway=* drivable classes (motorway..service, exclude footway/cycleway/steps), building=*, railway=tram, highway=traffic_signals nodes, and landmarks (Flinders Street Station, Federation Square, Melbourne Central, Queen Victoria Market, State Library Victoria, Southern Cross Station). Project to metres around the origin, infer width from lanes/class, oneway (incl. oneway=-1 reversal), maxspeed (default 40 in CBD). Write data/melbourne-cbd.json exactly as SPEC.md. Run it, check the size (<4 MB), print a summary (roads, buildings, signals, one-ways).
2. js/world.js: load the JSON, build road edge segments + a spatial hash grid for fast ray/collision queries.
3. js/graph.js + js/router.js: node graph from road polylines (split at shared points), directed edges honouring one-way, A* route between two points, waypoints every ~15 m.
4. js/car.js: metric physics (4.5 x 1.9 m, bicycle steering model, speed-dependent steering limit, accel/brake), collision with road edges and cars, off-road = crash, 40 km/h CBD limit.
5. js/sensor.js: 7 rays, distance to road edge / other cars via the grid. js/network.js: layers [12,14,2], same mutate/clone/serialize API, keep drawNetwork for #network.
6. js/signals.js + js/traffic.js: signal cycles on real signal nodes, AI traffic following the graph with car-following distance; density from state.traffic, signals toggle from state.signalsOn.
7. js/evolution.js + js/scenarios.js: curriculum from SPEC.md, fitness as specified, success rate, auto-advance at >=70%, keep the best brain across scenarios, save/load/discard in localStorage "neurodrive.brain.v2".
8. js/main.js: camera (follow best car with smooth lerp, overview mode, zoom), game loop on #road: call window.MapView.drawBase, draw cars (best mint, others indigo 0.25 alpha, traffic white/grey), then MapView.drawOverlay. Expose window.NeuroDrive EXACTLY per SPEC.md. If window.MapView is missing, draw a plain fallback of roads so you can test alone. Delete js/road.js and test.html once integration works.
Performance: 100 cars at 60 fps, only query grid cells near each car.
Verify with `npx serve`: no console errors, cars follow streets, best car reaches the destination in scenario 1-2 within ~15 generations. Do NOT commit.
---
## Commit (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git add -A
git commit -m "feat: real Melbourne CBD world, routing, traffic, signals and driving model"
git push
```
