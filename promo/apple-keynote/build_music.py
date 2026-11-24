# -*- coding: utf-8 -*-
"""
师说 · 苹果发布会旗舰版宣传片
电影级极简科技原声配乐 + 转场音效 + 人声智能闪避混音引擎
48kHz Stereo · 104 BPM · Pure NumPy Vectorized DSP (Zero external copyright risk)
"""

import json
import math
import subprocess
import wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
TL_PATH = ROOT / "timeline.json"

SR = 48000
BPM = 104.0
BEAT = 60.0 / BPM  # ~0.5769s


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def one_pole_lowpass(x: np.ndarray, cutoff_hz: float) -> np.ndarray:
    """Fast vectorized-friendly smooth lowpass via FFT for studio clarity."""
    n = len(x)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    # 2nd order gentle Butterworth-like rolloff
    h = 1.0 / (1.0 + (freqs / max(cutoff_hz, 20.0)) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * h, n=n)


def bandpass_fft(x: np.ndarray, low_hz: float, high_hz: float) -> np.ndarray:
    n = len(x)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    hp = 1.0 / (1.0 + (low_hz / np.maximum(freqs, 1.0)) ** 4)
    lp = 1.0 / (1.0 + (freqs / max(high_hz, 40.0)) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * hp * lp, n=n)


def add_stereo_reverb(left: np.ndarray, right: np.ndarray, wet: float = 0.28) -> tuple[np.ndarray, np.ndarray]:
    """Lush prime-tap stereo hall reverb with progressive high-frequency damping."""
    taps_l = [(0.031, 0.42), (0.059, 0.34), (0.097, 0.27), (0.149, 0.21), (0.223, 0.16), (0.317, 0.11), (0.439, 0.07)]
    taps_r = [(0.037, 0.41), (0.067, 0.33), (0.107, 0.26), (0.163, 0.20), (0.241, 0.15), (0.347, 0.10), (0.467, 0.065)]
    n = len(left)
    rl = np.zeros(n, dtype=np.float64)
    rr = np.zeros(n, dtype=np.float64)
    for d, g in taps_l:
        s = int(d * SR)
        if s < n:
            rl[s:] += left[:-s] * g + right[:-s] * (g * 0.25)
    for d, g in taps_r:
        s = int(d * SR)
        if s < n:
            rr[s:] += right[:-s] * g + left[:-s] * (g * 0.25)
    rl = one_pole_lowpass(rl, 3200.0)
    rr = one_pole_lowpass(rr, 3100.0)
    return left + rl * wet, right + rr * wet


