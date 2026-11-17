# Antigravity: UI
Open this folder in Antigravity, start an agent, paste everything below the line.
---
Read SPEC.md first and obey the file ownership table. You own ONLY index.html, css/style.css, js/ui.js, assets/*, README.md. Do not touch js/ files owned by Claude Code.

Build a premium, award-style landing page + app UI. Pure CSS, no frameworks, only the 3 palette colors plus rgba tints and white text.
- Define :root variables --onyx #01010D, --indigo #6331FB, --mint #88F9C0.
- Hero: huge Anton uppercase headline, e.g. "TEACH cars to drive" with an italic Instrument Serif mint word ("without limits"), indigo radial glow, grain overlay, mint pill CTA "Start training →", chips: "100 cars", "0 libraries", "100% free".
- App section: glassmorphism cards (backdrop-filter blur, 1px rgba border, 20px radius). Large <canvas id="road"> with indigo glow border, <canvas id="network"> card, control panel (sliders with mint thumbs for mutation/traffic, segmented control for population 50/100/200 and lanes 2-5, pill buttons: Start/Pause, Reset, Save brain, Load brain, Discard).
- Stat cards: generation, alive, best distance with animated counters, plus a sparkline <canvas id="spark"> of history drawn by ui.js.
- ui.js: wire everything to window.NeuroDrive per SPEC.md. Feature-detect and fall back to a mock (fake stats at 10/s) so the UI works before the engine exists. Keyboard: Space pause, R reset, S save.
- Micro-interactions: hover lift, button glow, fade-up with IntersectionObserver. Respect prefers-reduced-motion. Responsive to 375px, WCAG AA contrast.
- Assets: SVG favicon (indigo/mint), og:image meta tags, meta description. README with how it works and run instructions (`npx serve`).
Footer: "Built by Rukshan" + link to github.com/Ruki-Diaz.

When done, DO NOT commit. Tell me what to run.
---
## Commit commands (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git add index.html css/ js/ui.js assets/ README.md
git commit -m "feat: premium indigo/mint UI, controls and README"
```
