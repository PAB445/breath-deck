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
npm run e2e        # headless Chrome: smoke, recording, rendered-audio and UI checks (needs the dev server running)
```
On first run, choose **Start with sample sounds** (bundled CC0 breathing from Freesound, credited in Sounds → Sample sounds) or **Record your own breath** (a guided 5 to 10 minutes). Your own takes replace the samples style by style. You can also upload files in Sounds → Upload. Before a session open **Speaker** to check where audio goes, then press Test breath.

Sample sounds live in `public/samples/` and are rebuilt with `python3 scripts/build-samples.py` (needs numpy and ffmpeg).

Shortcuts: Space play/pause, M mute, Up/Down rate (when the slider is focused), Esc exit Live Mode.

Stack: React, TypeScript, Vite, Tailwind, Web Audio API, zustand. Takes live in IndexedDB; presets and settings in localStorage. No backend.
