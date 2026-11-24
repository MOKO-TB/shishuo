# 师说项目介绍站（`/intro/`）

面向评委与同学的单页介绍站，暖纸 / 墨绿视觉，与产品界面同一套语言。

| 项 | 值 |
|---|---|
| 线上地址 | `http://121.37.30.147/intro/`（带不带末尾斜杠都能打开） |
| 源码 | `public/intro/`，纯静态 HTML / CSS / JS，不参与 React 打包 |
| 本地预览 | `npm run dev` → `http://localhost:5173/intro/` |
| 生产构建 | `npm run build` → `dist/intro/`，随现有 `dist` 一起部署 |
| 主站入口 | 页内所有「进入师说」都指向同域 `/`，换域名不用改 |
| 路演稿 | `docs/roadshow-speech.md`（按当前 11 章顺序，约 7 分钟，含 30 秒电梯版与 Q&A） |

`vite.config.ts` 里有一个仅开发/预览生效的 `introStatic` 插件，把 `/intro` 与 `/intro/`
重写到 `/intro/index.html`；生产环境由 `server/index.mjs` 的静态目录索引直接命中。

## 目录

```
public/intro/
├── index.html
├── intro.css
├── intro.js
├── assets/          # WebP 截图、海报、OG 图、二维码（主站 + 介绍站）、mark
├── fonts/           # 按页面用字裁剪的 Noto Serif SC（约 127KB/字重）
└── media/           # 720p 宣传片（苹果旗舰版，约 21MB，点击后才加载，字幕已烧录）
```

## 改文案 / 换图

1. 直接改 `index.html`、`intro.css`、`intro.js`。
2. 如果新增了现有字库里没有的汉字，重跑字体子集，否则新字会回落到系统宋体：

   ```bash
   python -I dev/build-intro-fonts.py
   ```

3. 界面截图从当前 App 重新采集（先起 `npm run dev`，默认 `localhost:5173`）：

   ```bash
   node dev/capture-intro-current.mjs
   python -I dev/build-intro-assets.py
   ```

   `capture-intro-current.mjs` 会登录学生 / 教师演示账号，切到「数据结构」，隐藏测试提问和书灵浮窗，输出到 `promo/assets/`；旧素材备份在 `promo/assets-backup-20261123/`。海报、二维码、字幕仍从 `promo/` 生成。

   宣传片重新压缩（网页版 720p，源片为 `promo/师说宣传片_苹果旗舰版_1080p.mp4`）：

   ```bash
   ffmpeg -y -i "promo/师说宣传片_苹果旗舰版_1080p.mp4" \
     -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -vf "scale=1280:720" \
     -c:a aac -b:a 96k -movflags +faststart \
     public/intro/media/shishuo-apple-720.mp4
   ```

> 静态服务对非 `index.html` 资源设置了 1 年 `immutable` 缓存。当前 CSS/JS 带
> `?v=20261123d`；以后改 `intro.css` / `intro.js` 时同步 bump 版本号，否则老访客会继续用
> 旧文件。替换同名图片/视频时同理，改文件名或加 `?v=`。重跑字体子集后，`@font-face` 的
> 字体 URL 也要一起 bump，否则浏览器会继续用旧的子集。

## App 下载上线

`index.html` 里有 **Android / iPhone 两张下载卡**。当前 Android 已填 `v0.2.6` 直链
（`/intro/download/shishuo-android-0.2.6.apk`），显示「可下载」；iPhone 仍为占位，显示
「iPhone 版筹备中」。填上 URL 后，页面脚本会自动把按钮换成下载 / 跳转链接。

Android（APK 直接下载）：

```html
<div
  class="download-card"
  id="download-card"
  data-download-card
  data-download-url="/downloads/shishuo-1.0.0.apk"
  data-download-version="1.0.0"
  data-download-size="18 MB"
  data-download-kind="APK"
  data-download-label="下载 Android 版"
  data-download-direct="true"
>
```

iPhone（App Store 跳转）：

```html
<div
  class="download-card card-ios"
  id="download-card-ios"
  data-download-card
  data-download-url="https://apps.apple.com/app/id0000000000"
  data-download-version="1.0.0"
  data-download-kind="App Store"
  data-download-label="前往 App Store"
  data-download-empty-badge="计划中"
  data-download-ready-badge="已上架"
  data-download-newtab="true"
>
```

