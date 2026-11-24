import asyncio
import json
import os
import subprocess
import wave
import numpy as np
import edge_tts

ROOT = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.abspath(os.path.join(ROOT, "..", ".."))
AUDIO_DIR = os.path.join(ROOT, "audio_v2")
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE = "zh-CN-YunyangNeural"
FALLBACK_VOICE = "zh-CN-YunxiNeural"
RATE = "+6%"
PITCH = "-2Hz"
SR = 48000

# 7 Acts (~108s) — 100% focused on latest live features
CUES = [
    # Act 1: 极速开场 (0-6s)
    ("f1_1", "act1", "师说全功能演示。接下来，带你逐一体验从学生答疑、课堂互动到校园生态与后台治理的完整能力。", 0.8, 0.7),

    # Act 2: 学生端 · 提问与有据作答 (6-24s)
    ("f2_1", "act2", "首先看学生端。支持深浅色切换与匿名提问；选定课程后输入卡点，点击交给 AI。", 0.45, 0.45),
    ("f2_2", "act2", "AI 优先检索任课老师的课程知识库，显性标注置信度、分步公式与原文出处；下方支持确认已解决、继续追问或复制深链。", 0.35, 0.8),

    # Act 3: 学生端 · 复习卡、宽屏课程表与书灵导师 (24-42s)
    ("f3_1", "act3", "收藏与疑难问题会自动汇总进复习卡错题本，先自测再看答案，还没会的题目下次自动置顶。", 0.45, 0.45),
    ("f3_2", "act3", "全新宽屏课程表支持周视图与空教室查询；随时呼出书灵助教与学科 AI 导师，按知识地图定位每一步卡点。", 0.35, 0.8),

    # Act 4: 教师端 · 课堂新三件套（本节提问墙 / 期末复习包 / 下节课开场卡） (42-61s)
    ("f4_1", "act4", "切换到教师工作台。顶部全新集成三大课堂工具：开启本节提问墙，学生扫码免登录匿名提问，同类疑问自动归并。", 0.45, 0.45),
    ("f4_2", "act4", "期末复习包自动汇总全学期高频难点，一键导出复习清单；下节课开场卡则基于知识缺口，直接生成课前微调讲法。", 0.35, 0.85),

    # Act 5: 教师端 · 同题合并处理 & 课程知识库 (61-79s)
    ("f5_1", "act5", "AI 没把握的难题自动转交待办。打开处理抽屉，AI 已备好检索判断与回复草稿，一次回复整组并同步沉淀为课程 FAQ。", 0.45, 0.45),
    ("f5_2", "act5", "在课程知识库里，健康度、引用次数与章节覆盖热力图一目了然，支持知识缺口一键生成草稿、体检及批量导入导出。", 0.35, 0.85),

    # Act 6: 答疑洞察 & 校园全生态 (79-97s)
    ("f6_1", "act6", "答疑洞察自动统计 AI 独立解决率与每周节省时长，让教学重点清晰可见。", 0.45, 0.45),
    ("f6_2", "act6", "校园生活模块聚合引路学长经验卡、GPA 自动试算、三十六栋手绘地图，以及支持预算与口味筛选的食堂决策。", 0.35, 0.85),

    # Act 7: 移动端自适应 & 10 模块独立管理台 & 收尾 (97-114s)
    ("f7_1", "act7", "全站深度适配移动端与原生小组件；独立管理台覆盖十大治理模块，提供意见反馈、统一 AI 网关与全链路操作审计。", 0.45, 0.55),
    ("f7_2", "act7", "师说，让每个课后问题都有回响。欢迎扫码即刻体验。", 0.4, 2.2),
]


async def synth_one(cue_id: str, text: str) -> str:
    mp3_path = os.path.join(AUDIO_DIR, f"vo_{cue_id}.mp3")
    wav_path = os.path.join(AUDIO_DIR, f"vo_{cue_id}.wav")
    if not os.path.exists(mp3_path):
        for v in (VOICE, FALLBACK_VOICE):
            try:
                comm = edge_tts.Communicate(text, voice=v, rate=RATE, pitch=PITCH)
                await comm.save(mp3_path)
                break
            except Exception as e:
                print(f"[warn] voice {v} failed for {cue_id}: {e}")
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", mp3_path,
            "-af", "silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse,highpass=f=75,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=80",
            "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le",
            wav_path,
        ],
        check=True,
    )
    return wav_path


def read_wav_f32(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def fmt_srt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    h = ms // 3600000; ms %= 3600000
    m = ms // 60000; ms %= 60000
    s = ms // 1000; ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


async def main():
    print("Synthesizing latest feature-demo voiceover...")
    wav_paths = {}
    for cid, act, text, pre, post in CUES:
        wav_paths[cid] = await synth_one(cid, text)
        print(f"  [ok] {cid}: {text}")

    cursor = 0.0
    timeline_cues = []
    act_ranges = {}
    segments = []

    for cid, act, text, pre, post in CUES:
        arr = read_wav_f32(wav_paths[cid])
        dur = len(arr) / SR
        start = cursor + pre
        end = start + dur
        cursor = end + post

        if act not in act_ranges:
            act_ranges[act] = {"start": start - pre, "end": cursor}
        else:
            act_ranges[act]["end"] = cursor

        timeline_cues.append({
            "id": cid, "act": act, "text": text,
            "start": round(start, 3), "end": round(end, 3), "duration": round(dur, 3),
        })
        segments.append((start, arr))

    total_sec = round(cursor, 3)
    act_order = ["act1", "act2", "act3", "act4", "act5", "act6", "act7"]
    acts = []
    prev_end = 0.0
    for idx, aid in enumerate(act_order):
        r = act_ranges[aid]
        s = prev_end
        e = total_sec if idx == len(act_order) - 1 else round(r["end"], 3)
        acts.append({"id": aid, "start": round(s, 3), "end": e, "duration": round(e - s, 3)})
        prev_end = e

    total_samples = int(np.ceil(total_sec * SR))
    master = np.zeros(total_samples, dtype=np.float32)
    for start, arr in segments:
        idx = int(round(start * SR))
        end_idx = min(idx + len(arr), total_samples)
        master[idx:end_idx] += arr[: end_idx - idx]

    peak = float(np.max(np.abs(master))) + 1e-9
    master = master * (0.84 / peak)
    pcm = np.clip(master * 32767.0, -32768, 32767).astype(np.int16)

    vo_master_path = os.path.join(AUDIO_DIR, "vo_master.wav")
    with wave.open(vo_master_path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    tl = {
        "title": "师说 · 最新全功能展示",
        "fps": 30,
        "totalSec": total_sec,
        "acts": acts,
        "cues": timeline_cues,
    }
    tl_path = os.path.join(ROOT, "timeline_v2.json")
    with open(tl_path, "w", encoding="utf-8") as f:
        json.dump(tl, f, ensure_ascii=False, indent=2)

    srt_path = os.path.join(WORKSPACE, "promo", "师说最新功能展示_字幕.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, c in enumerate(timeline_cues, 1):
            f.write(f"{i}\n{fmt_srt_time(c['start'])} --> {fmt_srt_time(c['end'])}\n{c['text']}\n\n")

    print(f"\nDone! Total duration: {total_sec:.2f}s ({len(timeline_cues)} cues)")
    for a in acts:
        print(f"  {a['id']}: {a['start']:6.2f}s -> {a['end']:6.2f}s ({a['duration']:5.2f}s)")


if __name__ == "__main__":
    asyncio.run(main())
