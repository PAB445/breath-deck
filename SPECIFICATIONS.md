# BreathDeck — Specifications (single source of truth)

Status legend used in IMPLEMENTATION_PLAN.md. Requirement IDs (e.g. `AUD-3`) are stable; never renumber or silently delete. Changes are logged in the Change Log at the bottom.

## 1. Product overview
BreathDeck is a single-screen web app for **The Breath Reset** breathwork facilitators. It plays realistic, **recorded human breathing** at a live-adjustable pace through the browser's audio output while music (e.g. Spotify) plays independently in another app. macOS mixes both to the selected output (e.g. a Bluetooth Google Home).
- Runs locally in Chrome on macOS (MacBook screen). V1 is for the owner's own sessions.
- Out of scope: backend, auth, database, Spotify API/capture/control, exclusive audio control, music upload.
- Brand: product name **BreathDeck** (with logo); header reads `THE BREATH RESET` / `BreathDeck` / `Your breath. Your rhythm.`

## 2. Functional requirements
- **RATE-1** Rate slider 3–40 breaths/min (BPM), large display, +/− buttons (0.5 step). 
- **RATE-2** Rate changes apply at the next cycle; never restart the current breath.
- **TIM-1** Four phases: inhale, inhale-hold, exhale, exhale-hold (seconds, decimals allowed, e.g. 4:0:4:0). BPM = 60 / sum, auto-computed.
- **TIM-2** Changing total rate preserves the ratio; editing a phase recomputes the total. Math consistent (pure functions, tested).
- **TIM-3** Ratio quick-picks 1:1, 1:2, 2:1, Custom. Quick-picks keep BPM and any holds, splitting the remaining breathing time.
- **VOL-1** Breathing-only volume 0–100 %, smooth. **VOL-2** Prominent mute, instant and click-free.
- **PLAY-1** Large PLAY / PAUSE / STOP. Pause freezes timer, fades out; resume keeps session and starts a fresh inhale. Stop resets.
- **PLAY-2** Show elapsed time, phase, rate, style, volume.
- **PRE-1** Built-in presets: Coherence 5:0:5:0, Relax 4:0:6:0, Balanced 4:0:4:0, Energise 2:0:2:0, Activate 1:0:1:0, Custom.
- **PRE-2** Select, modify, save-as, rename, delete custom presets (localStorage). Built-ins read-only.
- **LIVE-1** Live Mode hides extra settings, enlarges rate + volume, keeps style selector, phase, timer, big mute. Usable on a MacBook screen without scrolling.
- **KEY-1** Space play/pause (not while typing); Up/Down change rate when rate control focused; M mute; Esc exit Live Mode.
- **TEST-1** Audio test button. **NOTE-1** Interface note: BreathDeck uses the Mac's selected output unless a speaker is chosen; no claims about controlling Spotify or guaranteed speaker compatibility.
- **SAFE-1** Discreet note that rapid breathing can cause dizziness, tingling or fainting. App never auto-starts or auto-introduces fast breathing/long holds; initial state is stopped.
- **SPK-1** Speaker panel: "Same as Mac" (default) or choose a connected output (`AudioContext.setSinkId`); Bluetooth connect helper (opens macOS Bluetooth settings); test breath; per-speaker visual offset; fallback to Mac output on disconnect.

## 3. Sound library
- **SND-1** Real recorded human breathing only. No beeps, noise, oscillators or TTS presented as breathing.
- **SND-2** Styles: Soft, Deep, Powerful, Connected (continuous, minimal pauses). Separate inhale and exhale takes per style.
- **SND-3** Guided **Recording Setup** (~10 min): prompts like "Soft · 4 seconds" with an animated circle; records one in+out breath per prompt (two attempts, better kept); 14 prompts → 28 takes (Soft/Deep: 2,4,6 s; Powerful/Connected: 1,2,4,6 s). Mic check with room-tone measurement. Mic processing (echo cancellation, noise suppression, AGC) disabled.
- **SND-4** Review grid: play, re-record single prompt (keep new/old), quality flags (clipping, quiet, noisy, length).
- **SND-5** File upload (WAV, MP3, M4A, OGG, FLAC, WebM) per style/phase as secondary source.
- **SND-6** Persistence in IndexedDB via a `TakeRepository` interface (future Firebase swap). Library export/import.
- **SND-7** Bundled **sample sounds**: real human breathing from Freesound, CC0 only (licence checked on each sound page; source, author and URL listed in-app). One or two source recordings per style, sliced into inhale/exhale takes. Enabled per style with one click (on by default so the app works immediately); once the user has own takes for both phases of a style, those are used instead of samples. Samples can be turned off per style, previewed, and their in/out labels swapped per style (labelling is automatic).
- **SND-8** No sound for a style (no own takes and samples off) → app prompts to use samples or record; never falls back to synthetic sound.
- **SND-10** First run shows a short welcome: "Start with sample sounds" (instant) or "Record your own breath" (5 to 10 min). Recording flow has a visible 3-step structure (Set up incl. microphone check → Record → Review), one clear instruction per screen, and a preview of the next prompt.
- **SND-9** Dev fixture `breathing_sounds.m4a` (inhale 0.10–3.00 s, exhale 4.20–8.00 s) may be imported for testing; not committed.

