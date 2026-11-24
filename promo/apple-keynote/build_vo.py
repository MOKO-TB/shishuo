# -*- coding: utf-8 -*-
"""
师说 · 苹果发布会旗舰版宣传片（5–6分钟）
旁白合成、时间轴精确对齐与 SRT 字幕生成脚本
Voice: zh-CN-YunyangNeural (沉稳、通透、富有叙事张力的苹果发布会质感男声)
"""

import asyncio
import json
import os
import subprocess
import wave
import struct
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+11%"
PITCH = "-2Hz"
SAMPLE_RATE = 48000

# 10 幕精简旗舰版：全量最新真实数据 + 用户定制金句 + 手机版专属高光，精准控制在 ~3:40（220s）
ACTS = [
    {
        "id": "act1",
        "name": "深夜的沉默",
        "lead_in": 1.0,
        "lines": [
            ("a1_1", "下课铃响，真正的思考才刚开始。", 0.45, "opening_void"),
            ("a1_2", "深夜推导卡壳，代码报错，波形对不上。", 0.45, "opening_pain"),
            ("a1_3", "问同学没人回，问通用 AI 怕编造又对不上课本，找老师又怕打扰。", 0.60, "opening_three"),
            ("a1_4", "无数本该被点亮的瞬间，留在了沉默里。", 0.65, "opening_silence"),
        ],
    },
    {
        "id": "act2",
        "name": "师说登场",
        "lead_in": 0.7,
        "lines": [
            ("a2_1", "于是，我们重构了高校课后答疑。", 0.40, "brand_beam"),
            ("a2_2", "这就是，师说。", 0.75, "brand_reveal"),
            ("a2_3", "课后敢问，课上讲透。不是替老师回答，而是让老师看见全班没弄懂的地方，然后讲得更准。", 0.70, "brand_tagline"),
            ("a2_4", "每句有出处，每问有回音，每课有积累。", 0.75, "brand_stage"),
        ],
    },
    {
        "id": "act3",
        "name": "双通道接力引擎",
        "lead_in": 0.65,
        "lines": [
            ("a3_1", "我们打造了一条严谨的双通道接力引擎。", 0.45, "engine_overview"),
            ("a3_2", "学生发问，先检索课程知识库，标明出处与三档置信度。", 0.45, "engine_retrieve"),
            ("a3_3", "有依据立刻答；证据不足绝不编造，诚实拒答并转交老师。", 0.50, "engine_honest"),
            ("a3_4", "已深耕高数、数据结构、电路、模电、数电五门核心课。", 0.70, "engine_courses"),
        ],
    },
    {
        "id": "act4",
        "name": "学生端体验",
        "lead_in": 0.6,
        "lines": [
            ("a4_1", "学生端，一切围绕专注与效率。", 0.40, "stu_home"),
            ("a4_2", "支持文字、语音、拍照识题与讲义文档提问。", 0.40, "stu_input"),
            ("a4_3", "文件先在浏览器本机解析，经你确认才发送。", 0.45, "stu_privacy"),
            ("a4_4", "输入即匹配相近知识与同题组，轻点同问，少排一次队。", 0.45, "stu_thread"),
            ("a4_5", "回答以公式精排流式呈现，追问上下文连贯。", 0.45, "stu_archive"),
            ("a4_6", "问答自动归档并支持导出，错题汇入复习卡自测。", 0.65, "stu_review"),
        ],
    },
    {
        "id": "act5",
        "name": "AI 导师 · 文理都能问",
        "lead_in": 0.6,
        "lines": [
            ("a5_1", "这是书灵，常驻桌面的伴学助教，也是 AI 导师的入口。", 0.35, "avatar_stage"),
            ("a5_2", "内置三十三位学科导师，五位试点默认开启，其余随选随加；近现代史、艺术概论、心理学、微观经济学，都能问。", 0.45, "mentor_library"),
            ("a5_3", "它展开知识地图，定位卡点、查先修，点破关键一步。", 0.45, "mentor_method"),
            ("a5_4", "针对工科难点，更内置了交互式学科实验室。", 0.40, "tool_kmap"),
            ("a5_5", "数电卡诺图化简与时序波形，模电静态工作点，步步可视验证。", 0.70, "tool_analog"),
        ],
    },
    {
        "id": "act6",
        "name": "教师端工作台",
        "lead_in": 0.7,
        "lines": [
            ("a6_1", "切换视角，来到教师工作台。", 0.45, "tea_intro"),
            ("a6_2", "老师的时间，不该耗在重复回答基础题上。", 0.40, "tea_queue"),
            ("a6_3", "相似提问自动合并同题组，AI 备齐依据与回复草稿。", 0.45, "tea_drawer"),
            ("a6_4", "精答一次即同步整组并沉淀为 FAQ，下次 AI 直接命中。", 0.50, "tea_precipitate"),
            ("a6_5", "回复支持一键撤回，知识库按快照安全回滚。", 0.40, "tea_kb"),
            ("a6_6", "支持资料正文解析与口语别名；两次负反馈自动降权提醒。", 0.45, "tea_feedback"),
            ("a6_7", "答疑洞察呈现 AI 解决率、首响与章节卡点热力，帮老师把课讲得更准。", 0.75, "tea_insights"),
        ],
    },
    {
        "id": "act7",
        "name": "不止课堂 · 校园生态",
        "lead_in": 0.6,
        "lines": [
            ("a7_1", "大学生的困惑，从不止于课本。", 0.40, "campus_intro"),
            ("a7_2", "课上问老师，课下问引路学长。", 0.40, "campus_kb"),
            ("a7_3", "八百零四条校园经验卡明标可信度，盲区直转校园主理人。", 0.50, "campus_map"),
            ("a7_4", "三十六栋手绘地图、图书馆找书、GPA 试算与三千七百多道食堂菜品推荐一应俱全。", 0.50, "campus_tools"),
            ("a7_5", "扫码只读同步学习通消息作业与课表，零密码留存。", 0.65, "campus_chaoxing"),
        ],
    },
    {
        "id": "act8",
        "name": "手机客户端与可信底座",
        "lead_in": 0.6,
        "lines": [
            ("a8_1", "师说不仅有网页端，更打造了原生 Android 手机客户端。", 0.45, "plat_dark"),
            ("a8_2", "桌面课程表小组件实时高亮当前课程；后台系统级消息通知及时推送老师回复，更有隐私拍题与学习通一键直达。", 0.55, "plat_mobile"),
            ("a8_3", "独立管理台集九大模块，覆盖角色隔离、操作审计与内容核实。", 0.45, "plat_admin"),
            ("a8_4", "密钥仅存服务端 AI 网关，提示词自动脱敏，严守风控与安全底线。", 0.70, "plat_security"),
        ],
    },
    {
        "id": "act9",
        "name": "硬核实证 · Bento 全景",
        "lead_in": 0.6,
        "lines": [
            ("a9_1", "一切设计，以真实数据为证。", 0.40, "bento_intro"),
            ("a9_2", "五门核心课，八十一条精修 FAQ，一百五十七道评测全部通过。", 0.45, "bento_numbers"),
            ("a9_3", "三十三位 AI 导师，八百零四条校园经验卡，九大管理治理模块。", 0.45, "bento_ecosystem"),
            ("a9_4", "真实部署、全端协同的教学协作系统。", 0.70, "bento_summary"),
        ],
    },
    {
        "id": "act10",
        "name": "终章 · 让问题有回响",
        "lead_in": 0.8,
        "lines": [
            ("a10_1", "课后敢问，课上讲透。", 0.60, "outro_quote1"),
            ("a10_2", "老师写下的每一句话，都成为 AI 的第一反应。", 0.75, "outro_quote2"),
            ("a10_3", "师说。让每个课后问题，都有回响。", 3.0, "outro_brand"),
        ],
    },
]


