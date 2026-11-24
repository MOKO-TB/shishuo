# 师说 · 宣传片

面向「广应科首届黑客松 · 数字造梦师 · 软件应用赛道」的 63 秒产品宣传片。

> 2026-11-22 新增 2 分 30 秒长版（苹果发布会风 + 极简卡点 + 瑞士数据页）：见 [keynote/README.md](keynote/README.md)，成片是 `promo/师说宣传片_长版_1080p.mp4`。
>
> 2026-11-22 新增 5 分 11 秒完整版（女声，补全学生档案/教师知识库/校园工具/平台与信任）：见 [full/README.md](full/README.md)，成片是 `promo/师说宣传片_完整版_1080p.mp4`。所有界面画面均来自本项目实际运行的演示账号，旁白与音乐为本地生成，无外部版权素材。
>
> 2026-11-23 更新 3 分 51 秒苹果旗舰版：删去「古代文学 / 刑法学」示例导师，新增约 4 秒「书灵助教」虚拟人展示，并把学生端、导师抽屉、教师端、食堂、手机端截图换成新版；见 [apple-keynote/README.md](apple-keynote/README.md)。

## 成片

| 文件 | 说明 |
|---|---|
| `师说宣传片_1080p.mp4` | 主成片，1920×1080 / 30fps / H.264 + AAC，约 20MB |
| `师说宣传片_720p.mp4` | 轻量分享版，1280×720，约 5.6MB |
| `师说宣传片_封面.png` | 结尾品牌页，可直接用作封面 |
| `师说宣传片_字幕.srt` | 16 条中文字幕，与旁白逐句对齐 |

时长 63.52 秒，画幅 16:9。旁白：edge-tts `zh-CN-XiaoxiaoNeural`，语速 +8%；音乐：本地程序化合成，无版权风险。

## 结构

| 时间 | 场景 | 旁白 |
|---|---|---|
| 0–12.3s | 下课之后：三个没有被回答的问题 | 下课铃响，问题才刚开始。问同学，没人回。搜网页，不敢信。等老师，又怕打扰。 |
| 11.7–17.4s | 品牌揭示：师说 | 师说，让 AI 和老师，接力回答每一个课后问题。 |
| 16.9–27.1s | 学生提问：AI 查课程知识库、带出处与置信度、没把握就转交 | 学生提问，AI 先查课程知识库。有依据才回答，标出来源和置信度；没把握，就老实说不知道。 |
| 26.6–41.1s | 老师接手：同题合并、AI 草稿、一次回复整组、沉淀 FAQ | 拿不准的，自动转给任课老师。同题合并，AI 备好上下文和回复草稿；老师一次回复整组，答案沉淀成 FAQ。下一次，AI 直接命中。 |
| 40.6–52.0s | 不止课堂：课程知识库 / 引路学长 / AI 导师 / 手机端 | 五门课程，八十一条精修 FAQ，一百五十七道检索评测全部通过。还有校园知识库、AI 导师和手机端。 |
| 51.5–63.5s | 收尾：老师写下的每一句话，都成为 AI 的第一反应 | 老师写下的每一句话，都成为 AI 的第一反应。师说，让每个课后问题，都有回响。 |

## 数据口径

- **5 门试点课程**：高等数学、数据结构、电路、模电、数电。
- **81 条课程 FAQ**：仓库内 5 门试点课的种子内容（当前演示工作区可能只载入了其中一部分）。
- **157 / 157 检索评测**：`npm run eval:retrieval` 实测全部通过。
- **75 条校园经验卡**：当前校园知识库数据（README 早期版本写 73 条，以运行数据为准）。
- **32 位 AI 导师**：导师库总数，5 位试点导师默认展示，其余可在「管理导师」中添加。
- 演示界面里的「AI 未配置」状态、空课表、`0%` 日统计等本地演示态在截图中已隐藏；生产环境已配置服务端 AI 网关。
- 片尾二维码解析为 `http://121.37.30.147`，已用 OpenCV 在成片帧上验证可读。

## 重新生成

依赖：Node 24、Python 3.12、ffmpeg、Microsoft Edge、`edge-tts`、`numpy`、`qrcode`、`Pillow`。

```bash
# 1. 启动师说开发环境（API 8787 + Vite）
npm run dev

# 2. 抓取界面素材（脚本默认 Vite 在 5200 端口，按需修改 BASE）
node promo/capture.mjs

# 3. 生成旁白与时间轴（幂等；会重新合成每句配音）
python promo/build_vo.py

# 4. 生成背景音乐（读取 timeline.json）
python promo/build_music.py

# 5. 混音
ffmpeg -y -i promo/audio/vo_master.wav -i promo/audio/music.wav \
  -filter_complex "[1:a]volume=1.5,atrim=0:63.52[m];[0:a]aformat=channel_layouts=stereo[v];[v][m]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9" \
  -ar 48000 -ac 2 promo/audio/final_audio.wav

# 6. 启动静态服务并逐帧渲染
python -m http.server 5300 --bind 127.0.0.1
node promo/render.mjs

# 7. 编码
ffmpeg -y -framerate 30 -i promo/frames/f_%05d.jpg -i promo/audio/final_audio.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -level 4.1 \
  -c:a aac -b:a 192k -ar 48000 -t 63.52 -movflags +faststart -shortest \
  "promo/师说宣传片_1080p.mp4"
```

`timeline.json` 是唯一时间基准：配音、字幕、音乐和画面都从它读取。重新生成配音后，时长可能略有变化，画面会自动适配。

## 文件说明

| 文件 | 用途 |
|---|---|
| `film.html` | 1920×1080 逐帧动画页面，六个场景 + 纸质翻页转场 + 烧录字幕 |
| `render.mjs` | Playwright 逐帧渲染（30fps，JPEG 95） |
| `capture.mjs` | 登录演示账号抓取学生端 / 教师端 / 校园 / AI 导师 / 管理端截图 |
| `build_vo.py` | edge-tts 旁白、词级时间点、`timeline.json` |
| `build_music.py` | 程序化配乐 + 转场音效 + 人声闪避 |
| `build_srt.py` | 由时间轴生成 SRT |
| `assets/` | 成片使用的界面截图与二维码 |
| `fonts/` | Noto Serif SC 中文子集（来自项目内 `@fontsource/noto-serif-sc`） |
| `audio/` | 旁白分句、配乐、混音母版 |

`frames/`、`preview/`、`qc/` 为可再生的中间产物，已清理，不参与版本管理。
