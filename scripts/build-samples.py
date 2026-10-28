"""Dev-only: download CC0 breath recordings from Freesound (HQ previews), slice them into
inhale/exhale takes and write public/samples/<style>/*.wav + manifest.json.
Requires python3 + numpy + ffmpeg. Licence is re-checked on each sound page."""
import json, os, re, subprocess, urllib.request, wave
import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'samples')
UA = {'User-Agent': 'Mozilla/5.0'}
# style: [(sound id, author, title, event indexes to use)]. Even events are inhales.
SHEYVAN = ('471080', 'Sheyvan', 'Deep Inhales and Exhales (Compilation)')
SETS = {
    'soft': [('410864', 'thomasXkiteXforXlife', 'Long single breath through nose (male) 01', range(0, 8))],
    'deep': [(*SHEYVAN, range(0, 16))],
    'powerful': [('717167', 'rrehl', '- Deep Breath', range(0, 2))],
    # Fast loop covers quick connected breathing; the rest of Sheyvan's set covers 1-3 s phases.
    # Event 3 of the loop is an in+out pair merged into one, so it is skipped.
    'connected': [('554907', 'Nox_Sound', 'Male_Breath_Fast_Loop_Stereo', [0, 1, 2, 4, 5, 6, 7]), (*SHEYVAN, range(16, 24))],
}
_audio = {}


def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()


def env_db(x, win=0.01):
    w = int(SR * win); n = len(x) // w
    e = np.sqrt((x[:n * w].reshape(n, w) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(np.convolve(e, np.ones(7) / 7, 'same'))


def events(x):
    db = env_db(x)
    thr = max(np.percentile(db, 10) + 8, np.percentile(db, 99) - 30)
    on = db > thr
    ev, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            if ev and i - ev[-1][1] < 8: ev[-1][1] = j
            else: ev.append([i, j])
            i = j
        else: i += 1
    return [(a / 100, b / 100) for a, b in ev if (b - a) / 100 >= 0.35]


def write_wav(path, pcm):
    pcm = np.clip(pcm, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((pcm * 32767).astype('<i2').tobytes())


def load(sid, user):
    if sid not in _audio:
        page = get(f'https://freesound.org/people/{user}/sounds/{sid}/').decode('utf8', 'ignore')
        assert re.search(r'publicdomain/zero|Creative Commons 0', page), f'{sid} is not CC0'
        mp3 = re.search(r'data-mp3="([^"]+)"', page).group(1).replace('-lq.mp3', '-hq.mp3')
        tmp = f'/tmp/bd-sample-{sid}.mp3'
        if not os.path.exists(tmp): open(tmp, 'wb').write(get(mp3))
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', tmp, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype=np.float32)
        _audio[sid] = (x, events(x))
    return _audio[sid]


manifest = {
    'licence': 'CC0 1.0 (public domain)',
    'note': 'HQ previews (128 kbps MP3) from Freesound, sliced into takes. Inhale/exhale labelled automatically by alternation; swap in the app if reversed.',
    'styles': {},
}
for style, sources in SETS.items():
    d = os.path.join(OUT, style)
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    takes, credits, n = [], [], {'inhale': 0, 'exhale': 0}
    for sid, user, title, use in sources:
        x, ev = load(sid, user)
        print(style, sid, 'events found', len(ev))
        credits.append({'title': title, 'author': user, 'url': f'https://freesound.org/people/{user}/sounds/{sid}/'})
        for idx in use:
            if idx >= len(ev): continue
            a, b = ev[idx]
            prev_end = ev[idx - 1][1] if idx > 0 else 0
            next_start = ev[idx + 1][0] if idx + 1 < len(ev) else len(x) / SR
            a = max((a + prev_end) / 2, a - 0.12)
            b = min((b + next_start) / 2, b + 0.2)
            seg = x[int(a * SR):int(b * SR)].copy()
            f = int(0.01 * SR)
            seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
            phase = 'inhale' if idx % 2 == 0 else 'exhale'
            n[phase] += 1
            name = f'{phase}-{n[phase]}.wav'
            write_wav(os.path.join(d, name), seg)
            takes.append({'file': f'{style}/{name}', 'phase': phase, 'duration': round(len(seg) / SR, 2)})
    manifest['styles'][style] = {'sources': credits, 'takes': takes}
    print(style, len(takes), [t['duration'] for t in takes])
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)
