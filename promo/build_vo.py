import asyncio, json, subprocess, wave
from pathlib import Path
import numpy as np
import edge_tts

ROOT = Path(__file__).resolve().parent
AUD = ROOT / "audio"
AUD.mkdir(exist_ok=True)
SR = 48000
VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+8%"
PITCH = "-2Hz"

SEGMENTS = [
    ("s1", 1.6,  "下课铃响，问题才刚开始。", []),
    ("s2", 0.55, "问同学，没人回。搜网页，不敢信。等老师，又怕打扰。",
     ["问同学", "搜网页", "等老师"]),
    ("s3", 0.95, "师说，让 AI 和老师，接力回答每一个课后问题。", ["接力"]),
    ("s4", 0.50, "学生提问，AI 先查课程知识库。有依据才回答，标出来源和置信度；没把握，就老实说不知道。",
     ["知识库", "有依据", "置信度", "没把握"]),
    ("s5", 0.60, "拿不准的，自动转给任课老师。同题合并，AI 备好上下文和回复草稿；老师一次回复整组，答案沉淀成 FAQ。下一次，AI 直接命中。",
     ["任课老师", "同题合并", "回复草稿", "一次回复", "FAQ", "直接命中"]),
    ("s6", 0.80, "五门课程，八十一条精修 FAQ，一百五十七道检索评测全部通过。还有校园知识库、AI 导师和手机端。",
     ["五门课程", "八十一条", "一百五十七", "校园知识库"]),
    ("s7", 1.20, "老师写下的每一句话，都成为 AI 的第一反应。师说，让每个课后问题，都有回响。",
     ["第一反应", "都有回响"]),
]

def ffmpeg(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)

def to_wav(mp3: Path, wav: Path):
    ffmpeg(["-i", str(mp3), "-ar", str(SR), "-ac", "1", "-af", "loudnorm=I=-17:TP=-2:LRA=7", str(wav)])

def keyword_times(words, keywords):
    # words: list of (t, text); concatenate and map char index -> boundary time
    joined = "".join(w[1] for w in words)
    out = {}
    for kw in keywords:
        idx = joined.find(kw)
        if idx < 0:
            out[kw] = None
            continue
        pos = 0
        for t, txt in words:
            if pos + len(txt) > idx:
                out[kw] = round(t, 3)
                break
            pos += len(txt)
    return out

async def synth_one(sid, text):
    mp3 = AUD / f"vo_{sid}.mp3"
    wav = AUD / f"vo_{sid}.wav"
    words = []
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append((chunk["offset"] / 1e7, chunk["text"]))
    to_wav(mp3, wav)
    with wave.open(str(wav)) as w:
        dur = w.getnframes() / w.getframerate()
    return dur, words

def load_wav(path: Path):
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        data = w.readframes(w.getnframes())
    return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

async def main():
    meta = []
    for sid, gap, text, keywords in SEGMENTS:
        dur, words = await synth_one(sid, text)
        meta.append({
            "id": sid, "text": text, "gap": gap, "duration": round(dur, 3),
            "words": [[round(t, 3), w] for t, w in words],
            "cues": keyword_times(words, keywords),
        })
        print(f"{sid}: {dur:.2f}s cues={meta[-1]['cues']}")

    t = 0.0
    for m in meta:
        t += m["gap"]
        m["start"] = round(t, 3)
        t += m["duration"]
    total = round(t + 3.8, 3)

    master = np.zeros(int(total * SR) + SR // 2, dtype=np.float32)
    for m in meta:
        clip = load_wav(AUD / f"vo_{m['id']}.wav")
        i = int(m["start"] * SR)
        master[i:i+len(clip)] += clip
    fade = int(0.35 * SR)
    master[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    peak = float(np.max(np.abs(master))) or 1.0
    master = master / peak * 0.89
    with wave.open(str(AUD / "vo_master.wav"), "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((master * 32767).astype(np.int16).tobytes())

    s = {m["id"]: m for m in meta}
    b1 = round(s["s3"]["start"] - 0.55, 3)
    b2 = round(s["s4"]["start"] - 0.55, 3)
    b3 = round(s["s5"]["start"] - 0.65, 3)
    b4 = round(s["s6"]["start"] - 0.65, 3)
    b5 = round(s["s7"]["start"] - 0.75, 3)
    scenes = [
        {"id": "problem", "start": 0.0, "end": round(b1 + 0.55, 3)},
        {"id": "reveal",  "start": b1, "end": round(b2 + 0.55, 3)},
        {"id": "student", "start": b2, "end": round(b3 + 0.55, 3)},
        {"id": "teacher", "start": b3, "end": round(b4 + 0.55, 3)},
        {"id": "breadth", "start": b4, "end": round(b5 + 0.55, 3)},
        {"id": "closing", "start": b5, "end": total},
    ]
    timeline = {"total": total, "voice": VOICE, "rate": RATE, "segments": meta, "scenes": scenes}
    (ROOT / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    print("total", total)
    for sc in scenes:
        print(sc)

asyncio.run(main())
