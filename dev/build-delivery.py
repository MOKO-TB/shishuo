#!/usr/bin/env python3
"""刷新赛事交付物 01（可运行程序包）与 02（完整源码包）。

用法（在仓库任意位置）：
    python -I dev/build-delivery.py                # 重新构建前端并打包
    python -I dev/build-delivery.py --skip-build   # 使用现有 dist 打包

产物写入 06-交付物/：
    师说-可运行程序包-v1.0.0.zip
    师说-完整源码包-v1.0.0.zip
    SHA256SUMS.txt

打包使用 Python zipfile（内部中文名 UTF-8），避免 Windows tar 生成 GBK 文件名。
"""
from __future__ import annotations

import argparse
import hashlib
import os
import random
import re
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "06-交付物"
RUN_NAME = "师说-可运行程序包-v1.0.0"
SRC_NAME = "师说-完整源码包-v1.0.0"
RUN_STAGE = OUT / ".stage-run" / RUN_NAME
SRC_STAGE = OUT / ".stage-src" / SRC_NAME

INTRO_UNTRACKED = [
    "public/intro/assets/feature-campus-804.webp",
    "public/intro/media/shishuo-720.mp4",
    "public/intro/media/shishuo-apple.vtt",
    "public/intro/media/shishuo.vtt",
    "public/intro/download/shishuo-android-0.2.6.apk",
]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8").strip()


