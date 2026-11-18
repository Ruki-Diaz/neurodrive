# Antigravity: Melbourne map renderer + UI
Open the folder in Antigravity, start an agent, paste everything below the line.
---
Read SPEC.md (v2) fully. You own ONLY index.html, css/style.css, js/ui.js, js/mapview.js, js/minimap.js, assets/*, README.md. Never touch the engine files.

Make NeuroDrive look like a premium night-city live map of the Melbourne CBD, NOT a cartoon. Palette only: #01010D, #6331FB, #88F9C0 plus rgba tints and white.
1. js/mapview.js implementing window.MapView exactly per SPEC.md. init(world) pre-renders static layers to an offscreen canvas at a few zoom tiers. Style: onyx ground, building footprints as faint indigo fills with 1px lighter edge, roads as indigo-tinted ribbons (width from road.width, major roads brighter, one-way streets get subtle chevrons), tram lines as thin mint dotted lines, soft glow on major roads. drawOverlay: street name labels along roads (Inter, small caps, readable, rotated, skip overlaps), landmark pins with names, the route as a glowing mint dashed line, destination marker with pulse, traffic signals as small dots coloured by hud.signals state. Must hold 60 fps: cache, cull to cam viewport, no per-frame allocation.
2. Until the engine exists, build a tiny mock world (a few streets) so you can develop. Feature-detect the real window.NeuroDrive.
3. Live HUD over #road (glass cards): speed in km/h with the street limit, current street name, route progress bar, destination name, mini signal indicator. Scenario picker (cards for each state.scenarios with difficulty chips) calling actions.setScenario. Toggles: Traffic, Signals, View (Follow/Overview), zoom +/-. Success-rate ring and generation stats.
4. js/minimap.js: draw #minimap (whole CBD, route, car dot in mint, pulsing) from SPEC data.
5. Rework the hero: headline like "TEACH cars to drive Melbourne" with an italic Instrument Serif mint word ("on its own"), chips "Real OpenStreetMap data", "0 libraries", "100% free". Keep the glassmorphism cards, sparkline and control panel; fix units to metres and km/h.
6. Footer + README: attribution "Map data (c) OpenStreetMap contributors (ODbL)", "Built by Rukshan", github.com/Ruki-Diaz, how it works (graph, A*, sensors, neuroevolution).
Responsive to 375px (minimap collapses into a toggle), prefers-reduced-motion, WCAG AA. Do NOT commit.
---
## Commit (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git add -A
git commit -m "feat: night-city Melbourne map renderer, HUD, minimap and scenario picker"
git push
```
