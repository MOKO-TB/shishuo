# -*- coding: utf-8 -*-
"""按介绍站实际用字，裁剪 Noto Serif SC 子集，避免整份 1.5MB 字体进首屏。

用法：python dev/build-intro-fonts.py（在改过 public/intro/index.html 文案后重跑）
"""

from __future__ import annotations

import re
import string
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "public" / "intro" / "index.html"
JS = ROOT / "public" / "intro" / "intro.js"
SRC = ROOT / "promo" / "fonts"
OUT = ROOT / "public" / "intro" / "fonts"

EXTRA = (
    "，。、；：？！“”‘’（）【】《》〈〉「」『』…—·～"
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    " +-×÷/\\|@#%&*()[]{}<>.,:;!?\"'"
)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_text = HTML.read_text(encoding="utf-8") + JS.read_text(encoding="utf-8")
    visible = re.sub(r"<[^>]+>", " ", source_text)
    chars = sorted(set(visible) | set(EXTRA) | set(string.printable))
    chars = [ch for ch in chars if ch.strip() or ch in " \n\t"]

    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", suffix=".txt", delete=False
    ) as handle:
        handle.write("".join(chars))
        text_file = handle.name

    for weight in (400, 600):
        source = SRC / f"noto-serif-sc-chinese-simplified-{weight}-normal.woff2"
        target = OUT / f"noto-serif-{weight}.woff2"
        subprocess.run(
            [
                "pyftsubset",
                str(source),
                f"--text-file={text_file}",
                "--flavor=woff2",
                "--layout-features=*",
                "--no-hinting",
                "--desubroutinize",
                f"--output-file={target}",
            ],
            check=True,
        )
        print(f"{target.name:24} {target.stat().st_size / 1024:6.0f} KB")

    Path(text_file).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
