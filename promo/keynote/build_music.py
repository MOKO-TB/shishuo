import json, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
SR = 48000
tl = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
TOTAL = tl["total"]
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(20261122)
BPM = tl.get("bpm", 96)
BEAT = 60 / BPM
BAR = 4 * BEAT

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= buf.shape[0]: return
    sig = sig[:buf.shape[0] - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    buf[i:i+len(sig), 0] += sig * gain * l
    buf[i:i+len(sig), 1] += sig * gain * r

def pluck(freq, dur=1.8, bright=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2*np.pi*freq*t) + bright*0.5*np.sin(2*np.pi*2*freq*t)*np.exp(-t*2.4)
         + bright*0.22*np.sin(2*np.pi*3.01*freq*t)*np.exp(-t*3.6)
         + bright*0.08*np.sin(2*np.pi*4.97*freq*t)*np.exp(-t*5.0))
    e = np.exp(-t*3.0) * (1 - np.exp(-t*900))
    return (s*e).astype(np.float32)

def pad_note(freq, dur, detune=0.0):
    n = int(dur*SR); t = np.arange(n)/SR
    f = freq * 2 ** (detune/1200)
    lfo = 1 + 0.04*np.sin(2*np.pi*0.13*t + freq)
    s = np.sin(2*np.pi*f*t) + 0.22*np.sin(2*np.pi*2*f*t) + 0.07*np.sin(2*np.pi*3*f*t)
    a = int(0.55*SR); r = int(1.3*SR)
    e = np.ones(n, dtype=np.float32)
    if a < n: e[:a] = np.linspace(0, 1, a) ** 2
    if r < n: e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return (s*e*lfo*0.5).astype(np.float32)

def bass_note(freq, dur=1.3):
    n = int(dur*SR); t = np.arange(n)/SR
    s = np.sin(2*np.pi*freq*t) + 0.12*np.sin(2*np.pi*2*freq*t)
    e = np.exp(-t*2.0) * (1 - np.exp(-t*180))
    return (s*e).astype(np.float32)

def kick(dur=0.45):
    n = int(dur*SR); t = np.arange(n)/SR
    f = 92*np.exp(-t*15) + 42
    s = np.sin(2*np.pi*np.cumsum(f)/SR)
    return (s*np.exp(-t*6.5)).astype(np.float32)

def clap(dur=0.18):
    n = int(dur*SR); t = np.arange(n)/SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    # band-ish clap
    out = np.zeros(n, dtype=np.float32); y = 0
    for i in range(n):
        y = 0.55*y + 0.45*noise[i]
        out[i] = noise[i] - y
    return (out*np.exp(-t*22)*0.55).astype(np.float32)

def hat(dur=0.06):
    n = int(dur*SR); t = np.arange(n)/SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    noise = np.diff(np.concatenate([[0], noise]))
    return (noise*np.exp(-t*70)*0.45).astype(np.float32)

def tick(dur=0.035):
    n = int(dur*SR); t = np.arange(n)/SR
    return (np.sin(2*np.pi*1450*t)*np.exp(-t*150)*0.06).astype(np.float32)

def whoosh(dur=0.9):
    n = int(dur*SR); t = np.arange(n)/SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    out = np.zeros(n, dtype=np.float32); y = 0.0
    for i in range(n):
        fc = 220 + 3200*(i/n)**2
        a = np.exp(-2*np.pi*fc/SR)
        y = (1-a)*noise[i] + a*y
        out[i] = y
    e = np.sin(np.pi*np.linspace(0, 1, n))**1.7
    return (out*e*0.8).astype(np.float32)

def impact(dur=1.8):
    n = int(dur*SR); t = np.arange(n)/SR
    s = np.sin(2*np.pi*(55 - 10*t)*t)*np.exp(-t*2.2)
    noise = rng.normal(0, 1, n).astype(np.float32)*np.exp(-t*8)*0.1
    return (s*0.75 + noise).astype(np.float32)

music = np.zeros((N, 2), dtype=np.float32)
SC = {s["id"]: s for s in tl["scenes"]}
S = {s["id"]: s for s in tl["segments"]}
T_REVEAL = SC["reveal"]["start"]
T_STUDENT = SC["student"]["start"]
T_TEACHER = SC["teacher"]["start"]
T_BREADTH = SC["breadth"]["start"]
T_PROOF = SC["proof"]["start"]
T_CLOSE = SC["close"]["start"]
T_END = TOTAL

CHORDS = [
    (48, [60, 64, 67, 71]),  # Cmaj7
    (43, [59, 62, 67, 71]),  # G
    (45, [57, 60, 64, 67]),  # Am7
    (41, [57, 60, 65, 69]),  # Fmaj7
]

def section_gain(t):
    # returns (drums, hats16, pad, pluck)
    if t < T_REVEAL: return (0, 0, .9, .7)
    if t < T_BREADTH: return (1, 0, 1, 1)
    if t < T_PROOF: return (1, 1, 1, 1.15)
    if t < T_CLOSE: return (.15, 0, .8, .55)
    return (0, 0, .85, .5)

