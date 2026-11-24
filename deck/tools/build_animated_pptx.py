"""Build an editable, natively animated 16:9 roadshow .pptx for 师说 (Shishuo).

Fully aligned with the latest codebase & intro website (`public/intro/`):
- Core Dual-Channel Loop: AI first (with citations & confidence), Teacher escalation, Auto-growing FAQ
- New Features:
  * Digital Avatar Assistant (5 moods + blink/lip-sync)
  * Teaching-relevance filter & contextual multi-turn follow-ups
  * Teacher Classroom Suite: Anonymous Classroom Wall, Next-Class Opening Cards, Final Review Pack
  * Teacher AI-Answered Spot-Check & Correction Feedback + Knowledge Health + Attachments
  * Campus Ecosystem: 804 experience cards, 36-building hand-drawn map, Canteen Decision (107 stalls / 3,758 dishes), GPA panel, Repair Skill, Calendar & Library
  * Android Native (Capacitor): 4x2 Schedule Widget (incl. OPPO/ColorOS), 15-min background notifications, Chaoxing share-in, photo privacy consent, dark mode, 220-280ms linear motion
  * Admin Governance: 9 modules (usage, users, verification, content, campus, moderation, feedback, audit, system)

Animations:
- mc:AlternateContent Morph (p159:morph) with Fade fallback between slides
- Staggered Float-Up + Fade entrance animations (p:timing) on every slide
- Click-to-advance roadshow beats on key storytelling slides
- Full speaker notes per slide
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

import qrcode
from lxml import etree
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import nsdecls, qn
from pptx.util import Inches, Pt

ROOT = Path(r"D:/100h/jiaoshi ai")
INTRO_ASSETS = ROOT / "public" / "intro" / "assets"
AVATAR_ASSETS = ROOT / "public" / "avatar"
DECK_ASSETS = ROOT / "deck" / "assets" / "img"
FRESH_SHOTS = ROOT / "deck" / "pptx_fresh_shots"
WORK_ASSETS = ROOT / "deck" / "pptx_animated_assets"
OUT = ROOT / "deck" / "师说路演_高级动态版_v3.pptx"

# 16:9 Widescreen
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

# Color Palette (aligned with public/intro/intro.css)
C_PAPER = RGBColor(0xF4, 0xF0, 0xE6)       # --paper
C_PAPER_2 = RGBColor(0xEC, 0xE7, 0xDA)     # --paper-2
C_SURFACE = RGBColor(0xFB, 0xF9, 0xF3)     # --surface
C_INK = RGBColor(0x17, 0x24, 0x1E)         # --ink
C_INK_BAND = RGBColor(0x14, 0x21, 0x1B)    # --ink-band (dark slides)
C_INK_CARD = RGBColor(0x1C, 0x2D, 0x25)    # dark card surface
C_INK_SOFT = RGBColor(0x3F, 0x4F, 0x48)    # --ink-soft
C_MUTED = RGBColor(0x5D, 0x6B, 0x64)       # --muted
C_FAINT = RGBColor(0x77, 0x83, 0x7C)       # --faint
C_LINE = RGBColor(0xE2, 0xDC, 0xCF)        # --line
C_LINE_DARK = RGBColor(0x2B, 0x3F, 0x35)   # dark border
C_JADE = RGBColor(0x14, 0x6C, 0x56)        # --jade
C_JADE_DEEP = RGBColor(0x0C, 0x4E, 0x3D)   # --jade-deep
C_JADE_SOFT = RGBColor(0xE2, 0xEF, 0xE9)   # --jade-soft
C_JADE_LIGHT = RGBColor(0x5E, 0xC4, 0xA4)  # bright jade on dark bg
C_CLAY = RGBColor(0xB8, 0x61, 0x3E)        # --clay
C_CLAY_SOFT = RGBColor(0xF6, 0xE7, 0xDE)   # --clay-soft
C_GOLD = RGBColor(0xAD, 0x7F, 0x1D)        # --gold
C_GOLD_BRIGHT = RGBColor(0xD9, 0xAB, 0x4E) # bright gold on dark bg
C_GOLD_SOFT = RGBColor(0xF4, 0xEC, 0xD3)   # --gold-soft
C_CREAM = RGBColor(0xF7, 0xF1, 0xE3)
C_CREAM_MUTED = RGBColor(0xB3, 0xC0, 0xB9)

# Fonts
FONT_SERIF = "Noto Serif SC"
FONT_SANS = "Microsoft YaHei UI"
FONT_MONO = "Consolas"


# ---------------------------------------------------------------------------
# Image Preparation
# ---------------------------------------------------------------------------
def prep_image(
    src: Path,
    name: str,
    radius: int = 24,
    max_width: int = 1600,
) -> Path:
    """Convert image to crisp PNG with optional rounded corners."""
    WORK_ASSETS.mkdir(parents=True, exist_ok=True)
    dst = WORK_ASSETS / f"{name}.png"
    with Image.open(src) as im:
        im = im.convert("RGBA")
        if im.width > max_width:
            ratio = max_width / im.width
            im = im.resize((max_width, int(im.height * ratio)), Image.Resampling.LANCZOS)
        if radius > 0:
            mask = Image.new("L", im.size, 0)
            draw = ImageDraw.Draw(mask)
            draw.rounded_rectangle([(0, 0), im.size], radius=radius, fill=255)
            im.putalpha(mask)
        im.save(dst, "PNG", optimize=True)
    return dst


def generate_intro_qr() -> Path:
    """Generate a crisp QR code pointing specifically to the intro site."""
    WORK_ASSETS.mkdir(parents=True, exist_ok=True)
    dst = WORK_ASSETS / "qr_intro_exact.png"
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=14,
        border=2,
    )
    qr.add_data("http://121.37.30.147/intro/")
    qr.make(fit=True)
    im = qr.make_image(fill_color="#14211B", back_color="#FBF9F3").convert("RGBA")
    im.save(dst, "PNG", optimize=True)
    return dst


def prepare_all_assets() -> dict[str, Path]:
    return {
        "hero_student": prep_image(FRESH_SHOTS / "fresh_student.png", "fresh_student", radius=16),
        "story_ai": prep_image(INTRO_ASSETS / "story-ai.webp", "story_ai", radius=16),
        "story_queue": prep_image(INTRO_ASSETS / "story-queue.webp", "story_queue", radius=16),
        "story_reply": prep_image(FRESH_SHOTS / "fresh_teacher.png", "fresh_teacher", radius=16),
        "story_faq": prep_image(INTRO_ASSETS / "story-faq.webp", "story_faq", radius=16),
        "mentor": prep_image(FRESH_SHOTS / "fresh_mentor.png", "fresh_mentor", radius=16),
        "campus": prep_image(FRESH_SHOTS / "fresh_campus.png", "fresh_campus", radius=16),
        "canteen": prep_image(FRESH_SHOTS / "fresh_canteen.png", "fresh_canteen", radius=16),
        "app_mobile": prep_image(FRESH_SHOTS / "fresh_mobile.png", "fresh_mobile", radius=28),
        "ask_file": prep_image(FRESH_SHOTS / "fresh_student.png", "fresh_student_ask", radius=16),
        "digital_kmap": prep_image(DECK_ASSETS / "digital-kmap.jpg", "digital_kmap", radius=16),
        "admin_audit": prep_image(DECK_ASSETS / "admin-audit.jpg", "admin_audit", radius=16),
        "android_widget": prep_image(DECK_ASSETS / "android-widget.png", "android_widget", radius=20),
        "avatar_happy": prep_image(AVATAR_ASSETS / "happy.webp", "avatar_happy", radius=0, max_width=600),
        "avatar_answering": prep_image(AVATAR_ASSETS / "answering.webp", "avatar_answering", radius=0, max_width=600),
        "qr": generate_intro_qr(),
    }


# ---------------------------------------------------------------------------
# Low-level XML Helpers: Transitions, Shadows, Animations
# ---------------------------------------------------------------------------
def set_slide_bg(slide, color: RGBColor) -> None:
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_transition(slide, kind: str = "morph", speed: str = "med") -> None:
    """Add Morph (with Fade fallback) or Fade transition to slide."""
    sld = slide._element
    old = sld.find(qn("p:transition"))
    if old is not None:
        sld.remove(old)

    if kind == "morph":
        xml = f"""
        <mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" {nsdecls('p')}>
          <mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">
            <p:transition spd="{speed}" advClick="1">
              <p159:morph option="byObject"/>
            </p:transition>
          </mc:Choice>
          <mc:Fallback>
            <p:transition spd="{speed}" advClick="1">
              <p:fade/>
            </p:transition>
          </mc:Fallback>
        </mc:AlternateContent>
        """
        el = etree.fromstring(xml)
    else:
        xml = f'<p:transition {nsdecls("p")} spd="{speed}" advClick="1"><p:fade/></p:transition>'
        el = etree.fromstring(xml)

    clr = sld.find(qn("p:clrMapOvr"))
    if clr is not None:
        clr.addnext(el)
    else:
        sld.append(el)


def add_soft_shadow(shape, blur_pt: float = 18, dist_pt: float = 6, alpha_pct: int = 16) -> None:
    """Apply subtle, modern Apple-style drop shadow to a shape."""
    spPr = shape._element.spPr
    effectLst = spPr.find(qn("a:effectLst"))
    if effectLst is None:
        effectLst = etree.SubElement(spPr, qn("a:effectLst"))
    outerShdw = etree.SubElement(
        effectLst,
        qn("a:outerShdw"),
        blurRad=str(int(blur_pt * 12700)),
        dist=str(int(dist_pt * 12700)),
        dir="5400000",
        algn="ctr",
        rotWithShape="0",
    )
    srgbClr = etree.SubElement(outerShdw, qn("a:srgbClr"), val="14211B")
    etree.SubElement(srgbClr, qn("a:alpha"), val=str(alpha_pct * 1000))


class AnimBuilder:
    """Builds spec-compliant PowerPoint p:timing XML for a slide."""

    def __init__(self) -> None:
        self._id = 1
        self._beats: list[tuple[bool, list[tuple[int, int, int, float]]]] = []

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def add_auto(
        self,
        shapes: Iterable,
        start_delay: int = 60,
        stagger: int = 85,
        dur: int = 450,
        float_dy: float = 0.022,
    ) -> None:
        items = []
        d = start_delay
        for shp in shapes:
            if shp is None:
                continue
            items.append((shp.shape_id, d, dur, float_dy))
            d += stagger
        if items:
            self._beats.append((False, items))

    def add_click(
        self,
        shapes: Iterable,
        stagger: int = 80,
        dur: int = 420,
        float_dy: float = 0.022,
    ) -> None:
        items = []
        d = 0
        for shp in shapes:
            if shp is None:
                continue
            items.append((shp.shape_id, d, dur, float_dy))
            d += stagger
        if items:
            self._beats.append((True, items))

    def _make_item_par(
        self, spid: int, delay_ms: int, dur_ms: int, float_dy: float, node_type: str
    ) -> etree._Element:
        par = etree.Element(qn("p:par"))
        cTn = etree.SubElement(
            par,
            qn("p:cTn"),
            id=str(self._next_id()),
            presetID="10",
            presetClass="entr",
            presetSubtype="0",
            fill="hold",
            nodeType=node_type,
        )
        st = etree.SubElement(cTn, qn("p:stCondLst"))
        etree.SubElement(st, qn("p:cond"), delay=str(delay_ms))
        child = etree.SubElement(cTn, qn("p:childTnLst"))

        # 1) Set visibility -> visible
        p_set = etree.SubElement(child, qn("p:set"))
        cb = etree.SubElement(p_set, qn("p:cBhvr"))
        set_ctn = etree.SubElement(cb, qn("p:cTn"), id=str(self._next_id()), dur="1", fill="hold")
        set_st = etree.SubElement(set_ctn, qn("p:stCondLst"))
        etree.SubElement(set_st, qn("p:cond"), delay="0")
        tgt = etree.SubElement(cb, qn("p:tgtEl"))
        etree.SubElement(tgt, qn("p:spTgt"), spid=str(spid))
        attrs = etree.SubElement(cb, qn("p:attrNameLst"))
        etree.SubElement(attrs, qn("p:attrName")).text = "style.visibility"
        to_el = etree.SubElement(p_set, qn("p:to"))
        etree.SubElement(to_el, qn("p:strVal"), val="visible")

        # 2) Fade In
        eff = etree.SubElement(child, qn("p:animEffect"), transition="in", filter="fade")
        cb2 = etree.SubElement(eff, qn("p:cBhvr"))
        etree.SubElement(cb2, qn("p:cTn"), id=str(self._next_id()), dur=str(dur_ms))
        tgt2 = etree.SubElement(cb2, qn("p:tgtEl"))
        etree.SubElement(tgt2, qn("p:spTgt"), spid=str(spid))

        # 3) Subtle Float Up (ppt_y)
        if float_dy > 0:
            anim = etree.SubElement(child, qn("p:anim"), calcmode="lin", valueType="num")
            cb3 = etree.SubElement(anim, qn("p:cBhvr"), additive="base")
            etree.SubElement(cb3, qn("p:cTn"), id=str(self._next_id()), dur=str(dur_ms), decel="65000")
            tgt3 = etree.SubElement(cb3, qn("p:tgtEl"))
            etree.SubElement(tgt3, qn("p:spTgt"), spid=str(spid))
            attrs3 = etree.SubElement(cb3, qn("p:attrNameLst"))
            etree.SubElement(attrs3, qn("p:attrName")).text = "ppt_y"
            tavLst = etree.SubElement(anim, qn("p:tavLst"))
            tav0 = etree.SubElement(tavLst, qn("p:tav"), tm="0")
            val0 = etree.SubElement(tav0, qn("p:val"))
            etree.SubElement(val0, qn("p:strVal"), val=f"#ppt_y+{float_dy:.4f}")
            tav1 = etree.SubElement(tavLst, qn("p:tav"), tm="100000")
            val1 = etree.SubElement(tav1, qn("p:val"))
            etree.SubElement(val1, qn("p:strVal"), val="#ppt_y")

        return par

    def apply(self, slide) -> None:
        if not self._beats:
            return
        sld = slide._element
        old = sld.find(qn("p:timing"))
        if old is not None:
            sld.remove(old)

        timing = etree.Element(qn("p:timing"))
        tnLst = etree.SubElement(timing, qn("p:tnLst"))
        root_par = etree.SubElement(tnLst, qn("p:par"))
        root_ctn = etree.SubElement(
            root_par, qn("p:cTn"), id="1", dur="indefinite", restart="never", nodeType="tmRoot"
        )
        root_child = etree.SubElement(root_ctn, qn("p:childTnLst"))

        seq = etree.SubElement(root_child, qn("p:seq"), concurrent="1", nextAc="seek")
        main_ctn = etree.SubElement(seq, qn("p:cTn"), id=str(self._next_id()), dur="indefinite", nodeType="mainSeq")
        main_child = etree.SubElement(main_ctn, qn("p:childTnLst"))

        bld_spids: list[int] = []

        for is_click, items in self._beats:
            outer_par = etree.SubElement(main_child, qn("p:par"))
            outer_ctn = etree.SubElement(outer_par, qn("p:cTn"), id=str(self._next_id()), fill="hold")
            outer_st = etree.SubElement(outer_ctn, qn("p:stCondLst"))
            etree.SubElement(outer_st, qn("p:cond"), delay="indefinite" if is_click else "0")
            outer_child = etree.SubElement(outer_ctn, qn("p:childTnLst"))

            inner_par = etree.SubElement(outer_child, qn("p:par"))
            inner_ctn = etree.SubElement(inner_par, qn("p:cTn"), id=str(self._next_id()), fill="hold")
            inner_st = etree.SubElement(inner_ctn, qn("p:stCondLst"))
            etree.SubElement(inner_st, qn("p:cond"), delay="0")
            inner_child = etree.SubElement(inner_ctn, qn("p:childTnLst"))

            for idx, (spid, delay_ms, dur_ms, float_dy) in enumerate(items):
                nt = "clickEffect" if (is_click and idx == 0) else "withEffect"
                inner_child.append(self._make_item_par(spid, delay_ms, dur_ms, float_dy, nt))
                bld_spids.append(spid)

        prev_lst = etree.SubElement(seq, qn("p:prevCondLst"))
        prev_cond = etree.SubElement(prev_lst, qn("p:cond"), evt="onPrev", delay="0")
        etree.SubElement(etree.SubElement(prev_cond, qn("p:tgtEl")), qn("p:sldTgt"))

        next_lst = etree.SubElement(seq, qn("p:nextCondLst"))
        next_cond = etree.SubElement(next_lst, qn("p:cond"), evt="onNext", delay="0")
        etree.SubElement(etree.SubElement(next_cond, qn("p:tgtEl")), qn("p:sldTgt"))

        bldLst = etree.SubElement(timing, qn("p:bldLst"))
        for spid in dict.fromkeys(bld_spids):
            etree.SubElement(bldLst, qn("p:bldP"), spid=str(spid), grpId="0", build="allAtOnce")

        sld.append(timing)


# ---------------------------------------------------------------------------
# UI Component Builders
# ---------------------------------------------------------------------------
def add_text(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str,
    *,
    size: int = 16,
    color: RGBColor = C_INK,
    bold: bool = False,
    font: str = FONT_SANS,
    align: PP_ALIGN = PP_ALIGN.LEFT,
    valign: MSO_ANCHOR = MSO_ANCHOR.TOP,
    line_spacing: float = 1.25,
    name: str | None = None,
):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = valign
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    lines = text.split("\n")
    for idx, line in enumerate(lines):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
    return tb


def add_pill(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str,
    *,
    bg: RGBColor = C_JADE_SOFT,
    fg: RGBColor = C_JADE_DEEP,
    border: RGBColor | None = None,
    size: int = 11,
    bold: bool = True,
    name: str | None = None,
):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        shp.name = name
    shp.adjustments[0] = 0.5
    shp.fill.solid()
    shp.fill.fore_color.rgb = bg
    if border:
        shp.line.color.rgb = border
        shp.line.width = Pt(1)
    else:
        shp.line.fill.background()
    tf = shp.text_frame
    tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Inches(0.1)
    tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    r.font.name = FONT_SANS
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = fg
    return shp


def add_card(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    bg: RGBColor = C_SURFACE,
    border: RGBColor | None = C_LINE,
    radius: float = 0.06,
    shadow: bool = True,
    name: str | None = None,
):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        shp.name = name
    shp.adjustments[0] = radius
    shp.fill.solid()
    shp.fill.fore_color.rgb = bg
    if border:
        shp.line.color.rgb = border
        shp.line.width = Pt(1)
    else:
        shp.line.fill.background()
    if shadow:
        add_soft_shadow(shp, blur_pt=16, dist_pt=5, alpha_pct=12)
    return shp


def add_device_frame(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    img_path: Path,
    title: str,
    *,
    dark: bool = False,
    name: str | None = None,
) -> list:
    frame_bg = RGBColor(0x1E, 0x30, 0x28) if dark else C_SURFACE
    frame_border = C_LINE_DARK if dark else C_LINE
    bar_bg = RGBColor(0x16, 0x26, 0x1F) if dark else C_PAPER_2
    title_fg = C_CREAM_MUTED if dark else C_MUTED

    frame = add_card(slide, x, y, w, h, bg=frame_bg, border=frame_border, radius=0.04, shadow=True, name=name)
    bar_h = 0.35
    bar = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(x + 0.02), Inches(y + 0.02), Inches(w - 0.04), Inches(bar_h)
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = bar_bg
    bar.line.fill.background()

    dots = []
    dot_colors = [RGBColor(0xE0, 0x6C, 0x5A), RGBColor(0xE5, 0xB5, 0x4F), RGBColor(0x5B, 0xB8, 0x82)]
    for i, dc in enumerate(dot_colors):
        d = slide.shapes.add_shape(
            MSO_SHAPE.OVAL, Inches(x + 0.16 + i * 0.17), Inches(y + 0.135), Inches(0.095), Inches(0.095)
        )
        d.fill.solid()
        d.fill.fore_color.rgb = dc
        d.line.fill.background()
        dots.append(d)

    ttl = add_text(
        slide, x + 0.75, y + 0.05, w - 1.5, 0.26, title,
        size=10, color=title_fg, align=PP_ALIGN.CENTER, valign=MSO_ANCHOR.MIDDLE,
    )

    pad_x = 0.08
    pad_y = 0.07
    avail_w = w - pad_x * 2
    avail_h = h - bar_h - pad_y * 2
    with Image.open(img_path) as im:
        iw, ih = im.size
    ratio = min(avail_w / iw, avail_h / ih)
    pw, ph = iw * ratio, ih * ratio
    px = x + (w - pw) / 2
    py = y + bar_h + (h - bar_h - ph) / 2
    pic = slide.shapes.add_picture(str(img_path), Inches(px), Inches(py), width=Inches(pw), height=Inches(ph))
    return [frame, bar, *dots, ttl, pic]


def add_header(
    slide,
    eyebrow: str,
    title: str,
    subtitle: str | None = None,
    *,
    dark: bool = False,
    page_num: str = "",
) -> list:
    shapes = []
    pill_bg = RGBColor(0x20, 0x3D, 0x32) if dark else C_JADE_SOFT
    pill_fg = C_JADE_LIGHT if dark else C_JADE_DEEP
    eyebrow_shp = add_pill(
        slide, 0.75, 0.50, max(1.9, len(eyebrow) * 0.16 + 0.55), 0.34, eyebrow, bg=pill_bg, fg=pill_fg, size=10
    )
    shapes.append(eyebrow_shp)

    if page_num:
        pn = add_text(
            slide, 11.8, 0.52, 0.8, 0.3, f"{page_num} / 12",
            size=10, color=C_CREAM_MUTED if dark else C_FAINT, align=PP_ALIGN.RIGHT, font=FONT_MONO,
        )
        shapes.append(pn)

    ttl = add_text(
        slide, 0.75, 0.94, 11.8, 0.62, title,
        size=29, color=C_CREAM if dark else C_INK, bold=True, font=FONT_SERIF, name="!!slide_title",
    )
    shapes.append(ttl)

    if subtitle:
        sub = add_text(
            slide, 0.75, 1.56, 11.4, 0.46, subtitle,
            size=13.5, color=C_CREAM_MUTED if dark else C_INK_SOFT,
        )
        shapes.append(sub)
    return shapes


def add_footer(slide, dark: bool = False) -> None:
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.75), Inches(7.06), Inches(11.83), Inches(0.012))
    line.fill.solid()
    line.fill.fore_color.rgb = C_LINE_DARK if dark else C_LINE
    line.line.fill.background()
    add_text(
        slide, 0.75, 7.12, 6.8, 0.25,
        "师说 Shishuo · AI 双通道课后答疑 · 广应科首届黑客松", size=9, color=C_FAINT,
    )
    add_text(
        slide, 9.0, 7.12, 3.58, 0.25,
        "http://121.37.30.147/intro/", size=9, color=C_FAINT, align=PP_ALIGN.RIGHT, font=FONT_MONO,
    )


# ---------------------------------------------------------------------------
# 12 Slides
# ---------------------------------------------------------------------------
def build_deck(assets: dict[str, Path]) -> None:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    blank = prs.slide_layouts[6]

    # =========================================================================
    # SLIDE 1: 封面 (Dark Ink Band)
    # =========================================================================
    s1 = prs.slides.add_slide(blank)
    set_slide_bg(s1, C_INK_BAND)
    add_transition(s1, "fade", "med")
    s1.notes_slide.notes_text_frame.text = (
        "开场先给结论：师说，AI 双通道课后答疑。每句有出处、每问有回音、每课有积累。"
        "AI 先答、老师精答、答案留下来。不仅有 Web 与 Android 原生端，还配齐了数字人助教与教师课堂闭环工具。"
    )

    glow = s1.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8.6), Inches(0.8), Inches(5.2), Inches(5.2))
    glow.fill.solid()
    glow.fill.fore_color.rgb = RGBColor(0x14, 0x3D, 0x30)
    glow.line.fill.background()

    badge = add_pill(
        s1, 0.78, 0.74, 4.45, 0.36, "广应科首届黑客松 · 数字造梦师 · 软件应用赛道",
        bg=RGBColor(0x1E, 0x3A, 0x2F), fg=C_JADE_LIGHT, border=RGBColor(0x2B, 0x56, 0x46), size=10,
    )
    brand = add_text(s1, 0.78, 1.34, 5.6, 0.45, "师说  SHISHUO", size=16, color=C_GOLD_BRIGHT, bold=True)
    h1 = add_text(
        s1, 0.78, 1.88, 5.8, 2.2,
        "每句有出处\n每问有回音\n每课有积累",
        size=44, color=C_CREAM, bold=True, font=FONT_SERIF, line_spacing=1.18, name="!!hero_title",
    )
    lead = add_text(
        s1, 0.78, 4.28, 5.4, 1.1,
        "AI 双通道课后答疑系统：AI 先把有依据的答掉，拿不准的交给任课老师；老师写下的每一句，成为 AI 的下一次第一反应。",
        size=14, color=C_CREAM_MUTED, line_spacing=1.45,
    )

    kpi_cards = []
    for idx, (num, lbl) in enumerate([("5", "门试点课程"), ("81", "条精修 FAQ"), ("157/157", "检索评测通过")]):
        kx = 0.78 + idx * 1.82
        kc = add_card(s1, kx, 5.72, 1.66, 0.95, bg=C_INK_CARD, border=C_LINE_DARK, radius=0.1, shadow=False)
        kn = add_text(s1, kx + 0.14, 5.82, 1.38, 0.45, num, size=22, color=C_JADE_LIGHT, bold=True, font=FONT_SERIF)
        kl = add_text(s1, kx + 0.14, 6.28, 1.38, 0.28, lbl, size=10, color=C_CREAM_MUTED)
        kpi_cards.extend([kc, kn, kl])

    dev1 = add_device_frame(
        s1, 6.55, 1.22, 6.05, 5.15, assets["hero_student"], "shishuo · 学生端", dark=True, name="!!hero_device"
    )
    av1 = s1.shapes.add_picture(str(assets["avatar_happy"]), Inches(11.35), Inches(5.15), width=Inches(1.15))
    add_footer(s1, dark=True)

    a1 = AnimBuilder()
    a1.add_auto([badge, brand, h1, lead], start_delay=80, stagger=95)
    a1.add_auto([*dev1, av1], start_delay=260, stagger=0, dur=520)
    a1.add_auto(kpi_cards, start_delay=400, stagger=45)
    a1.apply(s1)

    # =========================================================================
    # SLIDE 2: 痛点 — 21:47 的问题，等到 08:31
    # =========================================================================
    s2 = prs.slides.add_slide(blank)
    set_slide_bg(s2, C_PAPER)
    add_transition(s2, "fade", "med")
    s2.notes_slide.notes_text_frame.text = (
        "晚上 21:47 学生发出一道题，往往要等到第二天早上 08:31 才收到回复。"
        "学生陷入三怕：怕没人回、怕通用 AI 胡说、怕半夜打扰老师；而老师陷入同一道题回复五遍、每学期重讲十遍的重复消耗。"
    )

    hdr2 = add_header(
        s2, "01 · 课后困境", "21:47 的问题，等到 08:31",
        "不是老师不负责，而是时间错位与重复提问，让师生双方都在消耗。", page_num="02"
    )

    tl_card = add_card(s2, 0.75, 2.28, 5.85, 4.42, bg=C_SURFACE, border=C_LINE, radius=0.05)
    t1_pill = add_pill(s2, 1.05, 2.55, 1.45, 0.34, "21:47 · 学生", bg=C_CLAY_SOFT, fg=C_CLAY, size=10)
    t1_txt = add_text(
        s2, 1.05, 2.98, 5.2, 0.9,
        "“老师，哈希表开放定址法和链地址法到底怎么区分？明天要交作业……”",
        size=15, color=C_INK, bold=True, line_spacing=1.35,
    )
    wait_bar = add_card(s2, 1.05, 4.05, 5.2, 0.68, bg=C_PAPER_2, border=None, radius=0.14, shadow=False)
    wait_txt = add_text(
        s2, 1.25, 4.18, 4.8, 0.42,
        "10 小时 44 分钟沉默  ·  通用 AI 没有本课程出处，不敢直接信",
        size=12, color=C_MUTED, valign=MSO_ANCHOR.MIDDLE,
    )
    t2_pill = add_pill(s2, 1.05, 4.95, 1.45, 0.34, "08:31 · 教师", bg=C_JADE_SOFT, fg=C_JADE_DEEP, size=10)
    t2_txt = add_text(
        s2, 1.05, 5.38, 5.2, 1.0,
        "早八前打开消息：同一个问题 5 位同学分别发了一遍。\n老师逐个打字回复，下学期新同学还会再问一遍。",
        size=13, color=C_INK_SOFT, line_spacing=1.4,
    )

    pain_cards = []
    pains = [
        ("学生第一怕 · 没人回", "晚自习卡点无人响应", "课后高频提问集中在 20:00–23:30，等回复时解题思路早已中断。", C_CLAY, C_CLAY_SOFT),
        ("学生第二怕 · 不敢信", "通用大模型会一本正经胡说", "缺少任课教师口径、教材章节与讲义出处，学生不敢拿去交作业。", C_GOLD, C_GOLD_SOFT),
        ("老师最累 · 重复答", "同一道题每学期讲十遍", "微信/QQ/学习通碎片回复无法沉淀，老师精力被高频重复题淹没。", C_JADE, C_JADE_SOFT),
    ]
    for i, (tag, head, desc, accent, soft) in enumerate(pains):
        py = 2.28 + i * 1.54
        c = add_card(s2, 6.9, py, 5.68, 1.34, bg=C_SURFACE, border=C_LINE, radius=0.06)
        p = add_pill(s2, 7.15, py + 0.18, 2.05, 0.3, tag, bg=soft, fg=accent, size=10)
        h = add_text(s2, 7.15, py + 0.54, 5.15, 0.32, head, size=15, color=C_INK, bold=True)
        d = add_text(s2, 7.15, py + 0.88, 5.15, 0.38, desc, size=11.5, color=C_INK_SOFT)
        pain_cards.append([c, p, h, d])

    add_footer(s2)

    a2 = AnimBuilder()
    a2.add_auto(hdr2, start_delay=40, stagger=80)
    a2.add_auto([tl_card, t1_pill, t1_txt, wait_bar, wait_txt, t2_pill, t2_txt], start_delay=220, stagger=65)
    for grp in pain_cards:
        a2.add_click(grp, stagger=45)
    a2.apply(s2)

    # =========================================================================
    # SLIDE 3: 核心主张 — 把老师的答案，变成 AI 的第一反应
    # =========================================================================
    s3 = prs.slides.add_slide(blank)
    set_slide_bg(s3, C_PAPER)
    add_transition(s3, "morph", "med")
    s3.notes_slide.notes_text_frame.text = (
        "师说的解法是：把老师的答案，变成 AI 的第一反应。"
        "AI 先答、有依据才开口；拿不准就交给老师；老师回复自动沉淀为知识库，而且支持 AI 已答抽查与纠错回灌。"
    )

    hdr3 = add_header(
        s3, "02 · 核心主张", "把老师的答案，变成 AI 的第一反应",
        "不是用 AI 替代老师，而是让老师写下的每一句话，成为下一次全班可用的第一反应。", page_num="03"
    )

    pillars = []
    pillar_data = [
        ("01", "AI 先答 · 有依据才开口", "检索课程精修 FAQ 与知识附件，输出高/中/低置信度与明确章节出处。", C_JADE, C_JADE_SOFT),
        ("02", "老师精答 · 拿不准就转交", "低置信度主动拒答不胡说，携带检索依据与参考草稿流转给任课老师。", C_CLAY, C_CLAY_SOFT),
        ("03", "答案留下来 · 抽查纠错更准", "一次回复送达全组并沉淀 FAQ；支持老师抽查 AI 已答记录并纠错回灌。", C_GOLD, C_GOLD_SOFT),
    ]
    for i, (num, title_p, desc_p, ac, sf) in enumerate(pillar_data):
        py = 2.28 + i * 1.52
        c = add_card(s3, 0.75, py, 5.45, 1.32, bg=C_SURFACE, border=C_LINE, radius=0.06)
        b = add_pill(s3, 0.98, py + 0.22, 0.56, 0.32, num, bg=sf, fg=ac, size=11)
        t = add_text(s3, 1.66, py + 0.20, 4.3, 0.34, title_p, size=15, color=C_INK, bold=True)
        d = add_text(s3, 0.98, py + 0.64, 4.98, 0.58, desc_p, size=11.5, color=C_INK_SOFT, line_spacing=1.35)
        pillars.extend([c, b, t, d])

    dev3 = add_device_frame(
        s3, 6.45, 2.28, 6.13, 4.42, assets["story_ai"], "有依据，才开口 · 实时出处与置信度", name="!!story_device"
    )
    add_footer(s3)

    a3 = AnimBuilder()
    a3.add_auto(hdr3, start_delay=40, stagger=80)
    a3.add_auto(pillars, start_delay=220, stagger=50)
    a3.add_auto(dev3, start_delay=320, stagger=0, dur=500)
    a3.apply(s3)

    # =========================================================================
    # SLIDE 4: 实测数据带 (Deep Jade Dark Contrast)
    # =========================================================================
    s4 = prs.slides.add_slide(blank)
    set_slide_bg(s4, C_JADE_DEEP)
    add_transition(s4, "fade", "med")
    s4.notes_slide.notes_text_frame.text = (
        "直接看当前系统的可复现实测数据：5 门试点课程、81 条精修 FAQ、157 项检索评测 100% 通过、"
        "33 位跨学科 AI 导师（含 22 门 B 站风格蒸馏档案），以及 41/41 校园评测、804 条经验卡与 9 大后台治理模块。"
    )

    hdr4 = add_header(
        s4, "03 · 实测验证", "不靠形容词，看可复现的实测数据",
        "数据来自当前运行环境与自动化评测套件（npm run eval:retrieval / eval:campus 可复跑）",
        dark=True, page_num="04",
    )

    big_stats = [
        ("5", "门试点课程", "真实课表、作业与知识附件闭环", C_JADE_LIGHT),
        ("81", "条精修 FAQ", "教师审定、带章节出处与版本快照", C_GOLD_BRIGHT),
        ("157/157", "检索评测全通过", "边界拒答、同义改写、出处命中 100%", C_JADE_LIGHT),
        ("33", "位 AI 导师", "覆盖文理工法艺 · 22 门风格蒸馏", C_GOLD_BRIGHT),
    ]
    stat_shps = []
    for i, (val, lbl, sub, col) in enumerate(big_stats):
        sx = 0.75 + i * 3.02
        c = add_card(s4, sx, 2.38, 2.78, 2.65, bg=RGBColor(0x09, 0x3D, 0x2F), border=RGBColor(0x1E, 0x6B, 0x55), radius=0.07)
        v = add_text(s4, sx + 0.22, 2.65, 2.34, 0.85, val, size=42, color=col, bold=True, font=FONT_SERIF)
        l = add_text(s4, sx + 0.22, 3.65, 2.34, 0.36, lbl, size=15, color=C_CREAM, bold=True)
        s = add_text(s4, sx + 0.22, 4.08, 2.34, 0.75, sub, size=11, color=C_CREAM_MUTED, line_spacing=1.35)
        stat_shps.extend([c, v, l, s])

    sub_stats = []
    for i, (v2, l2) in enumerate([("41/41", "校园评测通过"), ("804", "条校园经验卡 · 107 食堂档口"), ("9", "大管理端治理模块")]):
        bx = 0.75 + i * 4.02
        bc = add_card(s4, bx, 5.32, 3.78, 1.15, bg=RGBColor(0x0A, 0x45, 0x36), border=RGBColor(0x1E, 0x6B, 0x55), radius=0.1, shadow=False)
        bv = add_text(s4, bx + 0.24, 5.48, 1.25, 0.75, v2, size=26, color=C_CREAM, bold=True, font=FONT_SERIF, valign=MSO_ANCHOR.MIDDLE)
        bl = add_text(s4, bx + 1.52, 5.48, 2.1, 0.75, l2, size=12.5, color=C_CREAM_MUTED, valign=MSO_ANCHOR.MIDDLE)
        sub_stats.extend([bc, bv, bl])

    add_footer(s4, dark=True)

    a4 = AnimBuilder()
    a4.add_auto(hdr4, start_delay=40, stagger=80)
    a4.add_auto(stat_shps, start_delay=220, stagger=45)
    a4.add_click(sub_stats, stagger=55)
    a4.apply(s4)

    # =========================================================================
    # SLIDE 5: 双通道引擎 + 教学相关性防线 + 连续追问
    # =========================================================================
    s5 = prs.slides.add_slide(blank)
    set_slide_bg(s5, C_PAPER)
    add_transition(s5, "fade", "med")
    s5.notes_slide.notes_text_frame.text = (
        "双通道引擎新增了教学相关性过滤：非教学闲聊会在入口被礼貌拦截回课堂；"
        "高/中置信度回答支持带上下文的连续追问并本地保留记录；"
        "低置信度自动转交教师队列；老师回复后不仅沉淀 FAQ，还能对 AI 已答记录做抽查与纠错回灌。"
    )

    hdr5 = add_header(
        s5, "04 · 双通道引擎", "教学过滤 + 置信分流 + 纠错回灌的闭环",
        "非教学问题入口拦截，高置信带出处秒答且可连续追问，低置信转教师并支持 AI 已答抽查纠错。", page_num="05"
    )

    flow_nodes = []
    steps = [
        ("1. 多模态提问", "文字 / 拍照识题 / 整份作业解析", C_SURFACE, C_LINE, C_INK),
        ("2. 过滤与检索", "教学相关性过滤 + 81+ FAQ 检索", C_SURFACE, C_LINE, C_INK),
        ("3A. 高/中置信", "带出处秒答 · 支持上下文连续追问", C_JADE_SOFT, C_JADE, C_JADE_DEEP),
        ("3B. 低置信拒答", "不胡说，携带依据转交教师待办", C_CLAY_SOFT, C_CLAY, C_CLAY),
        ("4. 沉淀与抽查", "回复入库 + AI 已答抽查纠错回灌", C_GOLD_SOFT, C_GOLD, C_GOLD),
    ]
    for i, (st_t, st_d, bg, bd, fg) in enumerate(steps):
        fx = 0.75 + i * 2.42
        c = add_card(s5, fx, 2.28, 2.22, 1.38, bg=bg, border=bd, radius=0.08)
        t = add_text(s5, fx + 0.16, 2.44, 1.9, 0.36, st_t, size=13, color=fg, bold=True)
        d = add_text(s5, fx + 0.16, 2.86, 1.9, 0.65, st_d, size=10.5, color=C_INK_SOFT, line_spacing=1.35)
        flow_nodes.append([c, t, d])

    dev5_l = add_device_frame(s5, 0.75, 3.92, 5.75, 2.9, assets["story_queue"], "低置信问题 → 自动进入教师待办队列")
    dev5_r = add_device_frame(s5, 6.82, 3.92, 5.76, 2.9, assets["story_faq"], "教师回复 → 自动沉淀为带快照的课程 FAQ")
    add_footer(s5)

    a5 = AnimBuilder()
    a5.add_auto(hdr5, start_delay=40, stagger=80)
    a5.add_auto(flow_nodes[0] + flow_nodes[1], start_delay=220, stagger=45)
    a5.add_click(flow_nodes[2] + flow_nodes[3] + flow_nodes[4], stagger=45)
    a5.add_auto(dev5_l + dev5_r, start_delay=380, stagger=0, dur=500)
    a5.apply(s5)

    # =========================================================================
    # SLIDE 6: 学生端 — 数字人助教、拍照/文档解析与极简移动导航
    # =========================================================================
    s6 = prs.slides.add_slide(blank)
    set_slide_bg(s6, C_PAPER)
    add_transition(s6, "morph", "med")
    s6.notes_slide.notes_text_frame.text = (
        "学生端迎来了全新升级：我们加入了交互式数字人助教，具备待机、思考、回答、提醒、开心 5 种情绪与眨眼口型动画；"
        "支持拍照识题与整份 PDF/Word/PPT 作业本机解析、带上下文连续追问；"
        "同时内置 33 位学科 AI 导师与卡诺图、模电 Q 点工具，并将手机端精简为我的答疑、课程表、学习通、校园生活 4 个核心入口。"
    )

    hdr6 = add_header(
        s6, "05 · 学生端新体验", "数字人助教陪伴 · 拍照与整份作业直问",
        "5 种情绪状态数字人助教、拍照识题与本机文档解析、连续追问，以及精简聚焦的 4 栏移动导航。", page_num="06"
    )

    dev6_a = add_device_frame(s6, 0.75, 2.26, 4.15, 2.92, assets["ask_file"], "拍照识题 & 整份作业本机解析")
    dev6_b = add_device_frame(s6, 5.10, 2.26, 3.85, 2.92, assets["mentor"], "33 位 AI 导师 · 22 门 B 站风格蒸馏")
    dev6_c = add_device_frame(s6, 9.15, 2.26, 3.43, 2.92, assets["digital_kmap"], "交互式学科工具（卡诺图 / 进制 / Q 点）")

    # Bottom 4 feature cards (with Digital Avatar sprite on card 1!)
    stu_cards = []
    stu_items = [
        ("数字人助教形象", "5 种情绪状态 + 眨眼口型动画，让课后答疑更有温度。"),
        ("连续追问保留上下文", "回答卡片支持多轮追问，重开弹窗仍自动保留本地对话上下文。"),
        ("学科导师与沙盒", "33 位跨学科导师 + 卡诺图化简、进制转换与模电 Q 点计算。"),
        ("移动端 4 栏精简", "聚焦「我的答疑 / 课程表 / 学习通 / 校园生活」，丝滑滑块切换。"),
    ]
    for i, (st, sd) in enumerate(stu_items):
        cx = 0.75 + i * 3.02
        c = add_card(s6, cx, 5.38, 2.78, 1.42, bg=C_SURFACE, border=C_LINE, radius=0.08)
        if i == 0:
            t = add_text(s6, cx + 0.16, 5.54, 1.75, 0.32, st, size=12.5, color=C_JADE_DEEP, bold=True)
            d = add_text(s6, cx + 0.16, 5.90, 1.72, 0.80, sd, size=10.5, color=C_INK_SOFT, line_spacing=1.32)
            av = s6.shapes.add_picture(str(assets["avatar_answering"]), Inches(cx + 1.88), Inches(5.52), width=Inches(0.82))
            stu_cards.extend([c, t, d, av])
        else:
            t = add_text(s6, cx + 0.18, 5.54, 2.42, 0.32, st, size=12.5, color=C_JADE_DEEP, bold=True)
            d = add_text(s6, cx + 0.18, 5.90, 2.42, 0.80, sd, size=10.5, color=C_INK_SOFT, line_spacing=1.32)
            stu_cards.extend([c, t, d])

    add_footer(s6)

    a6 = AnimBuilder()
    a6.add_auto(hdr6, start_delay=40, stagger=80)
    a6.add_auto(dev6_a + dev6_b + dev6_c, start_delay=200, stagger=25, dur=480)
    a6.add_auto(stu_cards, start_delay=400, stagger=38)
    a6.apply(s6)

    # =========================================================================
    # SLIDE 7: 教师端 — 课堂内外教学闭环神器 (New!)
    # =========================================================================
    s7 = prs.slides.add_slide(blank)
    set_slide_bg(s7, C_PAPER)
    add_transition(s7, "morph", "med")
    s7.notes_slide.notes_text_frame.text = (
        "教师端不只是被动等工单，我们新增了三大课堂闭环工具和 AI 抽查纠错："
        "课中可开「本节提问墙」，学生免登录匿名扫码提问；"
        "下课后可一键生成「下节课 3 条开场卡」与「期末复习包」；"
        "还能随时抽查 AI 已答记录并纠错回灌，搭配同题合并、知识库健康度与课程知识附件，真正实现只回一次、全班受益。"
    )

    hdr7 = add_header(
        s7, "06 · 教师工作台", "只回一次，并把课堂内外连成闭环",
        "同题合并 + AI 已答抽查纠错 + 本节提问墙 + 下节课开场卡 + 期末复习包，全面减负增效。", page_num="07"
    )

    dev7 = add_device_frame(s7, 0.75, 2.28, 6.05, 4.45, assets["story_reply"], "教师工作台 · 同题合并回复、草稿与快照回滚")

    t_cards = []
    t_items = [
        ("同题合并 & 快捷模板", "同题聚为一组，AI 备好依据草稿与模板；支持撤回与 FAQ 快照回滚。", C_JADE, C_JADE_SOFT),
        ("AI 已答抽查 & 纠错回灌", "抽查 AI 自动回复记录，发现偏差一键纠错并回灌知识库（新）。", C_CLAY, C_CLAY_SOFT),
        ("本节提问墙（免登录扫码）", "课堂实时发起匿名提问墙问卷，当堂收集学生卡点（新）。", C_GOLD, C_GOLD_SOFT),
        ("开场卡 & 期末复习包", "缺口一键生成「下节课 3 条开场卡」与「期末复习包」（新）。", C_JADE_DEEP, C_JADE_SOFT),
    ]
    for i, (tt, td, tc_col, tc_bg) in enumerate(t_items):
        ty = 2.28 + i * 1.14
        c = add_card(s7, 7.05, ty, 5.53, 1.0, bg=C_SURFACE, border=C_LINE, radius=0.07)
        p = add_pill(s7, 7.25, ty + 0.14, 2.25, 0.28, tt, bg=tc_bg, fg=tc_col, size=10)
        d = add_text(s7, 7.25, ty + 0.48, 5.15, 0.45, td, size=11, color=C_INK_SOFT, line_spacing=1.3)
        t_cards.extend([c, p, d])

    add_footer(s7)

    a7 = AnimBuilder()
    a7.add_auto(hdr7, start_delay=40, stagger=80)
    a7.add_auto(dev7, start_delay=200, stagger=0, dur=500)
    a7.add_auto(t_cards, start_delay=300, stagger=55)
    a7.apply(s7)

    # =========================================================================
    # SLIDE 8: 校园生活与教务生态 — 804 条经验卡 + 食堂 + GPA + 报修
    # =========================================================================
    s8 = prs.slides.add_slide(blank)
    set_slide_bg(s8, C_PAPER)
    add_transition(s8, "morph", "med")
    s8.notes_slide.notes_text_frame.text = (
        "课下的事也能在师说解决：804 条校园经验卡与 36 栋手绘地图，"
        "加上全新上线的师生双端「食堂决策」（107 个档口、3758 道菜，支持推荐/榜单/盲盒），"
        "重做的 GPA 成绩面板、校历当天安排、以及带 3 到 6 个官方入口的引路学长报修 Skill。"
    )

    hdr8 = add_header(
        s8, "07 · 校园与教务生态", "课下的事，也能问、也能算、也能办",
        "804 条经验卡 · 36 栋手绘地图 · 师生双端食堂决策 · GPA 成绩面板 · 校历当日安排 · 报修直达。", page_num="08"
    )

    dev8 = add_device_frame(s8, 0.75, 2.28, 7.15, 4.45, assets["campus"], "校园知识库 · 804 条经验卡与 36 栋手绘地图")

    c_cards = []
    c_items = [
        ("804 条 / 36 栋", "经验卡与手绘地图", "7 大分类，每条标注来源与可信度"),
        ("107 档 / 3,758 菜", "食堂决策（双端）", "推荐 / 榜单 / 盲盒，师生侧栏直达"),
        ("GPA & 校历", "教务课表与成绩", "自定义学期筛选 GPA、校历当天安排"),
        ("报修 & 学习通", "官方入口直达", "校园网/宿舍报修 Skill，附 3–6 个官方链接"),
    ]
    for i, (cv, cl, cd) in enumerate(c_items):
        cy = 2.28 + i * 1.14
        c = add_card(s8, 8.15, cy, 4.43, 1.0, bg=C_SURFACE, border=C_LINE, radius=0.07)
        v = add_text(s8, 8.33, cy + 0.14, 1.85, 0.36, cv, size=15.5, color=C_JADE, bold=True, font=FONT_SERIF)
        l = add_text(s8, 10.20, cy + 0.16, 2.25, 0.32, cl, size=12.5, color=C_INK, bold=True)
        d = add_text(s8, 8.33, cy + 0.54, 4.10, 0.36, cd, size=10.5, color=C_INK_SOFT)
        c_cards.extend([c, v, l, d])

    add_footer(s8)

    a8 = AnimBuilder()
    a8.add_auto(hdr8, start_delay=40, stagger=80)
    a8.add_auto(dev8, start_delay=200, stagger=0, dur=500)
    a8.add_auto(c_cards, start_delay=300, stagger=55)
    a8.apply(s8)

    # =========================================================================
    # SLIDE 9: Android 原生端与极致动效
    # =========================================================================
    s9 = prs.slides.add_slide(blank)
    set_slide_bg(s9, C_PAPER)
    add_transition(s9, "fade", "med")
    s9.notes_slide.notes_text_frame.text = (
        "Android 原生端基于 Capacitor 深度适配：4×2 桌面今日课表小组件已适配 OPPO/ColorOS；"
        "WorkManager 15 分钟后台轮询通知；支持学习通双向跳转与分享进提问框；"
        "新增系统深色模式、系统相册隐私授权、长按图标快捷拍题，以及 220–280ms 线性丝滑过渡动效。"
    )

    hdr9 = add_header(
        s9, "08 · Android 原生端", "装进口袋的原生助教与丝滑交互",
        "4×2 课表小组件（含 ColorOS 适配）、后台通知、学习通联动、相册隐私授权与深色模式。", page_num="09"
    )

    pic_phone = s9.shapes.add_picture(str(assets["app_mobile"]), Inches(0.85), Inches(2.28), height=Inches(4.45))
    add_soft_shadow(pic_phone, blur_pt=18, dist_pt=6, alpha_pct=18)

    widget_card = add_card(s9, 3.65, 2.35, 3.25, 2.25, bg=C_SURFACE, border=C_LINE, radius=0.07)
    widget_lbl = add_text(s9, 3.85, 2.48, 2.85, 0.28, "4×2 桌面今日课表小组件", size=11, color=C_JADE_DEEP, bold=True)
    pic_widget = s9.shapes.add_picture(str(assets["android_widget"]), Inches(3.85), Inches(2.82), width=Inches(2.85))

    notify_card = add_card(s9, 3.65, 4.80, 3.25, 1.92, bg=C_SURFACE, border=C_LINE, radius=0.07)
    notify_pill = add_pill(s9, 3.85, 4.98, 1.5, 0.28, "系统通知 · 15min", bg=C_JADE_SOFT, fg=C_JADE_DEEP, size=9.5)
    notify_t = add_text(s9, 3.85, 5.34, 2.85, 0.34, "老师回复，弹进通知栏", size=13, color=C_INK, bold=True)
    notify_d = add_text(
        s9, 3.85, 5.70, 2.85, 0.85,
        "App 退到后台仍通过 WorkManager 轮询，老师精答与同题解决实时提醒。",
        size=10.5, color=C_INK_SOFT, line_spacing=1.35,
    )

    native_cards = []
    native_items = [
        ("今日课表 · 桌面小组件", "4×2 小组件「上课中」高亮、下课翻明日，已修复 OPPO/ColorOS 兼容。"),
        ("学习通双向直达 & 快捷方式", "一键跳转学习通或反向分享题目进提问框；长按图标直达拍题/课表/食堂。"),
        ("相册隐私授权 & 深色模式", "系统相册与附件隐私弹窗合规授权，自动跟随系统深色模式与沉浸式状态栏。"),
        ("220–280ms 线性丝滑动效", "底栏滑块跟随、图标微弹跳与弹窗线性过渡，消除抽搐与误触蓝框。"),
    ]
    for i, (nt, nd) in enumerate(native_items):
        ny = 2.28 + i * 1.14
        c = add_card(s9, 7.15, ny, 5.43, 1.0, bg=C_SURFACE, border=C_LINE, radius=0.07)
        t = add_text(s9, 7.38, ny + 0.14, 4.95, 0.32, nt, size=13, color=C_INK, bold=True)
        d = add_text(s9, 7.38, ny + 0.48, 4.95, 0.44, nd, size=10.5, color=C_INK_SOFT, line_spacing=1.3)
        native_cards.extend([c, t, d])

    add_footer(s9)

    a9 = AnimBuilder()
    a9.add_auto(hdr9, start_delay=40, stagger=80)
    a9.add_auto([pic_phone, widget_card, widget_lbl, pic_widget, notify_card, notify_pill, notify_t, notify_d], start_delay=200, stagger=45)
    a9.add_auto(native_cards, start_delay=320, stagger=55)
    a9.apply(s9)

    # =========================================================================
    # SLIDE 10: 可信底座与管理端 9 大治理模块
    # =========================================================================
    s10 = prs.slides.add_slide(blank)
    set_slide_bg(s10, C_PAPER)
    add_transition(s10, "fade", "med")
    s10.notes_slide.notes_text_frame.text = (
        "敢在真实校园落地，靠的是可信与治理底座："
        "答案有出处、边界明确拒答、教学相关性过滤、三端权限分层；"
        "管理端配备 9 大治理模块——用量统计、用户角色、教师认证、内容管理、校园知识、风控审核、意见反馈、操作审计与系统配置。"
    )

    hdr10 = add_header(
        s10, "09 · 可信底座", "敢给学生用，才叫产品",
        "出处可溯、边界可控、权限分层、操作留痕——管理端 9 大治理模块保障教学严谨性。", page_num="10"
    )

    trust_cards = []
    trust_items = [
        ("答案有出处 · 边界拒答", "强制绑定课程章节与 FAQ 编号；低置信度与非教学闲聊自动停答。"),
        ("三端权限分层 & 删改审计", "学生提问、教师审定沉淀、管理员支持问题删除与全链路审计。"),
        ("知识库健康度 & 附件治理", "支持课程知识附件上传、版本快照回滚与负反馈待完善追踪。"),
        ("9 大管理端治理模块", "用量 / 用户 / 教师认证 / 内容 / 校园 / 风控 / 反馈 / 审计 / 系统配置。"),
    ]
    for i, (tr_t, tr_d) in enumerate(trust_items):
        ty = 2.28 + i * 1.14
        c = add_card(s10, 0.75, ty, 4.75, 1.0, bg=C_SURFACE, border=C_LINE, radius=0.07)
        t = add_text(s10, 0.98, ty + 0.14, 4.3, 0.32, tr_t, size=13.5, color=C_JADE_DEEP, bold=True)
        d = add_text(s10, 0.98, ty + 0.48, 4.3, 0.44, tr_d, size=10.8, color=C_INK_SOFT, line_spacing=1.3)
        trust_cards.extend([c, t, d])

    dev10 = add_device_frame(s10, 5.75, 2.28, 6.83, 4.45, assets["admin_audit"], "管理端 · 9 大治理模块与全量操作审计")
    add_footer(s10)

    a10 = AnimBuilder()
    a10.add_auto(hdr10, start_delay=40, stagger=80)
    a10.add_auto(trust_cards, start_delay=220, stagger=55)
    a10.add_auto(dev10, start_delay=280, stagger=0, dur=500)
    a10.apply(s10)

    # =========================================================================
    # SLIDE 11: 落地与演进路线
    # =========================================================================
    s11 = prs.slides.add_slide(blank)
    set_slide_bg(s11, C_PAPER)
    add_transition(s11, "morph", "med")
    s11.notes_slide.notes_text_frame.text = (
        "落地路线分三步：当前已完成 5 门试点课闭环、Web 与 Android 原生双端上线及 157/157、41/41 评测；"
        "下学期推进学院级 20+ 门专业课试点；12 个月内将双通道与审计底座复制到更多高校与企业级知识库。"
    )

    hdr11 = add_header(
        s11, "10 · 落地路线", "从 5 门课到学院级知识基建",
        "答案越厚，AI 越准；AI 越准，老师越省时间——让每届学生的提问都成为下一届的资产。", page_num="11"
    )

    phases = []
    phase_data = [
        ("阶段一 · 已完成", "5 门试点课跑通闭环", [
            "• 81 条精修 FAQ + 33 位 AI 导师上线",
            "• 课堂提问墙 / 开场卡 / 复习包全交付",
            "• Web + Android 原生端 & 157/157 评测",
        ], C_JADE, C_JADE_SOFT),
        ("阶段二 · 下学期", "学院级试点与多课协同", [
            "• 扩展至学院核心专业课群（20+ 门）",
            "• 沉淀课程先修图谱与跨课知识联动",
            "• 对接教务课表与学习通常态化数据流",
        ], C_GOLD, C_GOLD_SOFT),
        ("阶段三 · 12 个月", "跨校与企业级 FAQ 复制", [
            "• 输出标准化「双通道 + 抽查审计」底座",
            "• 复制至高校教务咨询、实验室规范答疑",
            "• 延伸至企业内训与高合规客服知识库",
        ], C_CLAY, C_CLAY_SOFT),
    ]
    for i, (ptag, ptitle, bullets, pac, psf) in enumerate(phase_data):
        px = 0.75 + i * 4.02
        c = add_card(s11, px, 2.38, 3.78, 4.15, bg=C_SURFACE, border=C_LINE, radius=0.06)
        p = add_pill(s11, px + 0.25, 2.65, 1.65, 0.34, ptag, bg=psf, fg=pac, size=10.5)
        t = add_text(s11, px + 0.25, 3.16, 3.28, 0.45, ptitle, size=17, color=C_INK, bold=True, font=FONT_SERIF)
        b = add_text(s11, px + 0.25, 3.78, 3.28, 2.35, "\n\n".join(bullets), size=12, color=C_INK_SOFT, line_spacing=1.35)
        phases.append([c, p, t, b])

    add_footer(s11)

    a11 = AnimBuilder()
    a11.add_auto(hdr11, start_delay=40, stagger=80)
    a11.add_auto(phases[0], start_delay=220, stagger=45)
    a11.add_click(phases[1], stagger=45)
    a11.add_click(phases[2], stagger=45)
    a11.apply(s11)

    # =========================================================================
    # SLIDE 12: 收尾与扫码体验 (Dark Ink Band)
    # =========================================================================
    s12 = prs.slides.add_slide(blank)
    set_slide_bg(s12, C_INK_BAND)
    add_transition(s12, "fade", "med")
    s12.notes_slide.notes_text_frame.text = (
        "最后用一句话收尾：老师写下的每一句话，都成为 AI 的第一反应。"
        "项目介绍站与产品均已部署上线，欢迎评委和同学们扫码直接体验。谢谢大家！"
    )

    glow12 = s12.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8.8), Inches(1.4), Inches(4.5), Inches(4.5))
    glow12.fill.solid()
    glow12.fill.fore_color.rgb = RGBColor(0x14, 0x3D, 0x30)
    glow12.line.fill.background()

    b12 = add_pill(
        s12, 0.85, 1.15, 2.35, 0.36, "感谢聆听 · 欢迎现场体验",
        bg=RGBColor(0x1E, 0x3A, 0x2F), fg=C_JADE_LIGHT, border=RGBColor(0x2B, 0x56, 0x46), size=10.5,
    )
    h12 = add_text(
        s12, 0.85, 1.85, 7.2, 2.0,
        "老师写下的每一句话\n都成为 AI 的第一反应",
        size=40, color=C_CREAM, bold=True, font=FONT_SERIF, line_spacing=1.25,
    )
    sub12 = add_text(
        s12, 0.85, 4.05, 6.8, 0.9,
        "每句有出处 · 每问有回音 · 每课有积累\n师说 Shishuo — 让每一门课，拥有会生长的答疑知识库。",
        size=15, color=C_CREAM_MUTED, line_spacing=1.5,
    )
    url_pill = add_pill(
        s12, 0.85, 5.25, 4.1, 0.44, "介绍站与体验入口：http://121.37.30.147/intro/",
        bg=C_INK_CARD, fg=C_GOLD_BRIGHT, border=C_LINE_DARK, size=11,
    )

    qr_card = add_card(s12, 9.05, 1.65, 3.25, 4.05, bg=C_SURFACE, border=C_LINE, radius=0.07)
    qr_pic = s12.shapes.add_picture(str(assets["qr"]), Inches(9.45), Inches(2.0), width=Inches(2.45), height=Inches(2.45))
    qr_t = add_text(s12, 9.25, 4.65, 2.85, 0.35, "扫码打开项目介绍站", size=14, color=C_INK, bold=True, align=PP_ALIGN.CENTER)
    qr_d = add_text(s12, 9.25, 5.02, 2.85, 0.45, "支持直接提问体验 & 观看宣传片", size=10.5, color=C_MUTED, align=PP_ALIGN.CENTER)
    av12 = s12.shapes.add_picture(str(assets["avatar_happy"]), Inches(7.55), Inches(4.55), width=Inches(1.25))

    add_footer(s12, dark=True)

    a12 = AnimBuilder()
    a12.add_auto([b12, h12, sub12, url_pill], start_delay=80, stagger=100)
    a12.add_auto([qr_card, qr_pic, qr_t, qr_d, av12], start_delay=320, stagger=45)
    a12.apply(s12)

    prs.save(OUT)
    print(f"Saved: {OUT} ({os.path.getsize(OUT) / 1048576:.2f} MB, {len(prs.slides)} slides)")


if __name__ == "__main__":
    assets = prepare_all_assets()
    build_deck(assets)
