"""Build a static 16:9 .pptx from the final PDF pages.

The animated deck is index.html; this is the hand-off / fallback file.
Each PDF page becomes one full-bleed image slide with speaker notes.
"""
from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path

import pymupdf
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
from pptx.oxml.ns import qn
from lxml import etree

ROOT = Path(r"D:/100h/jiaoshi ai")
PDF = ROOT / "deck" / "师说路演.pdf"
WORK = ROOT / "deck" / "pptx_frames"
OUT = ROOT / "deck" / "师说路演_静态版.pptx"

NOTES = [
    "开场先给结论：师说，AI 双通道课后答疑。AI 先答、老师精答、答案留下来。线上已经能打开，今天现场也可以直接体验。",
    "21:47 的问题，等到第二天早上。不是老师不负责，而是重复问题太多、时间错位。学生三怕：没人回、不敢信、怕打扰。",
    "我们的答案：把老师的答案，变成 AI 的第一反应。三条主张——AI 先答、老师精答、答案留下来。不是替代老师，是把老师从重复里解放出来。",
    "产品即现场：打开就能问。文字、语音、拍题、整份文档都可以。已上线，现场现在就能打开。",
    "双通道不是两个按钮，是一条会自己变厚的闭环。检索 5 门课 81 条精修 FAQ，三档置信度；高置信带出处直接答，低置信拒答转人工；老师回复后沉淀 FAQ，回流知识库。",
    "学生端不止会聊天。整份作业直接读，浏览器本机解析；33 位导师可切换；卡诺图、Q 点交互工具；语音提问；复习卡和期末复习包把错题变成下一轮。",
    "教师端：老师只回答一次，全班不用再问第二遍。语义同题合并、AI 先给依据与草稿、一次回复整组、撤回按快照回滚；AI 已答抽查纠正一次就同步给引用同一条 FAQ 的同学；还有本节提问墙、期末复习包和下节课开场卡。",
    "不止课堂。校园知识库 804 条经验卡、7 大分类；食堂决策 107 档口 3758 道菜；36 栋手绘地图，加上 GPA、空教室、校历、图书馆和学习通同步。",
    "Android App v0.2.6，安装包只有 1.4MB。4×2 桌面课表小组件按教学周显示今天，OPPO/ColorOS 有兼容版；上课前本地提醒；拍题、相册保存；系统分享到师说；学习通一键直达；系统深色跟随。Android 15 已验收冷启动、登录保持、相册授权、返回键、断网兜底。",
    "敢给学生用，才叫产品。答案有出处、数据有边界、权限有分层、操作有留痕；管理端 9 个治理模块，所有关键操作写进审计。",
    "不靠形容词，看实测。157/157 检索评测全部通过，41/41 校园评测通过，81 条精修 FAQ，804 条校园经验卡，33 位导师，9 个治理模块，5 门试点课。数据可复现。",
    "落地路线：现在 Web 和 Android 都跑通了完整闭环；下学期做学院级试点、多课程二级知识库；12 个月复制到企业 FAQ 等场景。答案越厚，AI 越准；AI 越准，老师越省时间。",
    "收尾：老师写下的每一句话，都成为 AI 的第一反应。扫码现在打开，谢谢。",
]


def prepare_frames() -> list[Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDF)
    frames = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(1.7778, 1.7778), alpha=False)
        im = Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")
        dst = WORK / f"slide{i + 1:02d}.jpg"
        im.save(dst, "JPEG", quality=92, optimize=True, progressive=True)
        frames.append(dst)
    doc.close()
    return frames


def add_fade(slide) -> None:
    sld = slide._element
    transition = etree.SubElement(sld, qn("p:transition"))
    transition.set("spd", "med")
    etree.SubElement(transition, qn("p:fade"))
    clr = sld.find(qn("p:clrMapOvr"))
    if clr is not None:
        clr.addnext(transition)


def main() -> None:
    frames = prepare_frames()
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    for idx, frame in enumerate(frames):
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(str(frame), 0, 0, width=prs.slide_width, height=prs.slide_height)
        slide.notes_slide.notes_text_frame.text = NOTES[idx]
        add_fade(slide)

    prs.save(OUT)
    print(f"saved {OUT} ({os.path.getsize(OUT) / 1048576:.1f} MB, {len(frames)} slides)")


if __name__ == "__main__":
    main()
