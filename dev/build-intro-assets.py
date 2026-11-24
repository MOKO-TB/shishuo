# -*- coding: utf-8 -*-
"""生成 public/intro 使用的 WebP / 海报 / 字幕，源文件全部来自 promo/。

用法：python dev/build-intro-assets.py
只读取 promo/，输出到 public/intro/，可重复执行。
"""

from __future__ import annotations

import shutil
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "promo"
OUT = ROOT / "public" / "intro"
ASSETS = OUT / "assets"
MEDIA = OUT / "media"

WEBP_QUALITY = 82


def save_webp(image: Image.Image, name: str, width: int, quality: int = WEBP_QUALITY) -> None:
    if image.width != width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    target = ASSETS / name
    image.save(target, "WEBP", quality=quality, method=6)
    print(f"  {name:26} {image.width}x{image.height}  {target.stat().st_size / 1024:6.0f} KB")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)

    print("[1/5] 界面截图 -> WebP")
    desktop = {
        "student-home.png": ("hero-student.webp", 1600),
        "student-thread.png": ("story-ai.webp", 1600),
        "teacher-queue.png": ("story-queue.webp", 1600),
        "teacher-drawer.png": ("story-reply.webp", 1600),
        "student-knowledge.png": ("story-faq.webp", 1600),
        "student-campus.png": ("feature-campus.webp", 1400),
    }
    for source, (name, width) in desktop.items():
        save_webp(Image.open(SRC / "assets" / source), name, width)

    # 导师截图底部有一行「服务端 AI 未就绪」的旧演示态，裁掉；
    # 只留右侧抽屉上半部分，裁成 16:10，卡片里不用再二次裁切。
    mentor = Image.open(SRC / "assets" / "student-mentor.png").crop((1680, 0, 2880, 750))
    save_webp(mentor, "feature-mentor.webp", 1000)

    # 校园地图截图同时给「课下的事」卡片使用；当前 UI 不再做旧版 804 叠加卡。
    save_webp(Image.open(SRC / "assets" / "student-campus.png"), "feature-campus-804.webp", 1400)

    save_webp(Image.open(SRC / "assets" / "student-mobile.png"), "app-mobile.webp", 780)

    print("[2/5] 宣传片封面 -> 海报 / 分享图")
    cover = Image.open(SRC / "师说宣传片_苹果旗舰版_封面.png")
    save_webp(cover, "poster-apple.webp", 1600, quality=82)

    og = cover.convert("RGB")
    target_ratio = 1200 / 630
    crop_h = round(og.width / target_ratio)
    top = max(0, (og.height - crop_h) // 2)
    og = og.crop((0, top, og.width, top + crop_h)).resize((1200, 630), Image.LANCZOS)
    og.save(ASSETS / "og-apple.jpg", "JPEG", quality=86, optimize=True, progressive=True)
    print(f"  og-apple.jpg               1200x630  {(ASSETS / 'og-apple.jpg').stat().st_size / 1024:6.0f} KB")

    print("[3/5] 二维码")
    shutil.copyfile(SRC / "assets" / "qr.png", ASSETS / "qr.png")
    print("  qr.png 已复制")

    print("[4/5] SRT -> VTT")
    srt = (SRC / "师说宣传片_苹果旗舰版_字幕.srt").read_text(encoding="utf-8-sig")
    vtt = re.sub(
        r"(\d{2}:\d{2}:\d{2}),(\d{3})",
        lambda m: f"{m.group(1)}.{m.group(2)}",
        srt.strip(),
    )
    (MEDIA / "shishuo-apple.vtt").write_text("WEBVTT" + chr(10)*2 + vtt + chr(10), encoding="utf-8")
    print("  media/shishuo-apple.vtt 已生成")

    print("[5/5] 苹果旗舰版 720p -> media")
    video = SRC / "师说宣传片_苹果旗舰版_720p.mp4"
    shutil.copyfile(video, MEDIA / "shishuo-apple-720.mp4")
    print(f"  media/shishuo-apple-720.mp4  {video.stat().st_size / 1024 / 1024:6.1f} MB")

if __name__ == "__main__":
    main()
