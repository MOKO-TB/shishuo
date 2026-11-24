import json
import os
import subprocess
import wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(ROOT, "audio_v2")
TL_PATH = os.path.join(ROOT, "timeline_v2.json")
SR = 48000
BPM = 108.0
BEAT = 60.0 / BPM  # 0.55556s


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def lowpass_1pole(sig: np.ndarray, cutoff_hz: float) -> np.ndarray:
    rc = 1.0 / (2.0 * np.pi * cutoff_hz)
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    out = np.empty_like(sig)
    y = 0.0
    # Vectorized chunked approximation via FFT for speed & clean slope
    freqs = np.fft.rfftfreq(len(sig), d=1.0 / SR)
    spec = np.fft.rfft(sig)
    h = 1.0 / np.sqrt(1.0 + (freqs / cutoff_hz) ** 4)
    return np.fft.irfft(spec * h, n=len(sig)).astype(np.float32)


def add_stereo(buf: np.ndarray, start_sec: float, mono: np.ndarray, pan: float = 0.0, gain: float = 1.0):
    i0 = int(round(start_sec * SR))
    if i0 >= len(buf) or i0 + len(mono) <= 0:
        return
    src_s = max(0, -i0)
    dst_s = max(0, i0)
    n = min(len(mono) - src_s, len(buf) - dst_s)
    if n <= 0:
        return
    ang = (pan + 1.0) * 0.25 * np.pi
    gl = np.cos(ang) * gain
    gr = np.sin(ang) * gain
    seg = mono[src_s : src_s + n]
    buf[dst_s : dst_s + n, 0] += seg * gl
    buf[dst_s : dst_s + n, 1] += seg * gr


def synth_kick(dur=0.28):
    t = np.arange(int(dur * SR), dtype=np.float32) / SR
    f = 42.0 + 95.0 * np.exp(-t * 34.0)
    phase = 2.0 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t * 14.0) * smoothstep(t / 0.003)
    click = np.exp(-t * 240.0) * np.sin(2.0 * np.pi * 1200.0 * t) * 0.15
    return (np.sin(phase) * env + click).astype(np.float32)


def synth_hat(dur=0.055, accent=1.0):
    rng = np.random.default_rng(42)
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    # High-pass via FFT
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    spec = np.fft.rfft(noise)
    spec *= (freqs > 6500.0) * np.exp(-((freqs - 10500.0) / 4200.0) ** 2)
    hi = np.fft.irfft(spec, n=n).astype(np.float32)
    hi /= (np.max(np.abs(hi)) + 1e-6)
    env = np.exp(-t * (55.0 if accent > 0.8 else 90.0)) * smoothstep(t / 0.0015)
    return (hi * env * accent).astype(np.float32)


def synth_bell_pluck(midi_note: float, dur: float = 0.85):
    t = np.arange(int(dur * SR), dtype=np.float32) / SR
    f0 = midi_to_hz(midi_note)
    sig = (
        0.65 * np.sin(2 * np.pi * f0 * t) * np.exp(-t * 4.5)
        + 0.24 * np.sin(2 * np.pi * f0 * 2.0 * t) * np.exp(-t * 7.5)
        + 0.09 * np.sin(2 * np.pi * f0 * 3.0 * t) * np.exp(-t * 11.0)
        + 0.04 * np.sin(2 * np.pi * f0 * 4.01 * t) * np.exp(-t * 15.0)
    )
    env = smoothstep(t / 0.005)
    return (sig * env).astype(np.float32)


def synth_piano_note(midi_note: float, dur: float = 2.6):
    t = np.arange(int(dur * SR), dtype=np.float32) / SR
    f0 = midi_to_hz(midi_note)
    sig = (
        0.62 * np.sin(2 * np.pi * f0 * t) * np.exp(-t * 1.45)
        + 0.25 * np.sin(2 * np.pi * f0 * 2.0 * t) * np.exp(-t * 2.5)
        + 0.10 * np.sin(2 * np.pi * f0 * 3.0 * t) * np.exp(-t * 4.0)
        + 0.04 * np.sin(2 * np.pi * f0 * 4.0 * t) * np.exp(-t * 6.0)
    )
    env = smoothstep(t / 0.008) * (1.0 - smoothstep((t - (dur - 0.15)) / 0.15))
    return (sig * env).astype(np.float32)


