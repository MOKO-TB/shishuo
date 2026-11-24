"""Subset the fonts embedded by Chrome and shrink the exported PDF."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pymupdf

PDF = Path(r"D:/100h/jiaoshi ai/deck/师说路演.pdf")
TMP = PDF.with_name("师说路演_subset.pdf")


def main() -> None:
    doc = pymupdf.open(PDF)
    before = os.path.getsize(PDF) / 1048576
    doc.subset_fonts()
    doc.save(TMP, garbage=4, deflate=True, clean=True)
    doc.close()
    shutil.move(TMP, PDF)
    after = os.path.getsize(PDF) / 1048576
    print(f"optimized: {before:.2f} MB -> {after:.2f} MB")


if __name__ == "__main__":
    main()