# pads + bass + plucks
n_bars = int(np.ceil(T_END / BAR)) + 1
for b in range(n_bars):
    t0 = b * BAR
    if t0 >= T_END: break
    root, tones = CHORDS[b % 4]
    dg, h16, pg, plg = section_gain(t0)
    pad_level = 0.085 * pg
    for k, note in enumerate(tones):
        p = pad_note(midi(note - 12), BAR * 1.06, detune=(-4 if k % 2 == 0 else 4))
        add(music, t0, p, pad_level, pan=(-0.45 if k % 2 == 0 else 0.45))
    if t0 >= T_REVEAL - BAR:
        add(music, t0, bass_note(midi(root - 12), BAR * 0.92), 0.105 * (0.7 if t0 >= T_PROOF else 1))
    # pluck pattern
    if t0 < T_REVEAL - BAR:
        pattern = [(0.0, 0), (2.0, 2)]
    elif t0 < T_PROOF:
        pattern = [(0.0, 0), (0.75, 2), (1.5, 1), (2.0, 3), (2.75, 1), (3.5, 2)]
    elif t0 < T_CLOSE:
        pattern = [(0.0, 0), (1.0, 2), (2.0, 1), (3.0, 3)]
    else:
        pattern = [(0.0, 0), (1.5, 2), (2.66, 1)]
    for idx, (beat, tone_idx) in enumerate(pattern):
        note = tones[tone_idx % len(tones)] + (12 if idx % 4 == 2 else 0)
        tt = t0 + beat * BEAT
        if tt >= T_END - .2: continue
        vol = 0.10 * plg
        if t0 >= T_CLOSE: vol = 0.07
        add(music, tt, pluck(midi(note + 12), 1.9, .3), vol, pan=(-0.5 if idx % 2 else 0.5))

# drums
bt = T_REVEAL
beat_i = 0
while bt < T_CLOSE - .2:
    dg, h16, _, _ = section_gain(bt)
    if dg > 0:
        pos = beat_i % 4
        if pos in (0, 2):
            add(music, bt, kick(), 0.10 * dg)
        if pos in (1, 3):
            add(music, bt, clap(), 0.055 * dg, pan=0.1)
        # hats
        add(music, bt + BEAT*0.5, hat(), 0.028 * dg, pan=0.35)
        if h16:
            add(music, bt + BEAT*0.25, hat(), 0.016 * dg, pan=-0.3)
            add(music, bt + BEAT*0.75, hat(), 0.016 * dg, pan=0.3)
        if pos == 3 and int(bt / BAR) % 4 == 3:
            add(music, bt + BEAT*0.75, hat(), 0.02 * dg, pan=0)
    bt += BEAT
    beat_i += 1

# ticks in cold/problem/proof
for a, b in [(0, T_REVEAL), (T_PROOF, T_CLOSE)]:
    tt = a
    while tt < b:
        add(music, tt, tick(), 0.55, pan=0.15)
        tt += BEAT

# transitions: suck-out + whoosh + impact
acts = [T_REVEAL, T_STUDENT, T_TEACHER, T_BREADTH, T_PROOF, T_CLOSE]
for t in acts:
    add(music, t - .38, whoosh(0.85), 0.22, pan=-0.2)
    add(music, t, impact(), 0.22)
    # suck out just before
    a = max(0, int((t - .55) * SR)); b = max(0, int((t - .12) * SR))
    if b > a: music[a:b] *= np.linspace(1, .12, b - a)[:, None]

# final chord shimmer
for k, note in enumerate([72, 76, 79, 84, 88]):
    add(music, T_CLOSE + .5 + k * .5, pluck(midi(note), 3.0, .22), 0.04, pan=(-.6 + .3*k))

# reverb
def make_ir(seconds=2.0):
    n = int(seconds*SR); t = np.arange(n)/SR
    ir = rng.normal(0, 1, (n, 2)).astype(np.float32)
    ir *= np.exp(-t*3.0)[:, None]
    for d, g in [(0.03, .5), (0.07, .35), (0.11, .25), (0.17, .18)]:
        i = int(d*SR); ir[i:i+200] += g
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir

def fft_convolve(sig, ir):
    n = len(sig) + len(ir) - 1
    nfft = 1 << (n - 1).bit_length()
    Sf = np.fft.rfft(sig, nfft); H = np.fft.rfft(ir, nfft)
    return np.fft.irfft(Sf * H, nfft)[:len(sig)].astype(np.float32)

ir = make_ir()
wet = np.stack([fft_convolve(music[:, 0], ir[:, 0]), fft_convolve(music[:, 1], ir[:, 1])], axis=1)
music = music * 0.84 + wet * 0.20

# duck under voice
duck = np.ones(N, dtype=np.float32)
for m in tl["segments"]:
    a = int((m["start"] - .18) * SR); r = int((m["start"] + m["duration"] + .32) * SR)
    a = max(0, a); r = min(N, r)
    if r > a: duck[a:r] = np.minimum(duck[a:r], .5)
k = int(.25 * SR); kernel = np.hanning(k).astype(np.float32); kernel /= kernel.sum()
duck = np.convolve(duck, kernel, mode="same").astype(np.float32)
music *= duck[:, None]

# fades
fi = int(1.0*SR); music[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(2.6*SR); music[-fo:] *= np.linspace(1, 0, fo)[:, None]

peak = float(np.max(np.abs(music))) or 1.0
music = music / peak * 0.72
out = ROOT / "audio" / "music.wav"
with wave.open(str(out), "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((music * 32767).astype(np.int16).tobytes())
print("music", round(T_END, 2), "s", out)
