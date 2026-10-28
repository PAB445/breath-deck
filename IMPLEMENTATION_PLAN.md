# BreathDeck — Implementation Plan

Companion to SPECIFICATIONS.md (requirement IDs referenced). Update status here after every change. Fuller background research: the original BreathFlow plan (project store `docs/breathflow-plan.md`).

## Architecture & key decisions
- `src/engine/` plain TS, no React. `AudioEngine` (context, gain chain: voice → styleBus → volume → mute → destination), `Scheduler` (lookahead, Worker tick 25 ms, horizon 0.25 s visible / 4 s hidden, schedules whole phases, cancels future cycles on change, resync on stall), `BreathVoice` (envelope), `Timeline` (scheduled phases for UI), `OutputRouter` (setSinkId).
- `src/pattern/` `timing.ts` pure math; `PatternSource` interface (`ManualSource` V1).
- `src/samples/` `TakeRepository` + IndexedDB impl, `analyse.ts` (mono, HP, trim, normalise, flags), `SampleLibrary` (resolve take by style/phase/duration, stretch), `stretch.ts` (WSOLA, offline, cached).
- `src/recording/` mic capture (AudioWorklet PCM, processing off), `segment.ts` in/out split, `RecordingSetup` wizard.
- `src/state/` zustand store, presets, persistence. `src/ui/` components; circle reads Timeline in rAF against audio clock minus output latency.
- Decisions: own recordings primary; stretch via in-repo WSOLA (offline, 0.75–1.33×, no GPL deps); pause = fresh inhale on resume; style change next phase; quick-picks keep holds; "Same as Mac" speaker default.

## Phases & tasks (status: ☐ todo, ◐ partial, ☑ done)
| # | Task | Reqs | Depends | Status |
|---|---|---|---|---|
| 0 | Docs, scaffold, brand tokens, logo | UI-3,5 | – | ☑ |
| 1.1 | timing.ts + unit tests | TIM-* RATE-1 | 0 | ☑ |
| 1.2 | AudioEngine, Scheduler, Voice, Timeline | AUD-1..6 | 1.1 | ☑ |
| 1.3 | TakeRepository (IndexedDB), analyse, SampleLibrary, upload | SND-5,6 | 0 | ☑ |
| 1.4 | Transport, volume/mute, audio test | PLAY-* VOL-* TEST-1 | 1.2 | ☑ |
| 2.1 | WSOLA stretch + cache + take selection | AUD-7 | 1.3 | ☑ |
| 2.2 | Style switching, hidden-tab horizon, stall resync | AUD-2,4,6 | 1.2 | ☑ |
| 3.1 | Layout, circle, rate/phase/ratio, presets, notes | UI-*, PRE-* | 1.* | ☑ |
| 3.2 | Live Mode + shortcuts | LIVE-1 KEY-1 | 3.1 | ☑ |
| 3.3 | Recording Setup wizard + review grid + segment | SND-3,4 | 1.3 | ☑ |
| 3.4 | Speaker panel (OutputRouter) | SPK-1 | 1.2 | ☑ |
| 3.5 | Themes | UI-4 | 3.1 | ☑ |
| 3.6 | Library export/import | SND-6 | 1.3 | ☐ deferred |
| 4.1 | Automated tests: unit (timing, scheduler, segment: 16 passing) + headless Chrome smoke (`npm run e2e`: playback, rate sweep, style switch, pause/resume, mute, Live Mode, recording of one prompt with fake mic) | – | 1.* | ◐ done; no render/click-detector tests yet |
| 4.2 | Manual Mac checklist (below), 60-min soak | Acceptance | all | ☐ needs owner's Mac |
| 5 | CC0 library starter set bundle | SND-7 | 1.3 | ☐ (needs manual Freesound downloads/licence check) |

## Testing & validation
- Automated: `npm test` (Vitest): timing property checks, scheduler against fake AudioContext (event times exact, no overlaps, next-cycle changes), segment split.
- Manual Mac checklist: record guide on MacBook mic; speed sweep 3→40→3; style switch mid-breath; Spotify alongside with independent volume; Bluetooth Google Home (Same as Mac + chosen speaker, disconnect fallback); hidden tab 10 min; 60-min session; Live Mode at 1280×800.

## Status & outstanding issues
- V1 built, `npm test` and `npm run e2e` pass. Verified in headless Chrome only: scheduler stats clean (0 late events, bounded voices), UI renders in Paper theme, recording pipeline stores 2 takes for a prompt.
- **Not verified on real hardware** (no audio device in build VM): how it sounds, stretch quality, click-free envelopes by ear, Bluetooth/Google Home routing, Spotify alongside, hidden-tab 10 min, 60-min soak, Night theme visuals, Live Mode at 1280×800. Run the manual checklist.
- Deviations from SPECIFICATIONS: uploaded files are stored as processed mono WAV (not original blob); the `breathing_sounds.m4a` fixture is imported via Sound library → "Upload in + out file" (auto split at longest gap); no separate per-style intro screens (style blurb shown on each prompt); Pause is a 150 ms fade then freeze (resume = fresh inhale) as specified.
- Known gaps: main screen scrolls on ~800 px tall displays (Live Mode does not); zip export/import (SND-6 partial: IndexedDB persistence only); CC0 library bundle (SND-7) not started; no AudioWorklet tick fallback (Worker tick used); no automated render/click tests; "Hear it in rhythm" preview in the review grid not built; `navigator.storage.persist()` not requested yet.

## Run locally
`npm install && npm run dev` → http://localhost:5287 (Chrome). `npm test`, `npm run build`.
