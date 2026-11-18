#!/usr/bin/env bash
# ============================================================
# 引路学长 · 校园助手 Web 版 —— Linux 服务器部署脚本（幂等，可重复执行）
#
# 用法（在服务器上，root 执行）:
#   ./deploy.sh /path/to/yinlu-src.tar.gz        # 首次部署 / 升级
#   ./deploy.sh --restart                        # 只重启
#   ./deploy.sh --status                         # 看状态与健康
#
# 约定:
#   APP_DIR=/opt/yinlu       代码与虚拟环境
#   DATA_DIR=/var/lib/yinlu  访客会话留档、用量日志（升级不覆盖）
#   PORT=8480                应用监听端口（仅 127.0.0.1，由 nginx 在 8081 暴露）
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yinlu}"
DATA_DIR="${DATA_DIR:-/var/lib/yinlu}"
PORT="${PORT:-8480}"
SERVICE="yinlu-web"
PY_BIN="${PY_BIN:-python3}"

log()  { printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 执行（sudo -i）"

case "${1:-}" in
  --status)
    systemctl --no-pager --lines=20 status "$SERVICE" || true
    echo "--- 健康检查 ---"
    curl -s -m 5 -o /dev/null -w "首页 HTTP:%{http_code}\n" "http://127.0.0.1:${PORT}/" || true
    curl -s -m 5 -o /dev/null -w "bridge HTTP:%{http_code}\n" "http://127.0.0.1:${PORT}/bridge-web.js" || true
    exit 0 ;;
  --restart)
    systemctl restart "$SERVICE"
    sleep 3
    systemctl --no-pager --lines=15 status "$SERVICE" || true
    exit 0 ;;
  --rollback)
    [[ -d "$APP_DIR/previous" ]] || die "没有可回滚的上一版本（$APP_DIR/previous 不存在）"
    log "回滚到 $(readlink -f "$APP_DIR/previous")"
    ln -sfn "$(readlink -f "$APP_DIR/previous")" "$APP_DIR/current"
    systemctl restart "$SERVICE"
    sleep 3
    curl -s -m 8 -o /dev/null -w "回滚后首页 HTTP:%{http_code}\n" "http://127.0.0.1:${PORT}/"
    log "回滚完成"
    exit 0 ;;
esac

SRC_TAR="${1:-}"
[[ -n "$SRC_TAR" && -f "$SRC_TAR" ]] || die "用法: $0 /path/to/yinlu-src.tar.gz"

# ---------- 1. 系统依赖 ----------
log "检查系统依赖"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    "$PY_BIN" "${PY_BIN}-venv" curl ca-certificates >/dev/null
fi
"$PY_BIN" - <<'EOF' || die "需要 Python 3.10 及以上"
import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)
EOF
log "Python: $("$PY_BIN" -V)"

# ---------- 2. 运行用户 ----------
if ! id yinlu >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin yinlu
  log "已创建系统用户 yinlu"
fi

# ---------- 3. 解包代码（版本目录 + 软链，保留上一版用于回滚） ----------
mkdir -p "$APP_DIR/releases" "$DATA_DIR/web-sessions"
TS="$(date +%Y%m%d%H%M%S)"
if [[ -L "$APP_DIR/current" ]]; then
  ln -sfn "$(readlink -f "$APP_DIR/current")" "$APP_DIR/previous"
  log "已记录上一版本用于回滚：$APP_DIR/previous -> $(readlink -f "$APP_DIR/previous")"
fi
REL_DIR="$APP_DIR/releases/$TS"
mkdir -p "$REL_DIR"
log "解包 $SRC_TAR -> $REL_DIR"
tar -xzf "$SRC_TAR" -C "$REL_DIR" --strip-components=1

# 密钥不进版本目录
rm -f "$REL_DIR/config.local.json"
ln -sfn "$REL_DIR" "$APP_DIR/current"
NEW_DIR="$REL_DIR"
log "当前版本目录: $NEW_DIR"

# 只保留最近 3 个版本，其余清理
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
log "保留的版本: $(ls -1t "$APP_DIR"/releases/ | head -3 | tr '\n' ' ')"

# ---------- 4. 虚拟环境与依赖 ----------
if [[ ! -x "$NEW_DIR/.venv/bin/python" ]]; then
  log "创建虚拟环境"
  "$PY_BIN" -m venv "$NEW_DIR/.venv"
fi
log "安装依赖（web 模式最小集）"
"$NEW_DIR/.venv/bin/pip" install -q --upgrade pip
"$NEW_DIR/.venv/bin/pip" install -q \
  openai httpx prompt_toolkit rich pillow

# ---------- 5. 配置（密钥走 systemd EnvironmentFile，权限 600） ----------
if [[ ! -f "$APP_DIR/config.local.json" ]]; then
  cat > "$APP_DIR/config.local.json" <<'EOF'
{
  "providers": [
    {
      "id": "public",
      "name": "公网大模型",
      "base_url": "https://open.bigmodel.cn/api/paas/v4",
      "api_key": "",
      "model": "glm-4.6"
    }
  ],
  "active_provider": "public"
}
EOF
  warn "已生成 $APP_DIR/config.local.json —— 请填入 api_key（必填，否则 AI 不可用）"
fi
chown root:yinlu "$APP_DIR/config.local.json"
chmod 640 "$APP_DIR/config.local.json"

chown -R yinlu:yinlu "$DATA_DIR" "$NEW_DIR"

# ---------- 6. systemd ----------
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=引路学长 校园助手 Web 版
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=yinlu
Group=yinlu
WorkingDirectory=${APP_DIR}/current
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONIOENCODING=utf-8
# 注意：这里必须走 current 软链，--rollback 才能靠切换软链生效
ExecStart=${APP_DIR}/current/.venv/bin/python web_main.py --host 127.0.0.1 --port ${PORT} --sessions-dir ${DATA_DIR}/web-sessions
Restart=always
RestartSec=3
StandardOutput=append:${DATA_DIR}/server.log
StandardError=append:${DATA_DIR}/server.log

# 基本加固：只读系统、独立 /tmp、禁提权
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=${DATA_DIR} ${NEW_DIR}

[Install]
WantedBy=multi-user.target
EOF

# 日志轮转（避免 server.log 无限增长）
cat > "/etc/logrotate.d/${SERVICE}" <<EOF
${DATA_DIR}/server.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate
}
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null
sleep 3

# ---------- 7. 健康检查 ----------
FAIL=0
curl -s -m 8 -o /dev/null -w "  首页      HTTP:%{http_code}\n" "http://127.0.0.1:${PORT}/" || FAIL=1
curl -s -m 8 -o /dev/null -w "  bridge    HTTP:%{http_code}\n" "http://127.0.0.1:${PORT}/bridge-web.js" || FAIL=1

echo
if [[ $FAIL -eq 0 ]]; then
  log "部署完成。服务仅监听 127.0.0.1:${PORT}，需 nginx 暴露或开放安全组。"
  echo "  状态: systemctl status ${SERVICE}"
  echo "  日志: tail -f ${DATA_DIR}/server.log"
  echo "  回滚: $0 --rollback    （见 README 回滚一节）"
else
  warn "健康检查未通过，查看日志：tail -50 ${DATA_DIR}/server.log"
  systemctl --no-pager --lines=30 status "$SERVICE" || true
  exit 1
fi