## 4. Audio engine requirements
- **AUD-1** All timing scheduled on `AudioContext.currentTime` with a lookahead scheduler; JS timers only wake it (Worker timer).
- **AUD-2** Accurate while tab hidden (longer lookahead horizon when hidden).
- **AUD-3** Smooth gain envelopes and crossfades; no clicks, pops, gaps or sudden level changes.
- **AUD-4** Handle AudioContext suspension, performance hiccups (resync, no burst of late events), live rate/style changes, mute, pause/resume.
- **AUD-5** No overlapping schedules, duplicate events or leaks (voices disconnected on end; bounded active voices).
- **AUD-6** Rate/timing change applies next cycle; style change applies next phase with crossfade; volume/mute immediate (ramped).
- **AUD-7** Time-stretch: samples adapt to phase duration with pitch preservation within 0.75–1.33× (offline pre-render, cached). Outside range: fade early/clamp rather than artefacts; limit stated in UI.
- **AUD-9** Breath level: takes normalised so breathing is clearly audible over music at default volume (70 %); perceptual volume curve.
- **AUD-10** Engine verified by automated rendered-audio tests (OfflineAudioContext): breath energy in inhale/exhale, silence in holds, no clicks at voice edges, no clipping, Connected style without gaps, stretch preserves pitch.
- **AUD-8** Pattern source abstraction so Journey/acceleration/beat-sync can be added without engine changes.

## 5. UI/UX requirements
- **UI-1** Single screen, calm, premium; no generic wellness styling, gradients or decorative animation.
- **UI-2** Large circle: expands on inhale, contracts on exhale, still on holds; driven by the engine's actual schedule (audio clock, latency-corrected); shows INHALE/EXHALE/HOLD and countdown of seconds remaining.
- **UI-3** Brand tokens from The Breath Reset: night `#100d0b`, paper `#efe7d9`, ink `#17130f`, ink-soft `#4a4239`, sage `#8fa58a`/`#b3c7ac`/`#46593f`, clay `#d19073`/`#94502f`; fonts Instrument Serif (display) + Manrope (UI).
- **UI-4** Night and Paper themes; default follows OS, toggle persists.
- **UI-5** BreathDeck logo (SVG) in header and favicon.
- **UI-6** Empty/loading/error states; keyboard accessible; reduced-motion respected.
- **UI-7** Professional, easy-to-read layout: clear hierarchy (breath stage left, controls grouped into labelled cards right), main screen fits 1440×900 and 1280×800 without scrolling, consistent spacing, segmented controls instead of many outlined pills, a phase progress ring around the circle, one primary action colour (sage).

## 6. Technical requirements
React + TypeScript, Vite, Tailwind, Web Audio API, zustand, localStorage (presets/settings), IndexedDB (takes). Chrome on macOS. No backend. Dev server port 5287. `localhost` is a secure context (mic + setSinkId).

## 7. Acceptance criteria (definition of done)
Opens on MacBook; Spotify independent; realistic breathing over music; live pace change; inhale/exhale adjustable; Soft↔Powerful switch; independent volume; instant mute; save/load favourites; full 60-minute uninterrupted session; recording guide yields all takes in ≤10 min; Bluetooth speaker selectable in-app.

## 8. Future (V2+)
Journey Builder (timed stages auto-transition); gradual acceleration (e.g. 8→25 BPM over 3 min, explicit confirmation); optional music-beat sync via tapped BPM (no Spotify analysis); Firebase per-user storage/auth; real-time stretching in AudioWorklet; live Freesound browsing.

## Change Log
- 2026-10-28: Redesign implemented. SND-7 clarified: own takes replace samples per style once both phases exist; per-style swap in/out added. SND-10 step 1 named "Set up" (prep + mic).
- 2026-10-28: Redesign request. SND-7 changed from "optional, import later" to bundled samples **enabled by default** (user asked for samples to be easy to use; flagged to user). Added SND-10, UI-7, AUD-9, AUD-10. SND-8 reworded accordingly. First run no longer auto-opens the recording guide (welcome choice instead).
- 2026-10-28: Initial spec from BreathFlow plan; product renamed **BreathDeck** (was "BreathFlow").