def ffmpeg_to_wav(mp3_path: Path, wav_path: Path) -> float:
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", str(mp3_path),
        "-af", "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_silence=0.06:start_threshold=-48dB,areverse",
        "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True)
    with wave.open(str(wav_path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


async def synth_line(line_id: str, text: str) -> tuple[Path, float]:
    mp3_path = AUDIO_DIR / f"vo_{line_id}.mp3"
    wav_path = AUDIO_DIR / f"vo_{line_id}.wav"
    if not mp3_path.exists():
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(str(mp3_path))
    dur = ffmpeg_to_wav(mp3_path, wav_path)
    return wav_path, dur


def format_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


async def main():
    print(f"Synthesizing voiceover with {VOICE} (rate={RATE}, pitch={PITCH})...")
    timeline_acts = []
    timeline_lines = []
    segments = []  # list of (start_sec, wav_path)

    cursor = 0.0
    total_chars = 0

    for act in ACTS:
        act_start = cursor
        cursor += act["lead_in"]
        act_lines = []

        for line_id, text, pause_after, sub_scene in act["lines"]:
            total_chars += len(text)
            wav_path, dur = await synth_line(line_id, text)
            start = cursor
            end = cursor + dur
            segments.append((start, wav_path))

            item = {
                "id": line_id,
                "act": act["id"],
                "scene": sub_scene,
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "dur": round(dur, 3),
                "pause_after": round(pause_after, 2),
            }
            act_lines.append(item)
            timeline_lines.append(item)
            cursor = end + pause_after
            print(f"  [{line_id}] {start:6.2f}s -> {end:6.2f}s ({dur:5.2f}s) | {text[:30]}...")

        act_end = cursor
        timeline_acts.append({
            "id": act["id"],
            "name": act["name"],
            "start": round(act_start, 3),
            "end": round(act_end, 3),
            "dur": round(act_end - act_start, 3),
            "lead_in": act["lead_in"],
            "line_ids": [x["id"] for x in act_lines],
        })

    total_dur = round(cursor, 3)
    print(f"\nTotal characters: {total_chars}")
    print(f"Total duration:   {total_dur:.2f}s ({int(total_dur//60)}:{total_dur%60:05.2f})")

    # Stitch mono master VO track with sample-accurate placement
    total_samples = int(round(total_dur * SAMPLE_RATE))
    buf = bytearray(total_samples * 2)  # 16-bit PCM mono

    for start_sec, wav_path in segments:
        with wave.open(str(wav_path), "rb") as w:
            raw = w.readframes(w.getnframes())
        offset_sample = int(round(start_sec * SAMPLE_RATE))
        offset_byte = offset_sample * 2
        end_byte = min(len(buf), offset_byte + len(raw))
        buf[offset_byte:end_byte] = raw[: end_byte - offset_byte]

    vo_master = AUDIO_DIR / "vo_master.wav"
    with wave.open(str(vo_master), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(buf))

    timeline = {
        "title": "师说 · 苹果发布会旗舰版宣传片",
        "voice": VOICE,
        "fps": 30,
        "total": total_dur,
        "acts": timeline_acts,
        "lines": timeline_lines,
    }
    tl_path = ROOT / "timeline.json"
    tl_path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")

    # Export SRT to promo root
    srt_path = ROOT.parent / "师说宣传片_苹果旗舰版_字幕.srt"
    srt_blocks = []
    for idx, line in enumerate(timeline_lines, 1):
        srt_blocks.append(
            f"{idx}\n{format_srt_time(line['start'])} --> {format_srt_time(line['end'])}\n{line['text']}\n"
        )
    srt_path.write_text("\n".join(srt_blocks), encoding="utf-8")

    print(f"Saved: {vo_master}")
    print(f"Saved: {tl_path}")
    print(f"Saved: {srt_path}")


if __name__ == "__main__":
    asyncio.run(main())
