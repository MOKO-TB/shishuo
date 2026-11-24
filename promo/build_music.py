import json, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
SR = 48000
tl = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
TOTAL = tl["total"]
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(20261120)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

def env_ad(n, attack, decay, sr=SR):
    a = max(1, int(attack * sr)); d = max(1, int(decay * sr))
    e = np.zeros(n, dtype=np.float32)
    if a < n: e[:a] = np.linspace(0, 1, a) ** 1.2
    tail = np.exp(-np.linspace(0, 6, min(d, n - min(a, n))) )
    e[a:a+len(tail)] *= tail if a + len(tail) <= n else tail[:n-a]
    return e

def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= buf.shape[0]: return
    sig = sig[:buf.shape[0] - i]
    l = np.sqrt((1 - pan) / 2) if pan >= 0 else np.sqrt(1 + pan / 2)
    # equal-power-ish
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    buf[i:i+len(sig), 0] += sig * gain * l
    buf[i:i+len(sig), 1] += sig * gain * r

def pluck(freq, dur=1.6, bright=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2*np.pi*freq*t) + bright*0.5*np.sin(2*np.pi*2*freq*t) * np.exp(-t*2.4)
         + bright*0.22*np.sin(2*np.pi*3.01*freq*t) * np.exp(-t*3.6)
         + bright*0.08*np.sin(2*np.pi*4.97*freq*t) * np.exp(-t*5.0))
    e = np.exp(-t * 3.1) * (1 - np.exp(-t * 900))
    return (s * e).astype(np.float32)

def pad_note(freq, dur, detune=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * 2 ** (detune / 1200)
    lfo = 1 + 0.04 * np.sin(2*np.pi*0.13*t + freq)
    s = np.sin(2*np.pi*f*t) + 0.22*np.sin(2*np.pi*2*f*t) + 0.07*np.sin(2*np.pi*3*f*t)
    a = int(0.6 * SR); r = int(1.4 * SR)
    e = np.ones(n, dtype=np.float32)
    if a < n: e[:a] = np.linspace(0, 1, a) ** 2
    if r < n: e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return (s * e * lfo * (0.5 / max(1, np.sqrt(len([1]))))).astype(np.float32)

def bass_note(freq, dur=1.2):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2*np.pi*freq*t) + 0.12*np.sin(2*np.pi*2*freq*t)
    e = np.exp(-t*2.2) * (1 - np.exp(-t*180))
    return (s*e).astype(np.float32)

def kick(dur=0.42):
    n = int(dur*SR); t = np.arange(n)/SR
    f = 95*np.exp(-t*16) + 42
    s = np.sin(2*np.pi*np.cumsum(f)/SR)
    return (s*np.exp(-t*7)).astype(np.float32)

def shaker(dur=0.09):
    n = int(dur*SR); t = np.arange(n)/SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    # simple high-pass
    noise = np.diff(np.concatenate([[0], noise]))
    return (noise*np.exp(-t*55)*0.5).astype(np.float32)

def whoosh(dur=0.8):
    n = int(dur*SR); t = np.arange(n)/SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    # time-varying one-pole lowpass
    out = np.zeros(n, dtype=np.float32); y = 0.0; prev = 0.0
    for i in range(n):
        fc = 250 + 3400 * (i / n) ** 2
        a = np.exp(-2*np.pi*fc/SR)
        y = (1-a)*noise[i] + a*y
        out[i] = y
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.6
    return (out*e*0.8).astype(np.float32)

def impact(dur=1.6):
    n = int(dur*SR); t = np.arange(n)/SR
    s = np.sin(2*np.pi*(55 - 12*t)*t) * np.exp(-t*2.4)
    noise = rng.normal(0, 1, n).astype(np.float32) * np.exp(-t*9) * 0.12
    return (s*0.8 + noise).astype(np.float32)

# ----- arrangement -----
BPM = 72.0
BEAT = 60 / BPM
BAR = 4 * BEAT
music = np.zeros((N, 2), dtype=np.float32)

# chords: (root midi, [chord tones])
CHORDS = [
    (48, [60, 64, 67, 71]),  # Cmaj7
    (43, [59, 62, 67, 71]),  # G7/B-ish
    (45, [57, 60, 64, 67]),  # Am7
    (41, [57, 60, 65, 69]),  # Fmaj7
]

# scene times
sc = {s["id"]: s for s in tl["scenes"]}
seg = {s["id"]: s for s in tl["segments"]}
T_REVEAL = sc["reveal"]["start"]
T_BREADTH = sc["breadth"]["start"]
T_CLOSING = sc["closing"]["start"]
T_END = tl["total"]