生效后：徽标变「可下载 / 已上架」，副标题变 `APK · v1.0.0 · 18 MB` 或 `App Store · v1.0.0`，
按钮变「下载 Android 版」或「前往 App Store」。`data-download-direct="true"` 会加 `download`
属性；App Store 卡用 `data-download-newtab="true"` 新窗口打开。

APK 放置方式：

- 同域：放 `public/downloads/`（构建后进 `dist/downloads/`），URL 写 `/downloads/shishuo-1.0.0.apk`；
- 对象存储：直接写完整 `https://` 地址，注意跨域时 `download` 属性可能被浏览器忽略。

## 手机端 · Android 原生能力

`#app` 下半部分的 `.native` 区块，用纯 HTML/CSS 画了四张原生能力示意，不依赖额外截图：

| 卡片 | 页面上的说法 | 对应实现 |
|---|---|---|
| 今日课表 | 4×2 桌面小组件，「上课中」高亮，下课后自动翻到明日 | `ScheduleWidgetProvider` / `ScheduleWidgetService` |
| 系统通知 | App 退到后台仍能收到老师回复与解决提醒 | `NotificationPollWorker` / `NotificationPollScheduler`（15 分钟轮询） |
| 学习通 | 一键打开学习通 App；反向从学习通分享图片/文字进提问框 | `ChaoxingAppPlugin` / manifest 的 SEND intent |
| 快捷方式 | 拍题提问 / 我的课表 / 学习通 / 今天吃什么 | `res/xml/shortcuts.xml` |

改文案不用动图片；示例课程、时间、通知内容直接改 `index.html` 里的 `.widget-demo` / `.notify-demo`。
四张卡在 720px 以下变单列，示例数据在第一张卡里，过窄时注意 `上课中` 三个字不要把时间列撑开。

## 文案风格

显示型大标题（hero h1、各章节 h2、关于页大引文）不写句末逗号/句号，用换行断句；卡片与步骤的小标题（h3）仍保留标点。2026-11-22 起统一。

## 动画清单

按苹果产品页常用的「滚动驱动 + 逐层揭示」思路做的，全部只用 transform / opacity：

| 位置 | 效果 |
|---|---|
| 首屏 | 标题逐行遮罩滑出、鼠标视差与光斑、滚动时背景 / 设备 / 前景三层不同速度（+24 / −44 / −80px）、顶栏下落 |
| 双通道故事 | 左侧步骤滚动 / 右侧画面吸顶，5 张图交叉淡入；步骤文案明暗切换、编号与进度条同步；切换使用 `--spring` 轻微回弹 |
| 章节标题 | 每行文字从遮罩下方滑出，第二、三行依次延迟 |
| 数据带 | 进入视口后 5 / 81 / 157 / 33 从 0 滚到目标值 |
| 能力卡片 | 淡入 + 轻微放缩，按 `--delay` 错开 |
| 手机端 | 手机轻微浮动、下载卡悬停抬升；`prefers-reduced-motion` 下停用浮动 |
| 微交互 | 主按钮扫光、播放按钮脉冲、顶部阅读进度条、导航当前章节下划线 |
| 兜底 | `prefers-reduced-motion` 下停用位移与数字滚动；无 JS 时 `noscript` 让标题与步骤全部可见 |

## 交互功能

| 位置 | 交互 |
|---|---|
| 首屏 | 学生端 / 教师端切换（`data-device-tab`），同步切换截图、设备标题与两张浮卡文案；右上角放大按钮打开当前界面大图（`#shot-lightbox`，Esc / 点击背景关闭） |
| 能力区 · 自己试一次 | `#try` 课程问答演示：5 门课 × 2 个真实 FAQ 示例，AI 打字机 → 让老师补充 → 沉淀成 FAQ；新增「复制回答」，复制问题、完整回答、老师补充与出处；数据在 `intro.js` 的 `demoData` |
| 常见问题 | `#faq` 手风琴，一次只展开一条；新增关键词搜索与主题筛选（全部 / AI 边界 / 老师接手 / 匿名与图片 / 手机 App），单选结果自动展开，无结果有空态 |
| 调研 | 4 张关键摘录；「查看完整 10 题报告」展开后是 10 题轮播：左侧题号、上一题 / 下一题、单选 / 多选标签、条形图 / 环形图 / 长选项 note 卡；点击任一选项会标记「你选了…」并显示同选比例；数据在 `intro.js` 的 `reportData` |
| 团队 | 4 条分工 + 指导教师卡（原周节奏 / 发布说明区块已按用户要求删除） |
| 版本 | 10 条版本时间线，可按「全部 / 已上线 / 下一步」筛选；右侧进度卡显示 7 / 10 已上线、最近一次、下一步 v1.0 与迭代节奏 |
| 手机端（第 08 章，版本前） | 先看功能摘要与 Android 原生能力，最后才是下载安装包；下载区带「安装包在最后 ↓」锚点；主站二维码可放大、复制链接；下载卡悬停抬升 |
| 全局 | 章节吸附（`scroll-snap-type: y proximity`）+ 底部翻页器，11 章：首屏 / 调研 / 双通道 / 数据 / 能力 / 宣传片 / 团队 / 手机端 / 版本 / 常见问题 / 关于；上一章 / 下一章、圆点跳转、PageUp / PageDown；`prefers-reduced-motion` 关闭吸附 |