def synth_whoosh(dur=0.65):
    rng = np.random.default_rng(7)
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    spec = np.fft.rfft(noise)
    # Bandpass warm air sweep
    bp = np.exp(-((freqs - 520.0) / 420.0) ** 2)
    air = np.fft.irfft(spec * bp, n=n).astype(np.float32)
    air /= (np.max(np.abs(air)) + 1e-6)
    env = np.sin(np.pi * t / dur) ** 1.8
    sub = np.sin(2 * np.pi * (55.0 + 35.0 * np.sin(np.pi * t / dur)) * t) * env * 0.45
    return (air * env * 0.35 + sub).astype(np.float32)


def synth_impact(dur=1.4):
    t = np.arange(int(dur * SR), dtype=np.float32) / SR
    f = 38.0 + 68.0 * np.exp(-t * 10.0)
    phase = 2.0 * np.pi * np.cumsum(f) / SR
    sub = np.sin(phase) * np.exp(-t * 2.6) * smoothstep(t / 0.004)
    shimmer = np.sin(2 * np.pi * 587.33 * t) * np.exp(-t * 4.5) * 0.12
    return (sub * 0.85 + shimmer).astype(np.float32)


def synth_ui_tick(freq=1950.0, dur=0.025):
    t = np.arange(int(dur * SR), dtype=np.float32) / SR
    return (np.sin(2 * np.pi * freq * t) * np.exp(-t * 180.0) * smoothstep(t / 0.001)).astype(np.float32)


def synth_ui_click():
    t = np.arange(int(0.055 * SR), dtype=np.float32) / SR
    a = np.sin(2 * np.pi * 1280.0 * t) * np.exp(-t * 110.0)
    b = np.sin(2 * np.pi * 640.0 * t) * np.exp(-t * 70.0) * 0.6
    return ((a + b) * smoothstep(t / 0.0012)).astype(np.float32)


def synth_success_chime():
    d = 0.75
    n = int(d * SR)
    out = np.zeros(n, dtype=np.float32)
    for idx, m in enumerate([74, 77, 81, 86]):  # D5, F5, A5, D6
        note = synth_bell_pluck(m, dur=0.55)
        s = int(idx * 0.055 * SR)
        e = min(n, s + len(note))
        out[s:e] += note[: e - s] * 0.45
    return out