def copy(src: Path, dst: Path) -> None:
    if not src.exists():
        print(f"  skip missing {src.relative_to(ROOT)}")
        return
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def pack(folder: Path, arc_root: str, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    count = total = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
        for dirpath, dirnames, filenames in os.walk(folder):
            dirnames.sort()
            for name in sorted(filenames):
                full = Path(dirpath) / name
                rel = full.relative_to(folder).as_posix()
                zf.write(full, f"{arc_root}/{rel}")
                count += 1
                total += full.stat().st_size
    print(f"  {zip_path.name}: {count} files, {total / 1048576:.1f} MB -> {zip_path.stat().st_size / 1048576:.1f} MB")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def stage_run(head: str, auth_secret: str) -> None:
    if RUN_STAGE.exists():
        shutil.rmtree(RUN_STAGE)
    RUN_STAGE.mkdir(parents=True)

    for name in ["dist", "server", "LICENSES", "node_modules"]:
        src = ROOT / name
        if name == "node_modules":
            (RUN_STAGE / name).mkdir()
            for dep in ["nodemailer", "playwright-core"]:
                copy(src / dep, RUN_STAGE / name / dep)
        elif name == "dist":
            copy(src, RUN_STAGE / name)
        else:
            copy(src, RUN_STAGE / name)
    copy(ROOT / "package.json", RUN_STAGE / "package.json")
    copy(ROOT / "README.md", RUN_STAGE / "README.md")

    # 只保留最新一个 Android APK
    apk_dir = RUN_STAGE / "dist" / "intro" / "download"
    if apk_dir.is_dir():
        apks = sorted(apk_dir.glob("shishuo-android-*.apk"))
        for old in apks[:-1]:
            old.unlink()

    env_body = f"""# 师说 · 本地演示配置（赛事评审用）
# 本文件只含演示账号与随机签名密钥，不含任何真实师生数据或 AI Key。
# 正式部署请复制 .env.example 重新配置，并设置 SHISHUO_DEMO_ACCOUNTS=0。

HOST=127.0.0.1
PORT=8787
COOKIE_SECURE=0
NODE_ENV=development

SHISHUO_DB=data/shishuo.db
SHISHUO_UPLOADS_DIR=data/uploads
STORAGE_DRIVER=local

# 演示账号（首次启动自动创建，仅用于本地评审）
SHISHUO_DEMO_ACCOUNTS=1
DEMO_STUDENT_PASSWORD=student123
DEMO_TEACHER_PASSWORD=teacher123
SHISHUO_ADMIN_EMAIL=admin@shishuo.local
SHISHUO_ADMIN_PASSWORD=admin123

# 验证码签名密钥（本演示包内随机生成，生产请替换）
AUTH_SECRET={auth_secret}

# 不配 SMTP 时，验证码打印在服务端日志并显示在登录页（仅开发模式）
SMTP_HOST=
MAIL_FROM="师说 <no-reply@shishuo.local>"
MAIL_DEV_MODE=1

# AI 网关：留空时本地课程检索与教师答疑闭环仍可完整演示；
# 如需体验 AI 作答，在 /admin/「AI 用量」页填写兼容 OpenAI 的 Key/Base URL/模型。
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_API_KEY=
AI_DAILY_LIMIT=120

# 教务代登录仅允许学校教务域名；本地演示保持关闭
JW_ALLOWED_HOSTS=jw.educationgroup.cn
JW_ALLOW_LOCAL=0
"""
    write(RUN_STAGE / ".env", env_body)
    write(RUN_STAGE / ".env.example", env_body.replace(
        f"AUTH_SECRET={auth_secret}", "AUTH_SECRET=").replace(
        "# 本文件只含演示账号与随机签名密钥，不含任何真实师生数据或 AI Key。",
        "# 复制为 .env 后按需修改；.env 不随源码入库，不要提交真实密钥。"))

    write(RUN_STAGE / "启动-师说.bat", """@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 师说 · AI 双通道课后答疑

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [x] 未检测到 Node.js。
  echo     请先安装 Node.js 24 或更高版本：https://nodejs.org/
  echo     安装后重新双击本文件即可。
  echo.
  pause
  exit /b 1
)

if not exist .env if exist .env.example copy /y .env.example .env >nul

echo.
echo [师说] 正在启动本地服务...
echo [师说] 地址：http://127.0.0.1:8787/
echo [师说] 首次启动会自动创建演示账号与空数据库。
echo [师说] 关闭本窗口即停止服务。
echo.
start "" cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:8787/"
node server\\index.mjs
echo.
echo [师说] 服务已停止。
pause
""")

    write(RUN_STAGE / "start.sh", """#!/usr/bin/env sh
# 师说 · 本地启动脚本（macOS / Linux）
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[x] 未检测到 Node.js，请先安装 Node.js 24+：https://nodejs.org/"
  exit 1
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

echo "[师说] 正在启动：http://127.0.0.1:8787/"
echo "[师说] 首次启动会自动创建演示账号与空数据库。按 Ctrl+C 停止。"
exec node server/index.mjs
""")

    write(RUN_STAGE / "Dockerfile", """FROM node:24-bookworm-slim

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0
ENV PORT=8787
ENV COOKIE_SECURE=0

EXPOSE 8787
CMD ["node", "server/index.mjs"]
""")

    write(RUN_STAGE / "docker-compose.yml", """services:
  shishuo:
    build: .
    image: shishuo:evaluation
    ports:
      - "8787:8787"
    environment:
      HOST: 0.0.0.0
      PORT: "8787"
      COOKIE_SECURE: "0"
    volumes:
      - ./data:/app/data
    restart: "no"
""")

    write(RUN_STAGE / "运行说明.md", f"""# 师说 · 可运行程序包（赛事评审版 v1.0.0）

> AI 先答，老师精答，答案留下来。
> 广应科首届 AI 黑客松 · 数字造梦师（软件应用赛道）· 2026-11-22 交付

---

## 一、最快体验方式

**在线部署链接（评审期建议优先使用）：**

- 主站：<http://121.37.30.147/>
- 项目介绍：<http://121.37.30.147/intro/>
- 管理后台：<http://121.37.30.147/admin/>

线上环境已配置 AI 网关与演示课程数据，打开即可完整体验「学生提问 → AI 检索作答 → 转交老师 → 教师回复 → FAQ 沉淀」闭环。

**本地运行包（本压缩包）**用于离线复现与代码核验，不依赖线上服务器。

---

## 二、本地启动

### 环境要求

- Node.js **24 或更高版本**（使用内置 `node:sqlite`，无需安装数据库）
- 无需 `npm install`：运行依赖已随包附带
- 端口默认 `8787`，可在 `.env` 中修改

### Windows

解压后双击 **`启动-师说.bat`**，浏览器会自动打开 <http://127.0.0.1:8787/>。

### macOS / Linux

```bash
cd 解压后的目录
sh start.sh
```

### Docker（可选）

```bash
docker compose up --build
# 打开 http://127.0.0.1:8787/
```

首次启动会在 `data/` 下自动创建 SQLite 数据库、演示账号和上传目录，不包含任何真实师生数据。

---

## 三、演示账号

| 角色 | 邮箱 | 密码 | 说明 |
|---|---|---|---|
| 学生 | `student@shishuo.local` | `student123` | 林晓，含演示课表与成绩 |
| 学生 | `student2@shishuo.local` | `student123` | 周可 |
| 教师 | `teacher@shishuo.local` | `teacher123` | 陈砚（数据结构） |
| 教师 | `teacher.math@shishuo.local` | `teacher123` | 李芸（高等数学） |
| 教师 | `teacher.circuit@shishuo.local` | `teacher123` | 石岩（电路） |
| 教师 | `teacher.analog@shishuo.local` | `teacher123` | 陆衡（模电） |
| 教师 | `teacher.digital@shishuo.local` | `teacher123` | 顾明（数电） |
| 管理员 | `admin@shishuo.local` | `admin123` | 独立管理端 `/admin/` |

登录页支持一键填入学生 / 主教师账号。

---

## 四、AI 能力配置（可选）

本地包默认未内置 API Key，因此：

- 课程知识库检索、置信度判断、FAQ 命中与教师答疑闭环**可直接演示**；
- 需要体验大模型补充作答时，用管理员账号登录 `/admin/` →「AI 用量」，填写任意兼容 OpenAI 的
  `Base URL`、`Model`、`API Key` 即可，无需改代码。

也可以直接编辑 `.env`：

```ini
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...
```

修改后重启服务生效。Key 只保存在服务端数据库或环境变量中，浏览器接触不到。

---

## 五、目录说明

| 路径 | 内容 |
|---|---|
| `dist/` | 已构建的前端产物（主站、`/intro/` 介绍站、`/admin/` 管理端） |
| `server/` | Node 服务端：API、鉴权、SQLite、AI 网关、教务/学习通/图书馆集成 |
| `node_modules/` | 仅含运行时依赖 `nodemailer`、`playwright-core` |
| `data/` | 首次启动自动生成：数据库、上传图片、图书馆会话 |
| `.env` | 本地演示配置（随机签名密钥，无真实数据） |
| `README.md` | 项目完整说明（功能、架构、开发文档） |
| `LICENSES/` | 第三方代码许可 |

---

## 六、常见问题

**端口被占用**
修改 `.env` 中 `PORT=8787` 为其他端口，重启后访问对应地址。

**页面能打开但 AI 不回答**
本地包未配置 Key，属于预期行为：低置信问题会直接转交老师。按第四节配置后即可启用 AI。

**想清空演示数据重新开始**
停止服务，删除 `data/shishuo.db*` 与 `data/uploads/`，重新启动即可。

**注册学生收不到验证码**
演示环境未配 SMTP，验证码会显示在登录页并打印到服务端控制台（`MAIL_DEV_MODE=1`）。
正式部署请配置 `SMTP_HOST` / `MAIL_FROM` 并关闭开发模式。

**Windows 双击后窗口一闪而过**
说明未安装 Node.js 或版本过低（需 24+）。安装后重试；也可在命令行执行 `node -v` 确认版本。

---

## 七、版本与来源

- 程序包版本：`v1.0.0`（2026-11-22）
- 对应源码提交：`{head}`
- 源码仓库：<https://gitee.com/vesper1111/school-hackathon>
- 在线部署：<http://121.37.30.147/>

本程序包不包含：真实师生账号、教务系统 Cookie、生产环境 `.env`、AI 供应商密钥。
""")


def stage_src(head: str, commit_count: int, date_range: str) -> None:
    if SRC_STAGE.exists():
        shutil.rmtree(SRC_STAGE)
    SRC_STAGE.mkdir(parents=True)

    archive = OUT / ".stage-src" / "head.tar"
    subprocess.run(["git", "archive", "--format=tar", head, "-o", str(archive)], cwd=ROOT, check=True)
    with tarfile.open(archive) as tf:
        tf.extractall(SRC_STAGE)
    archive.unlink()

    changed = git("diff", "--name-only", "-z", head).split("\0")
    for rel in filter(None, changed):
        copy(ROOT / rel, SRC_STAGE / rel)
    for rel in INTRO_UNTRACKED:
        copy(ROOT / rel, SRC_STAGE / rel)

    log = git("log", "--reverse", "--pretty=format:%h|%ad|%an|%s", "--date=format:%Y-%m-%d %H:%M")
    rows = [line.split("|", 3) for line in log.splitlines() if line.strip()]
    hist = [
        "# 师说 · Git 提交历史",
        "",
        f"> 共 {len(rows)} 次提交，时间范围 {date_range}（赛事 100 小时创作周期内）。",
        "> 本文件由 `git log` 自动生成，用于核验开发过程与原创性；完整仓库可访问 https://gitee.com/vesper1111/school-hackathon 。",
        "",
        "| # | 提交 | 时间 | 作者 | 说明 |",
        "|---:|---|---|---|---|",
    ]
    for i, (h, d, a, s) in enumerate(rows, 1):
        hist.append(f"| {i} | `{h}` | {d} | {a} | {s.replace('|', chr(92) + '|')} |")
    hist.append("")
    write(SRC_STAGE / "GIT-HISTORY.md", "\n".join(hist))

    write(SRC_STAGE / "源码包说明.md", f"""# 师说 · 完整源码包说明（赛事原创性核查版）

> 广应科首届 AI 黑客松 · 数字造梦师（软件应用赛道）
> 交付日期：2026-11-22 ｜ 源码包版本：v1.0.0

---

## 一、这份源码包对应什么

| 项 | 值 |
|---|---|
| 主仓库 | <https://gitee.com/vesper1111/school-hackathon> |
| 基线提交 | `{head}` |
| 提交总数 | {commit_count} 次，全部落在 {date_range} 的赛事创作周期内（见 `GIT-HISTORY.md`） |
| 说明 | 源码包在基线提交之上，额外纳入了工作区中已上线但尚未提交的「项目介绍站」素材与样式（`public/intro/`），保证与线上展示一致。 |

核心代码全部为本赛事周期内原创开发。第三方开源依赖、字体与素材来源见第四节。

---

## 二、包内目录

| 路径 | 内容 |
|---|---|
| `src/` | React 前端：学生端、教师端、管理端、校园生活、食堂决策、AI 导师、知识库 |
| `server/` | Node 服务端：API、鉴权、SQLite、AI 网关、审计、教务/学习通/图书馆集成 |
| `admin/` | 独立管理端入口页 |
| `public/` | 静态素材：介绍站、食堂图片、校园卡、头像等 |
| `android/` + `android-shell/` | Capacitor Android 壳与原生小组件、通知、课表桥接 |
| `dev/` | 本地开发辅助、评测脚本、构建脚本 |
| `deploy/` | 部署脚本与 nginx 配置（示例地址，不含真实密钥） |
| `docs/` | 管理端、Android、介绍站、校园工具等技术文档 |
| `01-` ~ `05-` | 赛事研究、产品方案、作战计划、技术预研、交付物模板 |
| `prompts/`、`team/` | AI 协作提示词包与团队协作规范 |
| `README.md` | 项目完整说明（功能、架构、接口、数据模型、开发与部署） |
| `HACKATHON.md` | 赛事资料索引与评分口径 |
| `GIT-HISTORY.md` | {commit_count} 次提交的完整时间线（自动生成） |
| `LICENSES/` | 第三方代码许可原文 |

---

## 三、从源码运行

要求 **Node.js 24+**（使用内置 `node:sqlite`）。

```bash
# 1. 安装依赖
npm ci

# 2. 准备配置（默认即可启动演示）
cp .env.example .env          # Windows: Copy-Item .env.example .env

# 3. 开发模式（Vite 5173 + API 8787）
npm run dev

# 或：生产构建后由 Node 单进程托管
npm run build
npm start                     # http://127.0.0.1:8787/
```

- 首次启动自动创建演示账号（学生 / 教师 / 管理员）与空数据库。
- AI 网关需要自行配置兼容 OpenAI 的 `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`；
  未配置时低置信问题直接转交老师，其余闭环不受影响。
- 教务代登录需要 Chromium：`npx playwright-core install --only-shell chromium`；
  已有系统 Chrome / Edge 时会优先使用系统浏览器。

演示账号、邮件配置、AI 配置、目录结构等完整说明见 `README.md` 与 `运行说明.md`（运行包内）。

---

## 四、第三方组件、字体与素材来源

### 4.1 运行时依赖

| 组件 | 版本 | 许可 | 用途 |
|---|---|---|---|
| React / React DOM | 19 | MIT | 前端框架 |
| lucide-react | 1.60 | ISC | 图标 |
| KaTeX | 0.19 | MIT | 数学公式渲染 |
| pdfjs-dist | 4.10 | Apache-2.0 | 浏览器内 PDF 解析 |
| nodemailer | 10.2 | MIT-0 | 邮件验证码 / 提醒 |
| @capacitor/* | 8.6 | MIT | Android 壳与原生能力 |
| @fontsource/noto-serif-sc | 5.3 | OFL-1.1 | 思源宋体（介绍站字体亦为 Noto Serif SC，OFL） |

### 4.2 构建与测试依赖

Vite（MIT）、TypeScript（Apache-2.0）、`@vitejs/plugin-react`（MIT）、Playwright（Apache-2.0）。

### 4.3 引用代码

`LICENSES/yinlu-xuezhang-MIT.txt` 收录了参考项目 **引路学长** 的 MIT 许可原文。
本项目仅在校园知识库数据结构与导入脚本层面参考其公开实现，核心答疑流程、AI 网关、教师闭环、
管理端与 Android 壳均为本项目原创，未直接复用其成型模块。

### 4.4 素材

- 校园卡、校徽、头像等校内素材仅用于赛事演示。
- 食堂菜品图片位于 `public/fandian/`，文件名保留原始菜品 ID，来源于公开档口 / 外卖页面，
  仅用于校内赛事演示，不用于商业分发。
- 项目介绍站的视频与素材随介绍站一并保留在 `public/intro/`；路演 deck 与宣传片工程
  （`deck/`、`promo/`）体积较大，不属于程序源码，未纳入本源码包；演示视频作为独立交付物提交。

### 4.5 生成式 AI 使用说明

开发过程使用 AI 编程助手辅助编码、测试与文档撰写；所有生成内容均经团队成员审阅、
修改与联调，核心产品逻辑与代码在本赛事周期内完成。赛事允许开放使用 AI 工具。

---

## 五、本包不包含什么（隐私与安全）

为避免泄漏真实数据与生产密钥，以下内容**不在源码包内**：

- `data/`：SQLite 数据库、上传图片、图书馆会话（含真实师生数据）
- `.env` / `config.local.json`：生产环境变量与密钥
- `.jw-state.json` / `.jw-profile/`：教务系统真实 Cookie
- `node_modules/`、`dist/`：依赖与构建产物（可按第三节重新生成）
- `deck/`、`promo/`、`代码动画_*`：路演与宣传片大文件

源码包内所有账号、课程、FAQ 均为虚构演示数据。
""")


def update_doc(head: str, commit_count: int, date_range: str, last: str, run_zip: Path, src_zip: Path) -> None:
    """把交付说明里的哈希、基线提交、构建指纹同步到本次产物。"""
    doc = OUT / "交付说明-01与02.md"
    if not doc.exists():
        return
    text = doc.read_text(encoding="utf-8")
    hashes = [sha256(run_zip), sha256(src_zip)]
    lines = text.split("\n")
    idx = [i for i, line in enumerate(lines) if re.fullmatch(r"[0-9a-f]{64}", line.strip())]
    for i, value in zip(idx, hashes):
        lines[i] = value
    text = "\n".join(lines)

    text = re.sub(
        r"\| 基线提交 \| `[0-9a-f]+`（[^）]*） \|",
        f"| 基线提交 | `{head}`（{last}） |",
        text,
    )
    text = re.sub(
        r"\| 提交历史 \| \d+ 次，[^|]*\|",
        f"| 提交历史 | {commit_count} 次，{date_range}，全部在赛事创作周期内，明细见包内 `GIT-HISTORY.md` |",
        text,
    )
    index_html = (ROOT / "dist" / "index.html").read_text(encoding="utf-8")
    assets = re.findall(r'assets/(?:main|styles)-[^"\']+\.(?:js|css)', index_html)
    js = [a for a in assets if a.endswith(".js")]
    css = [a for a in assets if a.endswith(".css")]
    if len(js) >= 2 and css:
        text = re.sub(
            r"（`main-[^`]+` / `styles-[^`]+` /\s*`styles-[^`]+`）",
            f"（`{js[0]}` / `{js[1]}` / `{css[0]}`）",
            text,
        )
    text = re.sub(r"本次交付的 `[0-9a-f]+` 版本", f"本次交付的 `{head}` 版本", text)
    doc.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-build", action="store_true", help="不重新构建前端")
    args = parser.parse_args()

    OUT.mkdir(exist_ok=True)
    head = git("rev-parse", "--short", "HEAD")
    commit_count = int(git("rev-list", "--count", "HEAD"))
    first = git("log", "--reverse", "--pretty=format:%ad", "--date=format:%Y-%m-%d %H:%M").splitlines()[0]
    last = git("log", "-1", "--pretty=format:%ad", "--date=format:%Y-%m-%d %H:%M")
    date_range = f"{first} 至 {last}"
    print(f"[build-delivery] HEAD={head}, commits={commit_count}, range={date_range}")

    if not args.skip_build:
        print("[build-delivery] npm run build ...")
        subprocess.run("npm run build", cwd=ROOT, check=True, shell=True)

    auth_secret = "".join(random.choice("0123456789abcdef") for _ in range(64))
    print("[build-delivery] staging runnable package ...")
    stage_run(head, auth_secret)
    print("[build-delivery] staging source package ...")
    stage_src(head, commit_count, date_range)

    zip_run = OUT / f"{RUN_NAME}.zip"
    zip_src = OUT / f"{SRC_NAME}.zip"
    print("[build-delivery] packing ...")
    pack(RUN_STAGE, RUN_NAME, zip_run)
    pack(SRC_STAGE, SRC_NAME, zip_src)

    lines = [f"{sha256(zip_run)} *{zip_run.name}", f"{sha256(zip_src)} *{zip_src.name}"]
    write(OUT / "SHA256SUMS.txt", "\n".join(lines) + "\n")
    update_doc(head, commit_count, date_range, last, zip_run, zip_src)

    for stage in [OUT / ".stage-run", OUT / ".stage-src"]:
        shutil.rmtree(stage, ignore_errors=True)

    print("[build-delivery] done:")
    for p in [zip_run, zip_src, OUT / "SHA256SUMS.txt"]:
        print(f"  {p.name}: {p.stat().st_size / 1048576:.1f} MB")
    print(f"  基线提交: {head}")


if __name__ == "__main__":
    main()
