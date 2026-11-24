import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
tl = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
S = {s["id"]: s for s in tl["segments"]}
def cue(sid, key):
    return S[sid]["start"] + (S[sid]["cues"].get(key) or 0)

items = [
    (S["s1"]["start"] + .12, S["s1"]["start"] + S["s1"]["duration"] + .15, "下课铃响，问题才刚开始。"),
    (cue("s2", "问同学") - .05, cue("s2", "搜网页") - .05, "问同学，没人回。"),
    (cue("s2", "搜网页") - .05, cue("s2", "等老师") - .05, "搜网页，不敢信。"),
    (cue("s2", "等老师") - .05, S["s2"]["start"] + S["s2"]["duration"] + .2, "等老师，又怕打扰。"),
    (S["s3"]["start"] + .05, S["s3"]["start"] + S["s3"]["duration"] + .1, "师说，让 AI 和老师，接力回答每一个课后问题。"),
    (S["s4"]["start"] + .05, cue("s4", "有依据") - .1, "学生提问，AI 先查课程知识库。"),
    (cue("s4", "有依据") - .1, cue("s4", "没把握") - .1, "有依据才回答，标出来源和置信度。"),
    (cue("s4", "没把握") - .1, S["s4"]["start"] + S["s4"]["duration"] + .2, "没把握，就老实说不知道。"),
    (S["s5"]["start"] + .05, cue("s5", "同题合并") - .05, "拿不准的，自动转给任课老师。"),
    (cue("s5", "同题合并") - .05, cue("s5", "一次回复") - .05, "同题合并，AI 备好上下文和回复草稿。"),
    (cue("s5", "一次回复") - .05, cue("s5", "直接命中") - .05, "老师一次回复整组，答案沉淀成 FAQ。"),
    (cue("s5", "直接命中") - .05, S["s5"]["start"] + S["s5"]["duration"] + .2, "下一次，AI 直接命中。"),
    (S["s6"]["start"] + .05, cue("s6", "校园知识库") - .1, "5 门课程，81 条精修 FAQ，157 道评测全部通过。"),
    (cue("s6", "校园知识库") - .1, S["s6"]["start"] + S["s6"]["duration"] + .2, "还有校园知识库、AI 导师和手机端。"),
    (S["s7"]["start"] + .1, cue("s7", "第一反应") + .45, "老师写下的每一句话，都成为 AI 的第一反应。"),
    (cue("s7", "第一反应") + .45, S["s7"]["start"] + S["s7"]["duration"] + .3, "师说，让每个课后问题，都有回响。"),
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
out = ROOT / "师说宣传片_字幕.srt"
out.write_text("\n".join(lines), encoding="utf-8")
print(out, len(items), "cues")