# pad + bass + plucks, bar by bar
n_bars = int(np.ceil(T_END / BAR)) + 1
for b in range(n_bars):
    t0 = b * BAR
    if t0 >= T_END: break
    root, tones = CHORDS[b % 4]
    # pad (always, soft). Intro thinner.
    pad_level = 0.075 if t0 < T_REVEAL else 0.105
    for k, note in enumerate(tones):
        p = pad_note(midi(note - 12), BAR * 1.05, detune=(-4 if k % 2 == 0 else 4))
        add(music, t0, p, pad_level, pan=(-0.45 if k % 2 == 0 else 0.45))
    # bass after reveal
    if t0 >= T_REVEAL - BAR:
        add(music, t0, bass_note(midi(root - 12), BAR * 0.9), 0.11)
    # pluck pattern
    if t0 < T_REVEAL - BAR:
        pattern = [(0.0, 0), (2.0, 2)]
    elif t0 < T_CLOSING - 1:
        pattern = [(0.0, 0), (0.75, 2), (1.5, 1), (2.0, 3), (2.75, 1), (3.5, 2), (3.9, 0)]
    else:
        pattern = [(0.0, 0), (1.5, 2), (2.66, 1)]
    for idx, (beat, tone_idx) in enumerate(pattern):
        note = tones[tone_idx % len(tones)] + (12 if (idx % 4 == 2) else 0)
        tt = t0 + beat * BEAT
        if tt >= T_END - 0.2: continue
        vol = 0.085 if t0 < T_REVEAL else 0.115
        if t0 >= T_CLOSING: vol = 0.075
        add(music, tt, pluck(midi(note + 12), 1.8, 0.3), vol, pan=(-0.5 if idx % 2 else 0.5))

# drums from student scene to breadth end
t_drum_start = sc["student"]["start"] + 0.2
t_drum_end = sc["closing"]["start"] - 0.4
bt = t_drum_start
beat_i = 0
while bt < t_drum_end:
    bar_pos = (bt - t_drum_start) % BAR
    if beat_i % 4 in (0, 2):
        add(music, bt, kick(), 0.10)
    # shaker on offbeats
    add(music, bt + BEAT * 0.5, shaker(), 0.028, pan=0.3)
    add(music, bt + BEAT * 0.25, shaker(), 0.014, pan=-0.3)
    bt += BEAT / 2
    beat_i += 1

# clock ticks in the problem scene
for i in range(int(sc["reveal"]["start"] / BEAT)):
    tt = i * BEAT + 0.0
    n = int(0.03*SR); t = np.arange(n)/SR
    tick = (np.sin(2*np.pi*1500*t) * np.exp(-t*160) * 0.05).astype(np.float32)
    add(music, tt, tick, 0.6, pan=0.15)

# transitions
for t, gain in [(T_REVEAL, 0.26), (T_BREADTH, 0.2), (T_CLOSING, 0.22)]:
    add(music, t - 0.35, whoosh(0.9), gain, pan=-0.2)
    add(music, t, impact(), 0.24)

# final shimmer at closing
for k, note in enumerate([72, 76, 79, 84, 88]):
    add(music, T_CLOSING + 0.4 + k * 0.55, pluck(midi(note), 2.8, 0.25), 0.045, pan=(-0.6 + 0.3*k))

# ----- simple stereo reverb (FFT convolution) -----
def make_ir(seconds=1.9):
    n = int(seconds*SR); t = np.arange(n)/SR
    ir = rng.normal(0, 1, (n, 2)).astype(np.float32)
    decay = np.exp(-t*3.2).astype(np.float32)
    ir *= decay[:, None]
    # early reflections
    for d, g in [(0.03, 0.5), (0.07, 0.35), (0.11, 0.25), (0.17, 0.18)]:
        i = int(d*SR); ir[i:i+200] += g
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir

def fft_convolve(sig, ir):
    n = len(sig) + len(ir) - 1
    nfft = 1 << (n - 1).bit_length()
    S = np.fft.rfft(sig, nfft); H = np.fft.rfft(ir, nfft)
    return np.fft.irfft(S * H, nfft)[:len(sig)].astype(np.float32)

ir = make_ir()
wet = np.stack([fft_convolve(music[:, 0], ir[:, 0]), fft_convolve(music[:, 1], ir[:, 1])], axis=1)
music = music * 0.82 + wet * 0.22

# ----- duck under voice -----
duck = np.ones(N, dtype=np.float32)
for m in tl["segments"]:
    a = int((m["start"] - 0.18) * SR); r = int((m["start"] + m["duration"] + 0.35) * SR)
    a = max(0, a); r = min(N, r)
    if r > a:
        duck[a:r] = np.minimum(duck[a:r], 0.52)
# smooth duck envelope
k = int(0.25 * SR)
kernel = np.hanning(k).astype(np.float32); kernel /= kernel.sum()
duck = np.convolve(duck, kernel, mode="same").astype(np.float32)
music *= duck[:, None]

# final fade
fade_in = int(1.2*SR); music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
fade_out = int(2.2*SR); music[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]

peak = float(np.max(np.abs(music))) or 1.0
music = music / peak * 0.72
out = ROOT / "audio" / "music.wav"
with wave.open(str(out), "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((music * 32767).astype(np.int16).tobytes())
print("music", round(T_END, 2), "s ->", out)
