import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
tl = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
S = {s["id"]: s for s in tl["segments"]}
def cue(sid, key):
    return S[sid]["start"] + (S[sid]["cues"].get(key) or 0)

items = [
    (S["s1"]["start"] + .05, S["s2"]["start"] - .1, "每一个课后问题，都在等一个回答。"),
    (S["s2"]["start"], S["s3"]["start"] - .1, "下课以后，问题才刚开始。"),
    (cue("s3", "问同学") - .05, cue("s3", "搜网页") - .05, "问同学，没人回。"),
    (cue("s3", "搜网页") - .05, cue("s3", "等老师") - .05, "搜网页，不敢信。"),
    (cue("s3", "等老师") - .05, S["s4"]["start"], "等老师，又怕打扰。"),
    (S["s4"]["start"], S["s5"]["start"] - .1, "一个晚上，就这样过去了。"),
    (S["s5"]["start"], S["s6"]["start"] - .1, "师说，把 AI 和老师，接成一条接力。"),
    (S["s6"]["start"], S["s7"]["start"] - .1, "AI 先答，老师精答，答案留下来。"),
    (S["s7"]["start"], S["s8"]["start"] - .1, "不是替老师回答，而是让老师的回答，被留下。"),
    (S["s8"]["start"], cue("s8", "有依据") - .1, "学生提问，AI 先查课程知识库。"),
    (cue("s8", "有依据") - .1, cue("s8", "没把握") - .1, "有依据才回答，标出来源和置信度。"),
    (cue("s8", "没把握") - .1, S["s8b"]["start"] - .1, "没把握，就老实说不知道，自动交给老师。"),
    (S["s8b"]["start"], S["s9"]["start"] - .1, "每一次提问，都带着课程、章节和上下文。"),
    (S["s9"]["start"], S["s9b"]["start"] - .1, "提问可以带图，也可以带文件；原文件不上传。"),
    (S["s9b"]["start"], S["s10"]["start"] - .1, "追问、同问、确认已解决，都在一条记录里。"),
    (S["s10"]["start"], cue("s10", "同题合并") - .1, "老师看到的，不是二十条待办，是一组问题。"),
    (cue("s10", "同题合并") - .1, cue("s10", "整组") - .1, "同题合并，AI 备好上下文和回复草稿。"),
    (cue("s10", "整组") - .1, cue("s10", "FAQ") - .1, "老师一次回复整组，3 个人收到。"),
    (cue("s10", "FAQ") - .1, cue("s10", "直接命中") - .1, "答案沉淀成 FAQ，下一次直接命中。"),
    (cue("s10", "直接命中") - .1, S["s11"]["start"] - .1, "老师写下的字，成为 AI 的依据。"),
    (S["s11"]["start"], cue("s11", "时间还回去") - .1, "回复可撤回，FAQ 可回滚，每一条都有出处。"),
    (cue("s11", "时间还回去") - .1, S["s11b"]["start"] - .1, "每一个被接住的问题，都在把老师的时间还回去。"),
    (S["s11b"]["start"], S["s12"]["start"] - .1, "还不够？自动标记待完善，通知老师。"),
    (S["s12"]["start"], S["s12b"]["start"] - .1, "不止一门课。课内课外，一个入口。"),
    (S["s12b"]["start"], S["s13"]["start"] - .1, "模型 Key 只在服务端，敏感词、禁言、封禁后台强制执行。"),
    (S["s13"]["start"], S["s14"]["start"] - .1, "5 门课程，81 条 FAQ，157 / 157 评测通过。"),
    (S["s14"]["start"], S["s15"]["start"] - .1, "不是概念，是现在就能用的系统。"),
    (S["s15"]["start"], cue("s15", "第一反应") + .3, "老师写下的每一句话，都成为 AI 的第一反应。"),
    (cue("s15", "第一反应") + .3, S["s15"]["start"] + S["s15"]["duration"] + .4, "师说，让每个课后问题，都有回响。"),
]

def stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

lines = []
for i, (a, b, text) in enumerate(items, 1):
    lines += [str(i), f"{stamp(a)} --> {stamp(b)}", text, ""]
out = ROOT.parent / "师说宣传片_长版_字幕.srt"
out.write_text("\n".join(lines), encoding="utf-8")
print(out, len(items), "cues")
