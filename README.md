# BreathDeck

Real-time recorded human breathing sounds for breathwork facilitators, by **The Breath Reset**. Runs locally in Chrome on macOS. Your music (e.g. Spotify) plays independently; macOS mixes both to the selected output.

- Product requirements: [SPECIFICATIONS.md](SPECIFICATIONS.md)
- Development plan and status: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Run locally
```bash
npm install
npm run dev        # http://127.0.0.1:5287  (open in Chrome)
npm test           # unit + scheduler tests
npm run build && npm run preview   # http://127.0.0.1:5288
npm run e2e        # headless Chrome smoke tests (needs the dev server running)
```
First run opens **Recording Setup** (about 10 minutes) to record your own breath. Or use Sound library → upload files. Before a session open **Speaker** to check where audio goes, then press Test breath.

Shortcuts: Space play/pause, M mute, Up/Down rate (when the slider is focused), Esc exit Live Mode.

Stack: React, TypeScript, Vite, Tailwind, Web Audio API, zustand. Takes live in IndexedDB; presets and settings in localStorage. No backend.
