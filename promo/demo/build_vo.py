# -*- coding: utf-8 -*-
"""
师说 · 功能演示视频（约 6 分钟）
真实界面走查版：学生提问 → 有据回答 → 转交老师 → 教师处理 → FAQ 沉淀
旁白合成、时间轴与 SRT 字幕。
"""

import asyncio
import json
import subprocess
import wave
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+8%"
PITCH = "-2Hz"
SAMPLE_RATE = 48000

ACTS = [
    {
        "id": "act1",
        "name": "开场",
        "display": "功能演示",
        "lead_in": 1.1,
        "lines": [
            ("a1_1", "这是一条功能演示。", None, 0.35, "intro_flow"),
            ("a1_2", "我们不只展示界面，而是把一次真实的课后答疑，从提问、回答、转交，到老师处理，完整走一遍。", None, 0.35, "intro_flow"),
            ("a1_3", "学生叫林晓，晚上十点，她卡在数据结构的一道题上。", None, 0.35, "intro_home"),
            ("a1_4", "接下来发生的每一步，都可以在师说里真实操作。", None, 0.45, "intro_home"),
        ],
    },
    {
        "id": "act2",
        "name": "学生提问",
        "display": "学生提问",
        "lead_in": 0.8,
        "lines": [
            ("a2_1", "第一步，选课程。五门试点课放在同一排，点一下数据结构。", None, 0.3, "stu_course"),
            ("a2_2", "输入框支持文字、语音、拍照和文档。林晓直接用自己的话，把卡点敲进去。", None, 0.3, "stu_type"),
            ("a2_3", "SPFA 判负环，为什么入队次数超过 n-1，就说明有负环？", "S P F A 判负环，为什么入队次数超过 n 减一，就说明有负环？", 0.35, "stu_type"),
            ("a2_4", "点击交给 AI。系统先在课程知识库里检索，再让模型组织答案，而不是让模型自由发挥。", "点击交给 A I。系统先在课程知识库里检索，再让模型组织答案，而不是让模型自由发挥。", 0.35, "stu_send"),
            ("a2_5", "回答先给判断，再分三步推导。每个关键结论，都能点回原章节。", None, 0.3, "stu_answer"),
            ("a2_6", "右上角是置信度。中置信，代表有依据，但还不够完整，需要老师补充。", None, 0.35, "stu_answer"),
            ("a2_7", "她继续追问：为什么是 n-1，不是 n？上下文还在，不用重新解释题目。", "她继续追问：为什么是 n 减一，不是 n？上下文还在，不用重新解释题目。", 0.3, "stu_thread"),
            ("a2_8", "除了打字，也可以拍照、传讲义。文件先在浏览器本机解析，她看到摘要，确认后才发送。", None, 0.3, "stu_file"),
            ("a2_9", "如果已经有同学问过，右侧会出现同题组。点一下同问，老师回复时一起收到。", None, 0.35, "stu_same"),
            ("a2_10", "提问、追问、同问，都在同一个线程里；换设备，也不会丢上下文。", None, 0.45, "stu_thread_end"),
        ],
    },
    {
        "id": "act3",
        "name": "档案与复习",
        "display": "问答档案",
        "lead_in": 0.8,
        "lines": [
            ("a3_1", "所有问答自动归档。可以按课程、状态、时间筛选，也能直接搜关键词。", None, 0.3, "archive_search"),
            ("a3_2", "找到这道题，收藏、复制深链，或者把当前筛选导出成 CSV。", "找到这道题，收藏、复制深链，或者把当前筛选导出成 C S V。", 0.35, "archive_export"),
            ("a3_3", "没弄懂的题，会进入复习卡。先自己想，再翻答案；记住了，或者还没会，系统会继续安排。", None, 0.35, "review"),
            ("a3_4", "老师回复、补充请求、转交状态，都会进通知中心；邮件提醒也可以单独打开。", None, 0.3, "notify"),
            ("a3_5", "这些记录只属于当前账号，不会影响老师的待办，也不会改写课程知识库。", None, 0.45, "notify"),
        ],
    },
    {
        "id": "act4",
        "name": "AI 导师",
        "display": "AI 导师",
        "lead_in": 0.8,
        "lines": [
            ("a4_1", "师说不只有课程答疑，还有三十三位学科导师。", None, 0.3, "mentor_library"),
            ("a4_2", "五位试点导师默认开启，其余随选随加。文科、社科、法学、艺术，都能问。", None, 0.3, "mentor_library"),
            ("a4_3", "古代文学按朝代梳理，近现代史拉时间线；艺术概论、刑法学、心理学、微观经济学，各有自己的知识地图。", None, 0.4, "humanities"),
            ("a4_4", "导师不会直接灌答案：先定位卡点，再查先修，最后只点破关键一步。", None, 0.3, "mentor_method"),
            ("a4_5", "工科还有交互式实验室。数电的卡诺图可以一步步化简，时序波形可以对照验证。", None, 0.3, "kmap"),
            ("a4_6", "模电的静态工作点，改一个参数，就能看波形怎么变。", None, 0.35, "analog"),
            ("a4_7", "导师和工具都在同一个入口，不需要装插件。", None, 0.45, "mentor_end"),
        ],
    },
    {
        "id": "act5",
        "name": "转交老师",
        "display": "转交与接手",
        "lead_in": 0.8,
        "lines": [
            ("a5_1", "如果知识库没有足够依据，AI 不会编。它会明确说：这个问题我还没有可靠答案，然后转交任课老师。", "如果知识库没有足够依据，A I 不会编。它会明确说：这个问题我还没有可靠答案，然后转交任课老师。", 0.35, "transfer"),
            ("a5_2", "老师的待办台会收到这道题，连同学生原话、AI 检索记录和置信度。", "老师的待办台会收到这道题，连同学生原话、A I 检索记录和置信度。", 0.3, "teacher_queue"),
            ("a5_3", "相似的问题自动合并成同题组，老师只需要处理一次。", None, 0.35, "teacher_queue"),
            ("a5_4", "打开这道 SPFA 题，右侧是 AI 的检索判断：知识库没有足够可靠的内容，只给一条相关线索，不生成答案。", "打开这道 S P F A 题，右侧是 A I 的检索判断：知识库没有足够可靠的内容，只给一条相关线索，不生成答案。", 0.3, "teacher_drawer"),
            ("a5_5", "下面是可以直接用的回复草稿。老师可以改，也可以请学生补充题目。", None, 0.3, "teacher_drawer"),
            ("a5_6", "发送后，同组学生一起收到；这条回复同时沉淀成课程 FAQ，下次 AI 就能直接命中。", "发送后，同组学生一起收到；这条回复同时沉淀成课程 F A Q，下次 A I 就能直接命中。", 0.35, "teacher_send"),
            ("a5_7", "发错了可以撤回，知识库有快照，可以回滚。", None, 0.3, "teacher_kb"),
            ("a5_8", "每一次回复、撤回、修改，都会进操作审计。", None, 0.45, "audit"),
        ],
    },
    {
        "id": "act6",
        "name": "知识库与洞察",
        "display": "知识库与洞察",
        "lead_in": 0.8,
        "lines": [
            ("a6_1", "教师端还有一套知识库工作台。新增、编辑、停用 FAQ，维护章节和口语别名。", "教师端还有一套知识库工作台。新增、编辑、停用 F A Q，维护章节和口语别名。", 0.3, "teacher_kb_tour"),
            ("a6_2", "支持 CSV、JSON 批量导入导出，导入前会做校验，不会把格式错误写进课程。", "支持 C S V、J S O N 批量导入导出，导入前会做校验，不会把格式错误写进课程。", 0.3, "teacher_import"),
            ("a6_3", "每条回复都可以自检：引用是否对齐、结论是否超出知识库、语气是否合适。", None, 0.3, "teacher_check"),
            ("a6_4", "学生点“还不够”，会进入负反馈闭环；连续两次，相关知识降权，并提醒老师。", None, 0.35, "teacher_feedback"),
            ("a6_5", "答疑洞察把 AI 解决率、首次响应、同题合并、章节卡点热力放在一屏。", "答疑洞察把 A I 解决率、首次响应、同题合并、章节卡点热力放在一屏。", 0.3, "insights"),
            ("a6_6", "老师看到的不只是答了多少，而是全班卡在哪。", None, 0.3, "insights"),
            ("a6_7", "数据按课程和演示空间隔离，不会混到其他老师那里。", None, 0.45, "insights"),
        ],
    },
    {
        "id": "act7",
        "name": "校园生态",
        "display": "校园生态",
        "lead_in": 0.8,
        "lines": [
            ("a7_1", "课上的问题问老师，课下的事问学长。师说把校园经验也做成了可检索的知识库。", None, 0.3, "campus_map"),
            ("a7_2", "八百零四条经验卡，七大分类，每条都标来源和可信度；涉及政策、金额、截止日期，会提示以学校官方通知为准。", None, 0.35, "campus_cards"),
            ("a7_3", "三十六栋建筑的手绘地图，输入起点和终点，直接给路线。", None, 0.3, "campus_map"),
            ("a7_4", "图书馆可以查馆藏、看位置、找同类书；食堂收录一百零七个档口、三千七百五十八道菜，按口味和预算推荐。", None, 0.4, "canteen"),
            ("a7_5", "校历、空教室、GPA 试算、教务课表与成绩，都在校园生活里。", "校历、空教室、G P A 试算、教务课表与成绩，都在校园生活里。", 0.3, "campus_tools"),
            ("a7_6", "学习通扫码绑定后，只读同步消息、作业、资料和章节，不保存密码。", None, 0.3, "chaoxing"),
            ("a7_7", "手机端和安卓客户端也能用，桌面小组件会高亮当前课程。", None, 0.45, "mobile"),
        ],
    },
    {
        "id": "act8",
        "name": "管理与安全",
        "display": "平台与安全",
        "lead_in": 0.8,
        "lines": [
            ("a8_1", "平台底座是独立管理台，九个模块：账号、课程分配、学生问答、风控审核、操作审计、AI 用量、内容运营、内容核实、系统与开发。", "平台底座是独立管理台，九个模块：账号、课程分配、学生问答、风控审核、操作审计、A I 用量、内容运营、内容核实、系统与开发。", 0.35, "admin_accounts"),
            ("a8_2", "每个账号按角色隔离，教师只能操作自己分配的课程。", None, 0.3, "admin_accounts"),
            ("a8_3", "AI 密钥只存在服务端网关，提示词自动脱敏；敏感词、禁言、封禁和图片审核，都在服务端执行。", "A I 密钥只存在服务端网关，提示词自动脱敏；敏感词、禁言、封禁和图片审核，都在服务端执行。", 0.35, "admin_verify"),
            ("a8_4", "这不是一个演示壳，而是已经部署、可复现、可审计的完整系统。", None, 0.45, "admin_audit"),
        ],
    },
    {
        "id": "act9",
        "name": "数据与收尾",
        "display": "数据与体验",
        "lead_in": 0.9,
        "lines": [
            ("a9_1", "最后，用一组数据收尾。", None, 0.3, "datawall"),
            ("a9_2", "五门核心课，八十一条精修 FAQ，一百五十七道检索评测全部通过。", "五门核心课，八十一条精修 F A Q，一百五十七道检索评测全部通过。", 0.3, "datawall"),
            ("a9_3", "三十三位导师，八百零四条校园经验卡，九大管理模块。", None, 0.4, "datawall"),
            ("a9_4", "师说，让每个课后问题，都有回响。", None, 0.5, "outro"),
            ("a9_5", "扫码进入项目介绍站，所有功能都可以现场体验。", None, 2.2, "outro"),
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


async def synth_line(line_id: str, text: str, say: str | None) -> tuple[Path, float]:
    mp3_path = AUDIO_DIR / f"vo_{line_id}.mp3"
    wav_path = AUDIO_DIR / f"vo_{line_id}.wav"
    if not mp3_path.exists():
        communicate = edge_tts.Communicate(say or text, VOICE, rate=RATE, pitch=PITCH)
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
    segments = []
    cursor = 0.0
    total_chars = 0

    for act in ACTS:
        act_start = cursor
        cursor += act["lead_in"]
        act_lines = []
        for line_id, text, say, pause_after, scene in act["lines"]:
            total_chars += len(text)
            wav_path, dur = await synth_line(line_id, text, say)
            start = cursor
            end = cursor + dur
            segments.append((start, wav_path))
            item = {
                "id": line_id,
                "act": act["id"],
                "scene": scene,
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "dur": round(dur, 3),
                "pause_after": round(pause_after, 2),
            }
            act_lines.append(item)
            timeline_lines.append(item)
            cursor = end + pause_after
            print(f"  [{line_id}] {start:6.2f}s -> {end:6.2f}s ({dur:5.2f}s) | {text[:34]}...")
        timeline_acts.append({
            "id": act["id"],
            "name": act["name"],
            "display": act["display"],
            "start": round(act_start, 3),
            "end": round(cursor, 3),
            "dur": round(cursor - act_start, 3),
            "lead_in": act["lead_in"],
            "line_ids": [x["id"] for x in act_lines],
        })

    total_dur = round(cursor, 3)
    print(f"\nTotal characters: {total_chars}")
    print(f"Total duration:   {total_dur:.2f}s ({int(total_dur // 60)}:{total_dur % 60:05.2f})")

    total_samples = int(round(total_dur * SAMPLE_RATE))
    buf = bytearray(total_samples * 2)
    for start_sec, wav_path in segments:
        with wave.open(str(wav_path), "rb") as w:
            raw = w.readframes(w.getnframes())
        offset_byte = int(round(start_sec * SAMPLE_RATE)) * 2
        end_byte = min(len(buf), offset_byte + len(raw))
        buf[offset_byte:end_byte] = raw[: end_byte - offset_byte]

    vo_master = AUDIO_DIR / "vo_master.wav"
    with wave.open(str(vo_master), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(buf))

    timeline = {
        "title": "师说 · 功能演示",
        "voice": VOICE,
        "fps": 30,
        "total": total_dur,
        "acts": timeline_acts,
        "lines": timeline_lines,
    }
    (ROOT / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")

    srt_path = ROOT.parent / "师说功能演示_字幕.srt"
    srt_blocks = []
    for idx, line in enumerate(timeline_lines, 1):
        srt_blocks.append(
            f"{idx}\n{format_srt_time(line['start'])} --> {format_srt_time(line['end'])}\n{line['text']}\n"
        )
    srt_path.write_text("\n".join(srt_blocks), encoding="utf-8")

    print(f"Saved: {vo_master}")
    print(f"Saved: {ROOT / 'timeline.json'}")
    print(f"Saved: {srt_path}")


if __name__ == "__main__":
    asyncio.run(main())
