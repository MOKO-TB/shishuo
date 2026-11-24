#!/usr/bin/env bash
set -euo pipefail
cd "D:/100h/jiaoshi ai"

# 1. Render the 12 animated slides to PNG (optional preview / QA)
node deck/tools/shoot.mjs

# 2. Print the 12 pages to PDF at 16:9
node deck/tools/export.mjs

# 3. Subset fonts so the PDF stays ~12 MB instead of ~44 MB
python deck/tools/optimize_pdf.py

# 4. Rebuild the static PPTX from the final PDF (with speaker notes)
python deck/tools/build_pptx.py
