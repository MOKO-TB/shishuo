# 师说项目介绍站（`/intro/`）

面向评委与同学的单页介绍站，暖纸 / 墨绿视觉，与产品界面同一套语言。

| 项 | 值 |
|---|---|
| 线上地址 | `http://121.37.30.147/intro/`（带不带末尾斜杠都能打开） |
| 源码 | `public/intro/`，纯静态 HTML / CSS / JS，不参与 React 打包 |
| 本地预览 | `npm run dev` → `http://localhost:5173/intro/` |
| 生产构建 | `npm run build` → `dist/intro/`，随现有 `dist` 一起部署 |
| 主站入口 | 页内所有「进入师说」都指向同域 `/`，换域名不用改 |

`vite.config.ts` 里有一个仅开发/预览生效的 `introStatic` 插件，把 `/intro` 与 `/intro/`
重写到 `/intro/index.html`；生产环境由 `server/index.mjs` 的静态目录索引直接命中。

## 目录

```
public/intro/
├── index.html
├── intro.css
├── intro.js
├── assets/          # WebP 截图、海报、OG 图、二维码、mark
├── fonts/           # 按页面用字裁剪的 Noto Serif SC（约 78KB/字重）
└── media/           # 720p 宣传片（苹果旗舰版，约 21MB，点击后才加载，字幕已烧录）
```

## 改文案 / 换图

1. 直接改 `index.html`、`intro.css`、`intro.js`。
2. 如果新增了现有字库里没有的汉字，重跑字体子集，否则新字会回落到系统宋体：

   ```bash
   python -I dev/build-intro-fonts.py
   ```

3. 截图、海报、字幕统一从 `promo/` 生成，不手工 PS：

   ```bash
   python -I dev/build-intro-assets.py
   ```

   宣传片重新压缩（网页版 720p，源片为 `promo/师说宣传片_苹果旗舰版_1080p.mp4`）：

   ```bash
   ffmpeg -y -i "promo/师说宣传片_苹果旗舰版_1080p.mp4" \
     -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -vf "scale=1280:720" \
     -c:a aac -b:a 96k -movflags +faststart \
     public/intro/media/shishuo-apple-720.mp4
   ```

> 静态服务对非 `index.html` 资源设置了 1 年 `immutable` 缓存。当前 CSS/JS 带
> `?v=20261122b`；以后改 `intro.css` / `intro.js` 时同步 bump 版本号，否则老访客会继续用
> 旧文件。替换同名图片/视频时同理，改文件名或加 `?v=`。重跑字体子集后，`@font-face` 的
> 字体 URL 也要一起 bump，否则浏览器会继续用旧的子集。

## App 下载上线

`index.html` 里有 **Android / iPhone 两张下载卡**。现在 URL 都是空值，按钮分别显示
「Android 版即将上线」「iPhone 版筹备中」并禁用；填上 URL 后，页面脚本会自动把按钮
换成下载 / 跳转链接。

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

显示型大标题（hero h1、4 个章节 h2、关于页大引文）不写句末逗号/句号，用换行断句；卡片与步骤的小标题（h3）仍保留标点。2026-11-22 起统一。

## 动画清单

按苹果产品页常用的「滚动驱动 + 逐层揭示」思路做的，全部只用 transform / opacity：

| 位置 | 效果 |
|---|---|
| 首屏 | 标题逐行遮罩滑出、鼠标视差与光斑、滚动时背景 / 设备 / 前景三层不同速度（+24 / −44 / −80px）、顶栏下落 |
| 双通道故事 | 左侧步骤滚动 / 右侧画面吸顶，5 张图交叉淡入；步骤文案明暗切换、编号与进度条同步；切换使用 `--spring` 轻微回弹 |
| 章节标题 | 每行文字从遮罩下方滑出，第二、三行依次延迟 |
| 数据带 | 进入视口后 5 / 81 / 157 / 32 从 0 滚到目标值 |
| 能力卡片 | 淡入 + 轻微放缩，按 `--delay` 错开 |
| 微交互 | 主按钮扫光、播放按钮脉冲、顶部阅读进度条、导航当前章节下划线 |
| 兜底 | `prefers-reduced-motion` 下停用位移与数字滚动；无 JS 时 `noscript` 让标题与步骤全部可见 |

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

## 自检脚本

```bash
# 桌面 / 手机截图 + 控制台错误 + 请求失败 + 视频播放 + 字体加载
node dev/check-intro.mjs

# 滚动叙事切换、数字滚动、首屏视差、双平台下载配置、减少动画
node dev/check-intro-anim.mjs

# 1920 / 1024 / 768 三档首屏
node dev/check-intro-widths.mjs

# App 下载按钮激活 + 360 / 320 窄屏横向溢出
node dev/test-intro.mjs
```

截图输出在 `dev/screenshots/intro-*.png`。脚本默认访问 `http://127.0.0.1:8899/intro/`
（`PORT=8899 npm run start` 起生产构建预览）；开发时可以
`INTRO_URL=http://localhost:5173/intro/ node dev/check-intro.mjs` 指向 `npm run dev`。