维护注意：

- 演示数据在 `intro.js` 的 `demoData`，课程按钮在 `index.html` 的 `data-demo-course`；增删课程时两处一起改。
- 问卷报告数据在 `intro.js` 的 `reportData`：每题有 `no / short / multi / chart / question / options / insight`，`chart` 支持 `bars`、`donut`、`note`；改百分比只改这里。第 4、7 题的长选项在手机端报告里被折叠，页面用 note 卡标注可读部分，不补造百分比。
- 版本筛选依赖 `.roadmap-item` 上的 `is-done` / `is-next`；新增版本时同时改筛选按钮上的计数和右侧进度卡。
- 目前有两个二维码：`assets/qr.png` 指向主站 `/`，`assets/qr-intro.png` 指向 `/intro/`；关于区用的是后者，改地址或换样式时重新生成并 bump 版本。
- FAQ 的手风琴逻辑只依赖 `.faq-item` / `.faq-q` / `.faq-a` 结构；搜索读取整条文本，主题筛选依赖 `data-faq-tags`，新增条目时同步标签与主题按钮计数。
- 复制链接在生产复制当前页地址；在 localhost 复制 `http://121.37.30.147/intro/` 方便分享。
- 章节由 `[data-deck-label]` 自动收集，底部圆点 / 总数自动生成；新增或删除章节时加/去这个属性即可。长章节（调研、故事、能力演示、团队、版本、App）内部仍可正常滚动，吸附只发生在章节边界，不会把长内容卡住。

## 滚动叙事怎么维护

故事区是「左侧步骤滚动、右侧画面吸顶切换」：

- HTML 里 `.story-step` 有 5 条，顺序对应 `.story-frame` 的 5 张图；
- `intro.js` 里的 `storyCaptions` 数组要和这 5 条一一对应；
- 每张图切换时，`.story-no`、`.story-caption`、`.story-rail` 会一起更新。

新增或删减步骤时，这三处要一起改，否则画面和文案会错位。

所有动画都走 transform / opacity，且 `prefers-reduced-motion: reduce` 下会停用滚动差、
逐行揭示和数字滚动；`.line > span`、`.reveal` 都有无 JS 兜底。

## 部署

沿用师说现有流程：`npm run build` → 同步 `dist/` 到 `/opt/shishuo`。

本次改动里 `server/index.mjs` 增加了 `.mp4 / .webm / .vtt` 的 MIME 与 VTT 的 gzip 支持，
**需要重启 Node 服务**，否则视频可能被当成二进制下载、字幕类型不正确。

2026-11-22 交互 / 章节吸附版已上线：只覆盖 `index.html`、`intro.css`、`intro.js`、`fonts/*.woff2`
（`?v=20261122g`），`public/intro` 与 `dist/intro` 同步，**未重启 Node**；备份在
`/opt/shishuo/backups/intro-before-deck-20261122`。

2026-11-23 调研 / 团队 / 版本版已上线：新增 `#research`（4 张关键摘录 + 10 题报告）、`#team`
（分工 + 周节奏）、`#roadmap`（10 条版本 + 筛选 + 进度卡），翻页器扩到 11 章；覆盖
`index.html`、`intro.css`、`intro.js`、两个字体（`?v=20261123a`），`public/intro` 与
`dist/intro` 同步，**未重启 Node**；备份在 `/opt/shishuo/backups/intro-before-research-20261123`。
生产验证：`/intro/` 200（59,825B，含 research / team / roadmap / report 标记）、CSS 95,122B、
JS 45,557B、字体 129,816B / 131,792B，视频 Range 206，`/`、`/admin/`、`/api/health` 均 200，
`shishuo` 服务 active。

