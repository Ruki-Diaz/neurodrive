# Integration and deploy ($0)
After both sides are done, in VS Code with Claude Code:
---
Run `npx serve`, open the page, and fix any mismatch between js/ui.js and window.NeuroDrive per SPEC.md. Delete test.html. Check: no console errors, controls work, sparkline updates, network visualizer animates, saved brain reloads, 375px layout is fine.
---
## Commit + push (you run these)
```bash
cd "$HOME/Documents/Projects Storage/neurodrive"
git add -A
git commit -m "chore: integrate engine and UI"
git branch -M main
git remote add origin https://github.com/Ruki-Diaz/neurodrive.git
git push -u origin main
```
Then import the repo at vercel.com (Hobby plan, free). No build settings needed: static site.
