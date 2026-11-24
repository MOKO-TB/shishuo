import asyncio, json, subprocess, wave
from pathlib import Path
import numpy as np
import edge_tts

ROOT = Path(__file__).resolve().parent
AUD = ROOT / "audio"
AUD.mkdir(exist_ok=True)
SR = 48000
VOICE = "zh-CN-YunyangNeural"
RATE = "+2%"
PITCH = "-2Hz"

SEGMENTS = [
    ("s1", 1.2, "每一个课后问题，都在等一个回答。", []),
    ("s2", 0.5, "下课以后，问题才刚开始。", []),
    ("s3", 0.7, "问同学，没人回。搜网页，不敢信。等老师，又怕打扰。",
     ["问同学", "搜网页", "等老师"]),
    ("s4", 0.5, "一个晚上，就这样过去了。", ["一个晚上"]),
    ("s5", 1.0, "师说，把 AI 和老师，接成一条接力。", ["接力"]),
    ("s6", 0.4, "AI 先答，老师精答，答案留下来。", ["先答", "精答", "留下来"]),
    ("s7", 0.6, "不是替老师回答，而是让老师的回答，被留下。", ["被留下"]),
    ("s8", 5.0, "学生提问，AI 先查课程知识库。有依据才回答，标出来源和置信度；没把握，就老实说不知道，自动交给任课老师。",
     ["知识库", "有依据", "置信度", "没把握", "交给"]),
    ("s8b", 0.5, "每一次提问，都会带着课程、章节和上下文；同题的人，自动站到一起。",
     ["课程", "上下文", "同题"]),
    ("s9", 0.5, "提问可以带图，也可以带文件；文档只在本机解析，原文件不会上传。",
     ["带图", "文件", "本机"]),
    ("s9b", 0.6, "老师回复后，学生可以继续追问、确认已解决，或者给一个还不够。",
     ["追问", "已解决", "还不够"]),
    ("s10", 0.8, "老师看到的，不是二十条待办，是一组问题。同题合并，AI 备好上下文和回复草稿；老师一次回复整组。答案，沉淀成 FAQ。下一次，AI 直接命中。",
     ["待办", "同题合并", "草稿", "整组", "FAQ", "直接命中"]),
    ("s11", 0.5, "回复可以撤回，FAQ 可以回滚；每一条答案，都能追到出处。每一个被接住的问题，都在把老师的时间还回去。",
     ["撤回", "出处", "时间还回去"]),
    ("s11b", 0.5, "被连续反馈还不够的答案，会自动标记待完善，通知老师。",
     ["还不够", "待完善"]),
    ("s12", 0.8, "不止一门课。课程知识库、引路学长、AI 导师、课表与学习通、食堂与空教室；手机端，管理端。课内课外，一个入口。",
     ["课程知识库", "引路学长", "AI导师", "课表", "食堂", "手机端", "管理端"]),
    ("s12b", 0.6, "模型 Key 只在服务端。敏感词、禁言、封禁，都在后台强制执行。",
     ["Key", "服务端", "敏感词"]),
    ("s13", 0.7, "五门课程，八十一条精修 FAQ，一百五十七项检索评测全部通过；三十二位 AI 导师，七十五条校园经验卡。",
     ["五门课程", "八十一条", "一百五十七", "三十二", "七十五"]),
    ("s14", 0.5, "不是概念，是现在就能用的系统。", ["现在就能用"]),
    ("s14b", 0.6, "从五门课开始，做深，再做广。", ["五门课"]),
    ("s15", 2.5, "老师写下的每一句话，都成为 AI 的第一反应。师说，让每个课后问题，都有回响。",
     ["第一反应", "都有回响"]),
]

def ffmpeg(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)

def to_wav(mp3: Path, wav: Path):
    ffmpeg(["-i", str(mp3), "-ar", str(SR), "-ac", "1", "-af", "loudnorm=I=-17:TP=-2:LRA=7", str(wav)])

def keyword_times(words, keywords):
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
        print(f"{sid}: {dur:.2f}s  cues={meta[-1]['cues']}")

    t = 0.0
    for m in meta:
        t += m["gap"]
        m["start"] = round(t, 3)
        t += m["duration"]
    total = round(t + 6.0, 3)

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
    scenes = [
        {"id": "cold",    "start": 0.0, "end": round(s["s3"]["start"] - 0.4, 3)},
        {"id": "problem", "start": round(s["s3"]["start"] - 0.4, 3), "end": round(s["s5"]["start"] - 0.5, 3)},
        {"id": "reveal",  "start": round(s["s5"]["start"] - 0.5, 3), "end": round(s["s8"]["start"] - 0.5, 3)},
        {"id": "student", "start": round(s["s8"]["start"] - 0.5, 3), "end": round(s["s10"]["start"] - 0.5, 3)},
        {"id": "teacher", "start": round(s["s10"]["start"] - 0.5, 3), "end": round(s["s12"]["start"] - 0.5, 3)},
        {"id": "breadth", "start": round(s["s12"]["start"] - 0.5, 3), "end": round(s["s13"]["start"] - 0.5, 3)},
        {"id": "proof",   "start": round(s["s13"]["start"] - 0.5, 3), "end": round(s["s15"]["start"] - 0.5, 3)},
        {"id": "close",   "start": round(s["s15"]["start"] - 0.5, 3), "end": total},
    ]
    timeline = {"total": total, "voice": VOICE, "rate": RATE, "bpm": 96, "segments": meta, "scenes": scenes}
    (ROOT / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    print("TOTAL", total)
    for sc in scenes:
        print(sc)

asyncio.run(main())