2026-11-23 第二轮交互版已上线：FAQ 搜索/主题筛选、调研报告点选反馈、首屏界面放大预览、
课程演示复制回答；五文件升到 `?v=20261123b`，`public/intro` 与 `dist/intro` 同步，**未重启 Node**；
备份在 `/opt/shishuo/backups/intro-before-interactions-20261123`。生产验证：`/intro/` 200（62,819B，
含 faq-search / report-selection / device-zoom / demo-copy 标记）、CSS 100,242B、JS 52,366B、字体
130,316B / 132,192B、视频 Range 206，`/`、`/admin/`、`/api/health` 均 200，`shishuo` 服务 active。

2026-11-23 第四轮（手机端位置 / 功能顺序 / 团队精简 / 介绍站二维码）：手机端从最后一章移到「版本」前（第 08 章），恢复浅色正常段落；手机端内容改为先功能（功能摘要 + Android 原生能力），最后才是下载安装包；团队区删掉周节奏与发布说明；关于区增加指向介绍站本身的二维码（`assets/qr-intro.png`）。章节编号改为 00 调研 / 01 双通道 / 02 能力 / 03 宣传片 / 04 团队 / 05 手机端 / 06 版本 / 07 常见问题 / 08 关于；CSS / JS / 二维码升到 `?v=20261123d`。
已上线：`index.html` / `intro.css` / `intro.js` + `assets/qr-intro.png`，`public/intro` 与 `dist/intro` 同步，**未重启 Node**；备份 `/opt/shishuo/backups/intro-before-app-qr-20261123`。生产 `/intro/` 200（63,356B，团队 → 手机端 → 版本 → FAQ → 关于 顺序；手机端先功能后下载；团队 flow 已无）、CSS 102,616B、JS 52,366B、介绍站二维码 14,431B 且解码为 `http://121.37.30.147/intro/`、当前 App 图片仍走 `?v=20261123c`、字体/视频 Range/`/` `/admin/` `/api/health` 均正常、服务 active。

2026-11-23 第五轮（版本时间线去日期）：删掉 `.roadmap-date` 里所有 `2026.xx.xx` 日期，只保留版本号；「下一步 / 规划 / 远期」标签保留；右侧进度卡的「最近一次」也去掉日期，只留「介绍站 2.0」。只覆盖 `index.html`，未重启 Node；备份 `/opt/shishuo/backups/intro-before-remove-dates-20261123`。生产 `/intro/` 200（63,034B，页面内无 `2026.xx.xx`），CSS 102,616B、二维码 14,431B、`/` `/admin/` `/api/health` 200、服务 active。

## 自检脚本

```bash
# 桌面 / 手机截图 + 控制台错误 + 请求失败 + 视频播放 + 字体加载
node dev/check-intro.mjs

# 滚动叙事切换、数字滚动、首屏视差、双平台下载配置、减少动画
node dev/check-intro-anim.mjs

# 学生/教师切换、课程演示、FAQ 手风琴、复制链接、二维码、移动端
node dev/check-intro-interactive.mjs

# 章节吸附、底部翻页器、圆点/箭头、PageUp/PageDown、减少动画关闭吸附
node dev/check-intro-deck.mjs

# 调研 10 题报告（展开/题号/上一题/下一题/环形图）、团队分工、版本筛选与进度卡、手机端
node dev/check-intro-project.mjs

# FAQ 搜索/主题筛选、报告点选、首屏界面放大、课程演示复制回答、手机端
node dev/check-intro-extras.mjs

# 1920 / 1024 / 768 三档首屏
node dev/check-intro-widths.mjs

# App 下载按钮激活 + 360 / 320 窄屏横向溢出
node dev/test-intro.mjs
```

截图输出在 `dev/screenshots/intro-*.png`。脚本默认访问 `http://127.0.0.1:8899/intro/`
（`PORT=8899 npm run start` 起生产构建预览）；开发时可以
`INTRO_URL=http://localhost:5173/intro/ node dev/check-intro.mjs` 指向 `npm run dev`。
