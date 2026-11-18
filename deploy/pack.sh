#!/usr/bin/env bash
# 本地打包：生成可上传到服务器的源码包（排除虚拟环境、测试、大图与 git 元数据）
# 用法: ./pack.sh [源码目录] [输出文件]
set -euo pipefail

SRC="${1:-D:/KFGJ/WorkBuddy/_tmp/yinlu-xuezhang-main}"
OUT="${2:-$(dirname "$0")/yinlu-src.tar.gz}"

[[ -d "$SRC" ]] || { echo "[x] 源码目录不存在: $SRC" >&2; exit 1; }
command -v tar >/dev/null || { echo "[x] 需要 tar" >&2; exit 1; }

echo "[+] 打包 $SRC -> $OUT"
tar -czf "$OUT" \
  --exclude='.venv' \
  --exclude='.git' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='tests' \
  --exclude='docs' \
  --exclude='packaging' \
  --exclude='assets/logo_cube_raw.png' \
  --exclude='assets/school_wordmark_raw.png' \
  --exclude='config.local.json' \
  --exclude='web-sessions' \
  --exclude='web-usage.log' \
  --exclude='web-daily.json' \
  -C "$(dirname "$SRC")" "$(basename "$SRC")"

ls -lh "$OUT"
echo "[+] 内含顶层目录 $(basename "$SRC")/，服务器端用 tar --strip-components=1 解包"