def main():
    with open(TL_PATH, "r", encoding="utf-8") as f:
        tl = json.load(f)

    total_sec = float(tl["totalSec"])
    acts = {a["id"]: a for a in tl["acts"]}
    cues = tl["cues"]

    n_samples = int(np.ceil(total_sec * SR))
    t_all = np.arange(n_samples, dtype=np.float32) / SR
    music = np.zeros((n_samples, 2), dtype=np.float32)

    # Chord progression in D minor (4 bars = 16 beats = 8.889s per cycle)
    # Dm9, Bbmaj7, Fmaj7, Am7
    chords = [
        {"bass": 38, "pad": [50, 57, 60, 64, 65], "arp": [62, 65, 69, 72, 74, 69, 65, 69]},
        {"bass": 34, "pad": [46, 53, 57, 60, 62], "arp": [58, 62, 65, 69, 70, 65, 62, 65]},
        {"bass": 41, "pad": [53, 57, 60, 64, 69], "arp": [60, 64, 69, 72, 77, 72, 69, 64]},
        {"bass": 45, "pad": [45, 52, 55, 60, 64], "arp": [64, 67, 72, 76, 79, 76, 72, 67]},
    ]
    bar_sec = BEAT * 4.0  # 2.222s per chord

    # 1. Warm Obsidian Pad + Deep Sub-bass (continuous, smooth crossfaded chords)
    pad_l = np.zeros(n_samples, dtype=np.float32)
    pad_r = np.zeros(n_samples, dtype=np.float32)
    sub_mono = np.zeros(n_samples, dtype=np.float32)

    num_bars = int(np.ceil(total_sec / bar_sec)) + 1
    for b in range(num_bars):
        ch = chords[b % len(chords)]
        bs = b * bar_sec
        be = min(total_sec, (b + 1) * bar_sec + 0.35)
        i0 = int(round(bs * SR))
        i1 = min(n_samples, int(round(be * SR)))
        if i1 <= i0:
            continue
        tb = np.arange(i1 - i0, dtype=np.float32) / SR
        dur_b = (i1 - i0) / SR
        env = smoothstep(tb / 0.35) * (1.0 - smoothstep((tb - (dur_b - 0.38)) / 0.38))

        # Sub bass
        fb = midi_to_hz(ch["bass"])
        sub = (0.8 * np.sin(2 * np.pi * fb * tb) + 0.2 * np.sin(2 * np.pi * fb * 2.0 * tb)) * env
        sub_mono[i0:i1] += sub * 0.20

        # Lush stereo pad (slightly detuned harmonics)
        pl = np.zeros_like(tb)
        pr = np.zeros_like(tb)
        for k, m in enumerate(ch["pad"]):
            fm = midi_to_hz(m)
            det = 0.0022 * ((k % 3) - 1)
            pl += np.sin(2 * np.pi * fm * (1.0 - det) * tb + k * 0.7) * (0.20 - k * 0.015)
            pr += np.sin(2 * np.pi * fm * (1.0 + det) * tb + k * 1.3) * (0.20 - k * 0.015)
            # Soft 2nd harmonic warmth
            pl += np.sin(2 * np.pi * fm * 2.0 * tb) * 0.035
            pr += np.sin(2 * np.pi * fm * 2.0 * tb + 0.5) * 0.035
        pad_l[i0:i1] += pl * env * 0.42
        pad_r[i0:i1] += pr * env * 0.42

    # Gentle LPF on pads for luxury warmth
    pad_l = lowpass_1pole(pad_l, 1500.0)
    pad_r = lowpass_1pole(pad_r, 1500.0)
    music[:, 0] += pad_l + sub_mono
    music[:, 1] += pad_r + sub_mono

    # 2. Crystalline Arpeggio (Act 2 through Act 7)
    arp_start = acts["act2"]["start"]
    arp_end = total_sec - 4.2
    step_sec = BEAT * 0.5  # 8th notes
    step_idx = 0
    cur = arp_start
    while cur < arp_end:
        bar_i = int(cur / bar_sec)
        ch = chords[bar_i % len(chords)]
        note = ch["arp"][step_idx % len(ch["arp"])]
        vel = 0.13 if (step_idx % 2 == 0) else 0.085
        if cur > acts["act4"]["start"]:
            vel *= 1.12
        pan = -0.35 if (step_idx % 2 == 0) else 0.35
        pluck = synth_bell_pluck(note, dur=0.75)
        add_stereo(music, cur, pluck, pan=pan, gain=vel)
        add_stereo(music, cur + BEAT * 0.75, pluck * 0.36, pan=-pan * 0.8, gain=vel * 0.65)
        cur += step_sec
        step_idx += 1

    # 3. Minimal Precision Percussion (Act 2 -> near end)
    kick_snd = synth_kick()
    hat_soft = synth_hat(accent=0.42)
    hat_acc = synth_hat(accent=0.90)
    beat_t = acts["act2"]["start"]
    b_idx = 0
    while beat_t < total_sec - 4.5:
        if b_idx % 2 == 0:
            add_stereo(music, beat_t, kick_snd, pan=0.0, gain=0.20)
        elif b_idx % 4 == 3 and beat_t > acts["act4"]["start"]:
            add_stereo(music, beat_t + BEAT * 0.5, kick_snd, pan=0.0, gain=0.12)
        add_stereo(music, beat_t + BEAT * 0.5, hat_acc, pan=0.18, gain=0.06)
        if beat_t > acts["act3"]["start"]:
            add_stereo(music, beat_t + BEAT * 0.25, hat_soft, pan=-0.22, gain=0.035)
            add_stereo(music, beat_t + BEAT * 0.75, hat_soft, pan=0.22, gain=0.035)
        beat_t += BEAT
        b_idx += 1

    # 4. Warm Finale Piano (last 5.5s)
    fin_s = max(0.0, total_sec - 5.8)
    finale_notes = [
        (0.0, 62, 0.20, -0.2),
        (0.6, 69, 0.18, 0.15),
        (1.2, 74, 0.20, 0.25),
        (2.1, 77, 0.20, 0.10),
        (3.1, 74, 0.22, 0.0),
        (3.15, 81, 0.16, -0.2),
    ]
    for off, m, g, p in finale_notes:
        add_stereo(music, fin_s + off, synth_piano_note(m, dur=3.2), pan=p, gain=g)

    # 5. Cinematic Transitions & UI Micro-interaction SFX
    whoosh = synth_whoosh()
    impact = synth_impact()
    click = synth_ui_click()
    chime = synth_success_chime()

    add_stereo(music, 0.08, impact, pan=0.0, gain=0.36)
    for aid in ["act2", "act3", "act4", "act5", "act6", "act7"]:
        ts = acts[aid]["start"]
        add_stereo(music, max(0.0, ts - 0.25), whoosh, pan=0.0, gain=0.26)
        if aid in ("act2", "act4", "act6"):
            add_stereo(music, ts, impact, pan=0.0, gain=0.26)

    # Act 2: Student typing + submit click + AI answer chime
    a2s = acts["act2"]["start"]
    for i in range(11):
        add_stereo(music, a2s + 1.2 + i * 0.13, synth_ui_tick(1750 + (i % 3) * 180), pan=-0.1, gain=0.10)
    add_stereo(music, a2s + 3.1, click, pan=0.15, gain=0.24)
    add_stereo(music, a2s + 5.2, chime, pan=0.0, gain=0.22)

    # Act 4: Teacher wall click + review pack switch
    a4s = acts["act4"]["start"]
    add_stereo(music, a4s + 2.3, click, pan=0.15, gain=0.24)
    add_stereo(music, a4s + 9.2, click, pan=-0.1, gain=0.20)

    # Act 5: Teacher send & save FAQ chime
    a5s = acts["act5"]["start"]
    add_stereo(music, a5s + 5.6, click, pan=0.25, gain=0.26)
    add_stereo(music, a5s + 5.8, chime, pan=0.0, gain=0.26)

    # 6. Dynamic Energy Envelope & Vocal Sidechain Ducking
    # Fade in 1.2s, fade out last 2.4s
    fade_in = smoothstep(t_all / 1.2)
    fade_out = 1.0 - smoothstep((t_all - (total_sec - 2.4)) / 2.4)
    env_master = fade_in * fade_out

    duck = np.ones(n_samples, dtype=np.float32)
    for c in cues:
        s0 = max(0.0, c["start"] - 0.14)
        s1 = c["start"] + 0.04
        e0 = c["end"] - 0.02
        e1 = min(total_sec, c["end"] + 0.30)
        i_s0, i_s1 = int(s0 * SR), int(s1 * SR)
        i_e0, i_e1 = int(e0 * SR), int(e1 * SR)
        target = 0.46  # ~ -6.7 dB during voiceover
        if i_s1 > i_s0:
            ramp = 1.0 - (1.0 - target) * smoothstep(np.linspace(0, 1, i_s1 - i_s0, dtype=np.float32))
            duck[i_s0:i_s1] = np.minimum(duck[i_s0:i_s1], ramp)
        if i_e0 > i_s1:
            duck[i_s1:i_e0] = np.minimum(duck[i_s1:i_e0], target)
        if i_e1 > i_e0:
            ramp = target + (1.0 - target) * smoothstep(np.linspace(0, 1, i_e1 - i_e0, dtype=np.float32))
            duck[i_e0:i_e1] = np.minimum(duck[i_e0:i_e1], ramp)

    music[:, 0] *= env_master * duck
    music[:, 1] *= env_master * duck

    # Soft limiter
    peak = float(np.max(np.abs(music))) + 1e-9
    music = np.tanh(music * (0.92 / max(peak, 0.85))) * 0.88

    music_wav = os.path.join(AUDIO_DIR, "music.wav")
    pcm = np.clip(music * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(music_wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    vo_wav = os.path.join(AUDIO_DIR, "vo_master.wav")
    final_wav = os.path.join(AUDIO_DIR, "final_audio.wav")

    # Mix VO + Music with broadcast loudness normalization (-15 LUFS)
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", vo_wav,
            "-i", music_wav,
            "-filter_complex",
            "[0:a]aformat=channel_layouts=stereo,volume=1.18[v];"
            "[1:a]volume=0.82[m];"
            "[v][m]amix=inputs=2:duration=longest:normalize=0,"
            "loudnorm=I=-15:TP=-1.5:LRA=8",
            "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le",
            final_wav,
        ],
        check=True,
    )
    print(f"Mixed final audio -> {final_wav} ({total_sec:.2f}s)")


if __name__ == "__main__":
    main()