def synth_felt_piano_note(midi: int, dur: float, vel: float = 0.7) -> np.ndarray:
    """Intimate warm felt piano note (soft hammer attack, rich warm decay)."""
    n = max(1, int(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f0 = midi_to_hz(midi)
    # Felt piano has strong fundamental, soft 2nd/3rd harmonics, almost no harsh upper partials
    sig = (
        1.00 * np.sin(2 * np.pi * f0 * t) * np.exp(-t * 1.15)
        + 0.36 * np.sin(2 * np.pi * f0 * 2.0008 * t + 0.2) * np.exp(-t * 2.2)
        + 0.12 * np.sin(2 * np.pi * f0 * 3.002 * t + 0.5) * np.exp(-t * 3.8)
        + 0.04 * np.sin(2 * np.pi * f0 * 4.005 * t) * np.exp(-t * 6.0)
    )
    # Soft felt attack (14ms) and smooth release
    att = np.minimum(1.0, t / 0.014) ** 1.5
    rel = np.minimum(1.0, (dur - t) / 0.08)
    rel = np.clip(rel, 0.0, 1.0)
    return sig * att * rel * vel * 0.22


def synth_pluck_note(midi: int, dur: float, vel: float = 0.6) -> np.ndarray:
    """Clean Apple-style muted glass/marimba arpeggio pluck."""
    n = max(1, int(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f0 = midi_to_hz(midi)
    sig = (
        1.0 * np.sin(2 * np.pi * f0 * t) * np.exp(-t * 4.8)
        + 0.32 * np.sin(2 * np.pi * f0 * 2.0 * t) * np.exp(-t * 9.5)
        + 0.14 * np.sin(2 * np.pi * f0 * 3.0 * t) * np.exp(-t * 16.0)
    )
    att = np.minimum(1.0, t / 0.004)
    return sig * att * vel * 0.16


def synth_pad_chord(midis: list[int], dur: float, vol: float = 0.22) -> tuple[np.ndarray, np.ndarray]:
    """Lush wide stereo detuned warm analog pad."""
    n = max(1, int(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    l = np.zeros(n, dtype=np.float64)
    r = np.zeros(n, dtype=np.float64)
    lfo = 1.0 + 0.08 * np.sin(2 * np.pi * 0.18 * t)
    for idx, m in enumerate(midis):
        f = midi_to_hz(m)
        # Gentle stereo detune for cinematic width
        fl = f * (1.0 - 0.0022)
        fr = f * (1.0 + 0.0022)
        wl = 0.72 * np.sin(2 * np.pi * fl * t + idx * 0.7) + 0.22 * np.sin(2 * np.pi * fl * 2 * t) + 0.06 * np.sin(2 * np.pi * fl * 3 * t)
        wr = 0.72 * np.sin(2 * np.pi * fr * t + idx * 1.3) + 0.22 * np.sin(2 * np.pi * fr * 2 * t) + 0.06 * np.sin(2 * np.pi * fr * 3 * t)
        l += wl
        r += wr
    norm = max(1, len(midis))
    l = (l / norm) * lfo
    r = (r / norm) * lfo
    # Smooth swell envelope
    fade_in = min(dur * 0.35, 1.4)
    fade_out = min(dur * 0.35, 1.5)
    env = np.minimum(1.0, t / max(fade_in, 0.05)) * np.minimum(1.0, np.maximum(0.0, (dur - t) / max(fade_out, 0.05)))
    env = env ** 1.3
    return l * env * vol, r * env * vol


def synth_sub_bass(midi: int, dur: float, vol: float = 0.22) -> np.ndarray:
    n = max(1, int(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f = midi_to_hz(midi)
    sig = 0.85 * np.sin(2 * np.pi * f * t) + 0.15 * np.sin(2 * np.pi * f * 2 * t)
    env = np.minimum(1.0, t / 0.18) * np.minimum(1.0, np.maximum(0.0, (dur - t) / 0.25))
    return sig * env * vol


def synth_soft_kick(vel: float = 0.45) -> np.ndarray:
    dur = 0.22
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    # Smooth sine pitch drop 115Hz -> 46Hz
    freq = 46.0 + 69.0 * np.exp(-t * 28.0)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    env = np.minimum(1.0, t / 0.004) * np.exp(-t * 14.0)
    return np.sin(phase) * env * vel * 0.32


def synth_rim_click(vel: float = 0.3) -> np.ndarray:
    dur = 0.055
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    sig = np.sin(2 * np.pi * 1650.0 * t) * 0.55 + np.sin(2 * np.pi * 2420.0 * t) * 0.35
    rng = np.random.default_rng(42)
    noise = rng.standard_normal(n) * 0.25
    env = np.minimum(1.0, t / 0.0015) * np.exp(-t * 75.0)
    return (sig + noise) * env * vel * 0.18


def synth_whoosh_impact(dur: float = 1.6, intensity: float = 0.7) -> tuple[np.ndarray, np.ndarray]:
    """Apple Keynote airy cinematic transition swell + soft sub drop."""
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    rng = np.random.default_rng(108)
    wn_l = rng.standard_normal(n)
    wn_r = rng.standard_normal(n)
    air_l = bandpass_fft(wn_l, 220.0, 2200.0)
    air_r = bandpass_fft(wn_r, 240.0, 2400.0)
    peak = dur * 0.62
    env = np.where(t < peak, (t / peak) ** 2.2, np.exp(-(t - peak) * 5.2))
    # Subtle sub hit at peak
    sub = np.zeros(n, dtype=np.float64)
    p_idx = int(peak * SR)
    sub_t = np.arange(n - p_idx, dtype=np.float64) / SR
    sub_f = 42.0 + 48.0 * np.exp(-sub_t * 10.0)
    sub[p_idx:] = np.sin(2 * np.pi * np.cumsum(sub_f) / SR) * np.exp(-sub_t * 3.8) * 0.35
    l = (air_l * env * 0.14 + sub) * intensity
    r = (air_r * env * 0.14 + sub) * intensity
    return l, r


def synth_glass_chime(midis: list[int], dur: float = 3.2, vol: float = 0.24) -> tuple[np.ndarray, np.ndarray]:
    """Crystalline Apple brand reveal harmonic bell shimmer."""
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float64) / SR
    l = np.zeros(n, dtype=np.float64)
    r = np.zeros(n, dtype=np.float64)
    for i, m in enumerate(midis):
        f = midi_to_hz(m)
        delay = i * 0.065
        tt = np.maximum(0.0, t - delay)
        active = (t >= delay).astype(np.float64)
        tone = (
            0.8 * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 1.1)
            + 0.25 * np.sin(2 * np.pi * f * 2.0 * tt) * np.exp(-tt * 2.2)
            + 0.1 * np.sin(2 * np.pi * f * 3.0 * tt) * np.exp(-tt * 3.6)
        ) * np.minimum(1.0, tt / 0.015) * active
        pan = 0.35 + 0.3 * (i / max(1, len(midis) - 1))
        l += tone * (1.0 - pan)
        r += tone * pan
    return l * vol, r * vol


def place(buf: np.ndarray, sig: np.ndarray, start_sec: float):
    idx = int(round(start_sec * SR))
    if idx < 0:
        sig = sig[-idx:]
        idx = 0
    if idx >= len(buf) or len(sig) == 0:
        return
    end = min(len(buf), idx + len(sig))
    buf[idx:end] += sig[: end - idx]


def main():
    tl = json.loads(TL_PATH.read_text(encoding="utf-8"))
    total_dur = float(tl["total"])
    n_total = int(round((total_dur + 1.0) * SR))

    act_map = {a["id"]: a for a in tl["acts"]}
    line_map = {ln["id"]: ln for ln in tl["lines"]}

    pad_l = np.zeros(n_total, dtype=np.float64)
    pad_r = np.zeros(n_total, dtype=np.float64)
    piano_l = np.zeros(n_total, dtype=np.float64)
    piano_r = np.zeros(n_total, dtype=np.float64)
    arp_l = np.zeros(n_total, dtype=np.float64)
    arp_r = np.zeros(n_total, dtype=np.float64)
    bass = np.zeros(n_total, dtype=np.float64)
    perc_l = np.zeros(n_total, dtype=np.float64)
    perc_r = np.zeros(n_total, dtype=np.float64)
    sfx_l = np.zeros(n_total, dtype=np.float64)
    sfx_r = np.zeros(n_total, dtype=np.float64)

    # Chord progressions per act (modern cinematic Apple Keynote harmony in E minor / G major)
    # 4-bar chord cycles (each chord = 4 beats = ~2.308s or 8 beats = ~4.615s)
    prog_dark = [
        ([52, 59, 62, 66], 40),  # Em9
        ([48, 55, 59, 62], 36),  # Cmaj9
        ([43, 55, 59, 62], 43),  # G6/9
        ([50, 57, 62, 64], 38),  # Dadd9
    ]
    prog_bright = [
        ([48, 55, 59, 64, 67], 36),  # Cmaj9
        ([43, 55, 59, 62, 66], 43),  # Gmaj7
        ([45, 52, 55, 59, 64], 45),  # Am9
        ([50, 57, 62, 66, 69], 38),  # Dmaj9
    ]
    prog_warm = [
        ([50, 57, 62, 64, 69], 38),  # Dadd9
        ([52, 59, 62, 66, 71], 40),  # Em9
        ([48, 55, 59, 62, 67], 36),  # Cmaj9
        ([43, 55, 59, 62, 67], 43),  # G
    ]

    # Mood profile per act: (prog, pad_vol, piano_density, arp_level, beat_level, bass_vol)
    act_profiles = {
        "act1": (prog_dark,   0.18, 0.70, 0.00, 0.00, 0.14),  # 深夜静谧：Felt Piano + 深沉低频
        "act2": (prog_bright, 0.26, 0.65, 0.35, 0.28, 0.22),  # 品牌揭示：宏大暖弦 + 柔和脉冲
        "act3": (prog_dark,   0.22, 0.25, 0.72, 0.55, 0.24),  # 双通道引擎：Apple Silicon 极客脉冲
        "act4": (prog_bright, 0.22, 0.40, 0.65, 0.52, 0.21),  # 学生端：明快清透律动
        "act5": (prog_dark,   0.23, 0.30, 0.78, 0.58, 0.24),  # AI 导师与工具：精密工程节奏
        "act6": (prog_warm,   0.26, 0.75, 0.42, 0.38, 0.20),  # 教师端：书院温情 + 扎实推进
        "act7": (prog_bright, 0.24, 0.45, 0.62, 0.52, 0.20),  # 校园生态：轻快通透
        "act8": (prog_dark,   0.23, 0.25, 0.68, 0.56, 0.23),  # 治理与信任：沉稳科技脉搏
        "act9": (prog_bright, 0.30, 0.60, 0.85, 0.72, 0.28),  # Bento 高潮：全编制澎湃能量
        "act10": (prog_warm,  0.24, 0.90, 0.00, 0.00, 0.15),  # 终章回响：纯钢琴与暖弦渐弱
    }

    def get_act_at(t_sec: float) -> str:
        for a in tl["acts"]:
            if a["start"] <= t_sec < a["end"]:
                return a["id"]
        return "act10"

    # Generate bar-by-bar score across entire timeline
    bar_dur = 4.0 * BEAT  # ~2.308s per bar
    num_bars = int(math.ceil(total_dur / bar_dur))

    for bar in range(num_bars):
        t_bar = bar * bar_dur
        if t_bar > total_dur - 1.8:
            break
        aid = get_act_at(t_bar + 0.5)
        prog, pad_v, piano_d, arp_l_v, beat_v, bass_v = act_profiles[aid]
        chord, root = prog[(bar // 2) % len(prog)]

        # 1. Warm Pad (every 2 bars for smooth seamless sustained harmony)
        if bar % 2 == 0:
            pl, pr = synth_pad_chord(chord, bar_dur * 2.15, vol=pad_v)
            place(pad_l, pl, t_bar)
            place(pad_r, pr, t_bar)
            # Sub bass follows chord root
            sb = synth_sub_bass(root, bar_dur * 2.0, vol=bass_v)
            place(bass, sb, t_bar)

        # 2. Felt Piano gentle melodic motifs
        if piano_d > 0.05:
            mel_notes = [chord[-1] + 12, chord[-2] + 12, chord[1] + 12, chord[0] + 12]
            if aid in ("act1", "act10"):
                # Sparse contemplative minimalist piano (beat 0 and beat 2.5)
                n1 = synth_felt_piano_note(mel_notes[bar % len(mel_notes)], 2.6, vel=0.68 * piano_d)
                place(piano_l, n1 * 0.58, t_bar)
                place(piano_r, n1 * 0.42, t_bar)
                if bar % 2 == 1:
                    n2 = synth_felt_piano_note(mel_notes[(bar + 1) % len(mel_notes)], 2.4, vel=0.55 * piano_d)
                    place(piano_l, n2 * 0.42, t_bar + 2.5 * BEAT)
                    place(piano_r, n2 * 0.58, t_bar + 2.5 * BEAT)
            else:
                # Supportive crystalline piano accents on beat 0 and 3
                n1 = synth_felt_piano_note(mel_notes[(bar * 2) % len(mel_notes)], 1.8, vel=0.55 * piano_d)
                place(piano_l, n1 * 0.55, t_bar)
                place(piano_r, n1 * 0.45, t_bar)
                n2 = synth_felt_piano_note(mel_notes[(bar * 2 + 1) % len(mel_notes)], 1.6, vel=0.45 * piano_d)
                place(piano_l, n2 * 0.45, t_bar + 3.0 * BEAT)
                place(piano_r, n2 * 0.55, t_bar + 3.0 * BEAT)

        # 3. Apple Silicon Pluck Arpeggio (8th notes with ping-pong pan)
        if arp_l_v > 0.05:
            arp_notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[-1] + 12, chord[2] + 12, chord[1] + 12, chord[-1] + 12, chord[0] + 24]
            for step in range(8):
                ts = t_bar + step * (BEAT * 0.5)
                if ts > total_dur - 3.0:
                    break
                vel = (0.72 if step % 2 == 0 else 0.46) * arp_l_v
                pnote = synth_pluck_note(arp_notes[step % len(arp_notes)], 0.42, vel=vel)
                pan = 0.28 if step % 2 == 0 else 0.72
                place(arp_l, pnote * (1.0 - pan), ts)
                place(arp_r, pnote * pan, ts)

        # 4. Minimalist Clean Tech Pulse (Soft Kick on 1 & 3, subtle rim click on 2 & 4)
        if beat_v > 0.05:
            k1 = synth_soft_kick(vel=beat_v)
            place(perc_l, k1, t_bar)
            place(perc_r, k1, t_bar)
            if beat_v >= 0.48:
                k2 = synth_soft_kick(vel=beat_v * 0.75)
                place(perc_l, k2, t_bar + 2.0 * BEAT)
                place(perc_r, k2, t_bar + 2.0 * BEAT)
            c1 = synth_rim_click(vel=beat_v * 0.85)
            c2 = synth_rim_click(vel=beat_v * 0.70)
            place(perc_l, c1 * 0.62, t_bar + 1.0 * BEAT)
            place(perc_r, c1 * 0.38, t_bar + 1.0 * BEAT)
            place(perc_l, c2 * 0.38, t_bar + 3.0 * BEAT)
            place(perc_r, c2 * 0.62, t_bar + 3.0 * BEAT)

    # Final resolution chord on outro
    outro_t = max(0.0, total_dur - 6.0)
    res_l, res_r = synth_pad_chord([43, 55, 59, 62, 66, 71], 5.6, vol=0.22)
    place(pad_l, res_l, outro_t)
    place(pad_r, res_r, outro_t)
    final_p = synth_felt_piano_note(71, 4.8, vel=0.75)
    place(piano_l, final_p * 0.5, outro_t + 0.2)
    place(piano_r, final_p * 0.5, outro_t + 0.2)

    # 5. Act Transition Whooshes & Brand Reveal Chime
    for idx, act in enumerate(tl["acts"]):
        if idx > 0:
            wl, wr = synth_whoosh_impact(dur=1.55, intensity=0.58 if act["id"] != "act9" else 0.75)
            place(sfx_l, wl, max(0.0, act["start"] - 0.55))
            place(sfx_r, wr, max(0.0, act["start"] - 0.55))

    # Brand reveal crystalline chime on "这就是，师说。"
    if "a2_2" in line_map:
        cl, cr = synth_glass_chime([64, 71, 74, 78, 83], dur=3.8, vol=0.28)
        place(sfx_l, cl, max(0.0, line_map["a2_2"]["start"] - 0.15))
        place(sfx_r, cr, max(0.0, line_map["a2_2"]["start"] - 0.15))

    # Bento reveal chime
    if "a9_1" in line_map:
        cl, cr = synth_glass_chime([60, 67, 71, 76], dur=3.2, vol=0.22)
        place(sfx_l, cl, max(0.0, act_map["act9"]["start"] + 0.15))
        place(sfx_r, cr, max(0.0, act_map["act9"]["start"] + 0.15))

    # Apply studio stereo reverb to melodic layers
    mel_l = pad_l + piano_l + arp_l
    mel_r = pad_r + piano_r + arp_r
    mel_l, mel_r = add_stereo_reverb(mel_l, mel_r, wet=0.32)

    music_l = mel_l + bass + perc_l + sfx_l
    music_r = mel_r + bass + perc_r + sfx_r

    # Gentle fade in (1.5s) and fade out (2.8s)
    t_all = np.arange(n_total, dtype=np.float64) / SR
    fade_in = np.minimum(1.0, t_all / 1.5)
    fade_out = np.clip((total_dur - t_all) / 2.8, 0.0, 1.0)
    music_l *= fade_in * fade_out
    music_r *= fade_in * fade_out

    # Trim strictly to total_dur
    n_exact = int(round(total_dur * SR))
    music_l = music_l[:n_exact]
    music_r = music_r[:n_exact]

    # Read VO master for sample-accurate smooth sidechain ducking
    vo_path = AUDIO_DIR / "vo_master.wav"
    with wave.open(str(vo_path), "rb") as w:
        vo_raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
    if len(vo_raw) < n_exact:
        vo_raw = np.pad(vo_raw, (0, n_exact - len(vo_raw)))
    else:
        vo_raw = vo_raw[:n_exact]

    # Compute smooth RMS envelope in O(N) using cumulative sum moving average
    def moving_avg(x: np.ndarray, w_len: int) -> np.ndarray:
        w_len = max(1, int(w_len))
        pad_l = w_len // 2
        pad_r = w_len - 1 - pad_l
        xp = np.pad(x, (pad_l, pad_r), mode="edge")
        cs = np.empty(len(xp) + 1, dtype=np.float64)
        cs[0] = 0.0
        np.cumsum(xp, out=cs[1:])
        return (cs[w_len:] - cs[:-w_len]) / w_len

    vo_abs = np.abs(vo_raw)
    env = moving_avg(vo_abs, int(0.14 * SR))
    # Map voice presence -> ducking gain (1.0 when silent, 0.44 when speaking -> ~ -7dB gentle duck)
    duck_amount = np.clip(env / 0.045, 0.0, 1.0)
    # Extra smoothing pass for silk-smooth breathing
    duck_amount = moving_avg(duck_amount, int(0.28 * SR))
    duck_gain = 1.0 - 0.56 * np.clip(duck_amount, 0.0, 1.0)

    music_l *= duck_gain
    music_r *= duck_gain

    # Soft limiter on music bed
    peak = max(np.max(np.abs(music_l)), np.max(np.abs(music_r)), 1e-6)
    scale = min(1.0, 0.78 / peak)
    music_l *= scale
    music_r *= scale

    music_wav = AUDIO_DIR / "music.wav"
    interleaved = np.empty(n_exact * 2, dtype=np.int16)
    interleaved[0::2] = np.clip(music_l * 32767.0, -32767, 32767).astype(np.int16)
    interleaved[1::2] = np.clip(music_r * 32767.0, -32767, 32767).astype(np.int16)

    with wave.open(str(music_wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(interleaved.tobytes())

    # Master mix with EBU R128 broadcast loudness normalization (-16 LUFS)
    final_wav = AUDIO_DIR / "final_audio.wav"
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", str(vo_path),
        "-i", str(music_wav),
        "-filter_complex",
        "[0:a]highpass=f=75,equalizer=f=2800:width_type=o:width=1.4:g=1.5,aformat=channel_layouts=stereo,volume=1.18[v];"
        "[1:a]volume=0.82[m];"
        "[v][m]amix=inputs=2:duration=first:normalize=0,"
        "loudnorm=I=-16:TP=-1.5:LRA=9",
        "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le",
        str(final_wav),
    ]
    subprocess.run(cmd, check=True)
    print(f"Generated cinema score: {music_wav}")
    print(f"Mastered final audio:   {final_wav} (duration {total_dur:.2f}s)")


if __name__ == "__main__":
    main()
