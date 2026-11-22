# 师说 Android App（Capacitor 壳）

> 状态：阶段 1 + 原生相册权限已完成（2026-11-22）。已产出 8.4MB 的 debug APK，并在 Android 15（API 35）模拟器完成登录、会话保持、系统相册授权/拒绝、沉浸式系统栏、返回键、导出下载和外链验收。
> **重要：App 远程加载生产网页。** 本次前端已部署到 `121.37.30.147`（只含本次改动，未带另一条 UI 任务线），App 内的透明系统栏、隐私授权、相册权限、下载/外链/返回键均已生效。

## 一、方案

```
android/                     Capacitor 8 原生工程（JDK 21 + AGP 8.13）
android/.../PhotoAccessPlugin.java  系统相册权限 + 全库选图
android-shell/               APK 内置的断网兜底页（仅 4KB）
assets/                      图标/启动图源文件（1024 / 2732）
dev/android-assets/          用 Edge 无头渲染 SVG 的源 HTML 与 PNG
dev/builds/                  本地 APK 产物（已加入 .gitignore）
src/lib/nativeShell.ts       系统栏 / 外链 / 下载分享的原生桥
src/lib/photoAccess.ts       相册权限与选图的 JS 桥
src/lib/attachmentConsent.ts 附件授权偏好
src/components/PhotoAccess.tsx  权限被拒后的「去授权」弹窗
src/components/AttachmentConsent.tsx  全局附件授权弹窗
src/lib/overlayStack.ts      返回键逐层关闭弹窗
capacitor.config.ts          壳工程配置
```

关键取舍：

- **远程加载而非打包 dist**：`server.url = http://121.37.30.147`，网页与 App 同源，HttpOnly Cookie、localStorage 原样可用，前端发版后 App 无需重新发版。代价是必须联网。
- 远程加载失败时通过 `server.errorPath = index.html` 落到 `android-shell/` 的品牌兜底页（已用不可达地址实测），不会停在 WebView 的系统错误页。
- `webDir` 指向 `android-shell/`，而不是 `dist/`。`dist/` 含 150MB 食堂图片，打包进去 APK 会到 172MB；现在 APK 约 **8.4MB**（含 browser / filesystem / share 三个原生插件）。
- **沉浸式系统栏**：MainActivity 自己 `setDecorFitsSystemWindows(false)` 并把 `--safe-area-inset-*` 注入网页，不依赖 Capacitor 对 WebView 140+ 的版本判断（模拟器 WebView 124 也验证通过）。
- **新旧页面兼容**：原生会检测网页 viewport 是否带 `viewport-fit=cover`。新版网页自己消费安全区，旧版线上网页自动回退成原生 padding，避免滚动期间内容钻到状态栏下面。
- **附件授权**：文件选择器本身是系统级“只能访问你选中的照片”；App 再加一层发送前确认，明确“仅本次选中内容”、可见对象、原文件是否上传、管理员审核。
- 启动图：Android 12+ 的系统闪屏会把图标裁成圆形，单独做了 `drawable-nodpi/splash_icon.png`（圆形深底 + 气泡），避免金点被裁掉。

## 二、附件隐私授权

| 场景 | 入口 | 授权文案要点 |
|---|---|---|
| 学生提问 | 图片 / 文件 / 粘贴 / 拖拽 | 仅本次选中内容；图片可切换“允许任课老师查看原图”；文档只在本机解析，原文件不上传 |
| 教师 FAQ | 添加图片 / 文件 / 拖拽 / 粘贴 | 附件会保存到课程 FAQ，本课程学生可查看和下载；正文会被 AI 引用 |
| 教师回复 | 附图 | 只随本次回复发给已勾选学生，发送后不能单张撤回 |

- 默认每次询问；勾选“记住我的选择”后本机不再询问，同时记住上次的“是否允许老师看原图”。
- 账号页新增「隐私与附件」：可重新打开上传前确认，并说明师说无法读取整个相册/文件夹。
- 授权偏好存在 `localStorage['shishuo.attachment.consent.v1']`，只存本机，不随账号同步。
- 修复了备份恢复丢失 `teacherVisible` 的问题：仅 AI 可见的图片恢复后不会变成老师可见；学生文档摘要也不再因为缺少 URL 被丢弃。

## 三、沉浸式与系统栏

- 状态栏、手势条透明，页面底色和顶部 hero/顶栏直接铺到系统栏后面。
- 状态栏图标跟随页面：登录页深色 hero 用浅色图标；滚到表单区用主题色；登录后浅色主题用深色图标、深色主题用浅色图标。
- 底栏、Toast、弹窗、抽屉、全屏查看层都补了安全区；移动端悬浮底栏去掉了重复的 `safe-area` 计算。
- 管理台（/admin/）同样带 `viewport-fit=cover`，顶栏和登录页补了安全区。

## 四、原生能力

| 能力 | 实现 | 验收 |
|---|---|---|
| 导出下载 | Blob 写入缓存 → 系统分享/保存面板 | 导出问答档案 CSV，弹出系统分享（Quick Share / Gmail / Drive） |
| 外链 | `target=_blank` / 跨域链接交给 Custom Tab | 校园“原文”链接打开 Chrome |
| 返回键 | 网页 overlay 栈逐层关闭；关上后回首页；最后才退出 | 授权弹窗上按返回只关闭弹窗，App 不退 |
| 系统栏 | `SystemBars.setStyle` + 主题 MutationObserver | 浅色/深色切换，状态栏图标自动反转 |
| 断网 | `server.errorPath` 品牌兜底页 | 不可达地址实测通过 |

语音识别未实现（按产品决定不做）。

## 五、构建

前置：JDK 21、Android SDK Platform 36、Build-Tools 36.0.0。

```bash
npm run build             # 先构建网页 dist（部署时同样用这份）
npm run android:sync      # 同步 capacitor 配置、插件与 android-shell
npm run android:build     # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

本机 Gradle wrapper 已指向腾讯云镜像（`android/gradle/wrapper/gradle-wrapper.properties`），官方源在国内过慢。换机器构建时如果镜像不可用，把 `distributionUrl` 改回 `https://services.gradle.org/distributions/gradle-8.14.3-bin.zip` 即可。

### 本地联调

不想部署生产时，可在本机起同源服务（静态 dist + API）：

```bash
npm run build
PORT=5180 HOST=0.0.0.0 node server/index.mjs
# 另开一个终端：
SHISHUO_APP_URL=http://<电脑局域网IP>:5180 npm run android:sync
npm run android:build
```

手机与电脑需在同一局域网；模拟器里用 `http://10.0.2.2:5180`。默认（不设环境变量）指向生产 `http://121.37.30.147`。

## 六、安装

```bash
adb install -r dev/builds/shishuo-0.2.6-release.apk
```

或把 APK 发到手机，允许“安装未知来源应用”后直接安装。当前是 **Release 签名**（`android/shishuo-release.jks`），可用于内测分发，但不能直接上架。

介绍站已提供同域直接下载：<http://121.37.30.147/intro/download/shishuo-android-0.2.6.apk>（1.4MB，文件名 `shishuo-android-0.2.6.apk`）。打开 <http://121.37.30.147/intro/> 的「手机端」章节，点「下载 Android 安装包」即可；下载完成后按系统提示安装。微信内置浏览器会拦截 APK，请用系统浏览器打开。

## 七、已验证（Android 15 / API 35，1080×2400，WebView 124）

| 项目 | 结果 |
|---|---|
| 冷启动闪屏、桌面圆形自适应图标 | 通过 |
| 生产/本地登录页渲染、演示学生登录 | 通过 |
| 学生主页、校园页、底部页签切换 | 通过 |
| 杀进程重开仍保持登录（Cookie + rememberToken） | 通过 |
| 图片选择器（系统 Photo Picker，只交出选中项） | 通过 |
| 图片授权弹窗 + 老师可见开关 + 记住选择 | 通过 |
| 文件授权弹窗 + 本地解析预览 | 通过 |
| 账号「隐私与附件」开关联动 | 通过 |
| 返回键逐层关闭弹窗 | 通过 |
| 导出 CSV → 系统分享面板 | 通过 |
| 外链 → 系统 Chrome | 通过 |
| 深浅主题系统栏图标反转 | 通过 |
| 沉浸式安全区（顶部 24dp / 底部 24dp 注入） | 通过 |
| 旧版线上页面自动回退原生留白 | 通过 |
| 断网兜底页 | 通过 |
| 系统相册权限弹窗（允许全部 / 有限 / 拒绝） | 通过 |
| 允许后打开系统相册全库选图、原生压缩回传 | 通过 |
| 拒绝后「照片权限未开启」→ 系统设置授权 | 通过 |
| 「改用系统选择器」→ Photo Picker 选图 → 预览 | 通过 |
| 生产环境（121.37.30.147）授权 → 选图 → 上传 | 通过 |
| 深浅色跟随系统（切系统深色后 Activity 重建） | 通过 |
| 通知权限首次同步时申请、频道 `shishuo-alerts` 创建 | 通过 |
| 平板/横屏课程表独立页与短屏紧凑行高 | 通过（生产 CSS 已确认） |
| 学习通链接优先唤起 `com.chaoxing.mobile` | 需真机装学习通验证 |
| 后台 15 分钟轮询 + 系统通知 | 需真机验证 |

## 八、原生相册权限（2026-11-22 补充）

- 学生点“图片”先申请系统权限：Android 13+ `READ_MEDIA_IMAGES`，Android 12 及以下 `READ_EXTERNAL_STORAGE`。
- 权限弹窗由 Android 系统提供：“允许全部 / 允许有限访问 / 拒绝”（不同 ROM 文案略有差异）。
- 允许后打开系统相册全库选图；原生 `PhotoAccessPlugin` 把图片压到最长边 1600px 的 JPEG 再回传，避免大图卡住 WebView。
- 拒绝后显示「照片权限未开启」：可跳系统设置授权、回来重新检查，或改用系统选择器（Photo Picker）只发本次选中的照片。
- 文件不走这个权限：继续用系统文件选择器（SAF）逐次授权；安卓没有普通应用的“访问全部文件”权限（`MANAGE_EXTERNAL_STORAGE` 需要特殊审核，未申请）。
- 三处入口都已接入：学生提问、教师 FAQ 附件、教师回复附图。
- Web 端仍保留原来的“发送前确认”弹窗；原生照片授权由系统弹窗承担，避免双重询问。

### 图标与启动修复（2026-11-22 补充）

- 自适应图标前景按 108dp 规格生成（xxxhdpi 432px），传统图标各密度 4×；解决桌面图标被放大后发糊。
- MainActivity 默认 edge-to-edge，并在 `onCreate` 里 `SplashScreen.installSplashScreen`，避免启动时 WebView 先 pad 再切 edge-to-edge 的二次 resize 留下旧页面/黑条。
- 说明：P1/P2 那种“顶部多标签/多 logo”的截图在安装版 App 内未能复现；P2 更像浏览器多标签栏/系统多任务界面。若安装新版后仍出现，需要一张 App 完全加载后的截图再定位。

### 课程表、学习通、主题、提示与通知（2026-11-22 补充）

**1. 平板/横屏课程表**
- 侧栏的“查看 / 添加”和小课程块改为直接打开独立的课程表页，不再先跳账号设置里的窄栏。
- 周网格列宽、行高、间距统一走 CSS 变量，支持双指缩放与按钮缩放；窄屏自动切紧凑列宽。
- 横屏短屏（`min-width:721px` 且高度 ≤900/700px）自动把行高降到 46/36px，避免底部被切断。
- 账号里的“课程表”页签仍保留，作为管理/添加课程的入口。

**2. 学习通直接唤起 App**
- 新增原生 `ChaoxingAppPlugin`：对学习通链接依次尝试 `ACTION_VIEW + com.chaoxing.mobile`、该包 launch intent、`chaoxing://` / `mobilelearn://` scheme。
- 全部失败才回退系统浏览器，并提示“未检测到学习通 App”。
- `AndroidManifest.xml` 增加 `<queries>` 包可见性声明；学生端“学习通”列表与绑定页均提供“打开学习通”入口。
- 限制：手机必须已安装学习通；部分 ROM 会要求用户确认跳转；学习通自身对未登录/过期链接可能落首页。

**3. 深浅色跟随系统**
- 主题偏好增加“系统”档（默认）：`shishuo.theme.v2` 存 `system|light|dark`，用 `prefers-color-scheme` 实时跟随；按钮循环“系统 → 浅色 → 深色”。
- 原生主题改为 `Theme.AppCompat.DayNight.NoActionBar`，新增 `values-night/colors.xml`；Activity 的 `configChanges` 去掉 `uiMode`，系统切深色会重建并重新应用 WebView 的媒体查询。
- 首屏内联脚本在 React 之前写 `data-theme`，避免深色系统闪白；`--on-accent` 保证强调底上的文字在深浅两套主题都清晰。
- 深色下“交给 AI”禁用态改为中性底 + 可读文字；“问导师”、导师输入区、学员端底部等对比度问题一并修正。

**4. 去掉提示小字**
- 新增 `src/styles/cleanup.css`，统一隐藏静态说明小字（登录演示提示、附件隐私说明、导师页脚注、设置项描述等）。
- 保留动态错误、权限拒绝、危险操作确认等必要信息；不做 `display:none` 的“假删除”。

**5. 手机系统通知**
- M1（前台）：`@capacitor/local-notifications` 在 `/api/state` 同步后，对新未读通知发本地通知；首次运行只建基线，不补发历史；点击通知打开对应会话或通知中心。
- M2（后台）：WorkManager 每 15 分钟轮询 `/api/notifications`（带 WebView 登录 Cookie），去重后发系统通知；`POST_NOTIFICATIONS` 在首次同步时申请。
- 服务端 `GET /api/notifications` 按学生/教师身份、课程范围和 `since/unread` 过滤，返回 `cursor` 与 `unreadCount`。
- 限制：不是厂商推送，杀进程/省电模式/部分 ROM 会延迟或拦截；15 分钟是系统允许的最小周期之一，不能做到即时。

## 九、仍缺 / 后续

| # | 问题 | 影响 | 方向 |
|---|---|---|---|
| 1 | 生产仍是 HTTP 明文 | 无证书，长期不可上架 | 域名 + HTTPS，移除 `usesCleartextTraffic` |
| 2 | 只有本地通知 + 15 分钟轮询，没有厂商推送 | 后台/杀进程时通知会延迟 | 接入国内厂商推送通道（FCM 不可用） |
| 3 | 线上响应头 `Permissions-Policy: camera=()` | 网页内 `getUserMedia` 被禁用 | 改响应头，或原生相机桥 |
| 4 | 宽屏（平板/横屏）侧栏+顶栏分栏时，状态栏左右底色不同 | 单色图标在某一侧对比度不足 | 宽屏加统一 scrim，或强制移动端单栏 |
| 5 | 纯 WebView 套壳在国内商店容易被拒 | 上架风险 | 补原生能力、软著、隐私政策、备案 |
| 6 | 语音识别 | 按产品决定不做 | — |

## 十、发布前（阶段 2）

1. **先部署新前端**到生产，确认 App 自动切到沉浸式、隐私授权可用。
2. 生成 release keystore，`versionCode` 递增，`assembleRelease`。
3. 域名 + HTTPS，更新 `server.url`，去掉明文流量配置。
4. 隐私政策、软著、备案。
5. 真机覆盖测试：微信/QQ 内打开的分享链接、老安卓版本、刘海屏/手势导航、平板宽屏。

> 本次部署记录（2026-11-22）：本次改动单独提交为 `05f8f48`，合并最新主线 `4780c17`（公式渲染/长回答修复）后推送 Gitee `origin/main`（`898a1eb`），生产已部署合并版；两次备份分别在 `/root/shishuo-stage1-backup-20261122-003959` 和 `/root/shishuo-merged-backup-20261122-010502`。另一条 UI 任务线的未提交改动没有上线；介绍站 `/intro/` 未受影响。

> 第二批部署记录（2026-11-22）：课程表宽屏、学习通 App 跳转、系统深色跟随、提示小字清理、本地通知 + 15 分钟后台轮询。功能提交 `ff1e3d6` 已推送 Gitee `origin/main`；生产备份 `/root/shishuo-stage2-backup-20261122-083444`；最终 APK `dev/builds/shishuo-0.1.0-debug.apk`（8.5MB，`server.url=http://121.37.30.147`）。
> 注意：生产前端是从当前工作区构建部署的，包含同工作区另一条任务线的介绍站/动效改动；这些改动不在 `ff1e3d6`（该提交只含本批功能，介绍站 `public/intro` 等未提交文件仍由另一条任务线管理）。

## 十一、v0.2.0 阶段 3 升级（2026-11-22）

面向「产品完成度提升 + 本校同学内测日常使用」新增以下原生与联动能力（已编译验证，`dev/builds/shishuo-0.2.0-debug.apk`，5.75MB，`versionCode 2`）：

1. **原生拍题 / 拍板书 + 图片保存相册**
   - 扩展 `PhotoAccessPlugin.java`：新增 `takePhoto()`（`CAMERA` 权限 + `FileProvider` + EXIF 旋转修正 + 1600px JPEG 压缩）与 `saveImageToGallery()`（写入系统 `Pictures/师说`）。
   - 修复 Android 14+ 有限相册访问兼容：声明并检查 `READ_MEDIA_VISUAL_USER_SELECTED`。
   - 前端接入：学生提问框新增「拍题」按钮，教师回复抽屉和 FAQ 编辑器新增「拍照」按钮，问答详情老师附图支持一键「保存到相册」。
2. **4×2 桌面课程表小组件 + 断网离线课表**
   - 新增 `ScheduleWidgetProvider.java`、`ScheduleBridgePlugin.java` 及浅/深色自适应小组件布局 `widget_schedule.xml`。
   - 学生课表变动自动同步到原生 `SharedPreferences`，小组件自动计算当前教学周并展示今日剩余课程/上课中状态或明日预告；点击直达课程表页。
   - 课程表页与设置页支持 Android 8.0+ 一键「添加到桌面」。
   - `android-shell/index.html` 适配系统深色模式，且断网时自动读取本地缓存展示「离线课表」（可按周一~周日切换查看）。
3. **上课前本地自动提醒**
   - 新增 `src/lib/classReminders.ts`：纯本机按课表排期未来 7 天课程（独立频道 `shishuo-class-reminder`，固定 ID 段 `200001..200060`），支持提前 10/15/20/30 分钟，点击通知直达课程表。
4. **桌面长按快捷方式 + 系统「分享到师说」+ 原生分享与触感**
   - `res/xml/shortcuts.xml` 配置 4 个桌面长按快捷入口：拍题提问、我的课表、学习通、今天吃什么。
   - `MainActivity` 支持 `ACTION_SEND`（`image/*`、`text/plain`），从相册/微信/学习通分享题目图片或文字可直接填入学生提问框。
   - 问答/FAQ 分享在 App 内改用原生系统分享面板；关键操作与「今天吃什么」开盲盒加入轻触感反馈。
5. **APK 应用内版本检测与更新 + 工程隐患修复**
   - 服务端新增 `GET /api/app/version`（支持 `data/app-release.json` 或环境变量覆盖）；原生新增 `AppSystemPlugin.java`（读取版本号、`DownloadManager` 下载并唤起安装器、跳转省电/电池优化设置）。
   - 新增 `ShellConfig.java` 统一从 `assets/capacitor.config.json` 读取 `server.url`，消除 `NotificationPollWorker.java` 和 `android-shell/index.html` 的硬编码服务器地址。

> 第三批部署记录（2026-11-22）：已精准增量部署主站前端产物（`dist/index.html`、`dist/admin/`、`dist/assets/`）、`server/api.mjs` 及 `shishuo-android-0.2.0.apk` 到生产 `121.37.30.147`（生产备份 `/root/shishuo-stage3-backup-20261122-093852`，未覆盖线上 `server/index.mjs` 与介绍站其他文件）。介绍站 `/intro/` 下载卡片已同步更新为 `v0.2.0 · 5.8 MB`（直链 `/intro/download/shishuo-android-0.2.0.apk`，同时保留 `0.1.0` 包不 404）；公网接口 `/api/health`、`/api/app/version`、`/`、`/admin/`、`/intro/` 及 APK 下载均已验收 `200 OK`，无头移动端冒烟测试 `0` 报错。

> 第四批优化与 v0.2.1 正式签名发布（2026-11-22）：
> - **APK 极致瘦身 + 正式签名**：生成固定 Release 签名证书（`android/shishuo-release.jks`，已加入 `.gitignore`），开启 R8 代码压缩裁剪与资源压缩，并将 25 张冗余 `splash.png` 替换为 300B 矢量 `splash.xml`；APK 体积从 8.5 MB → **1.35 MB**（`versionCode 3`，`versionName 0.2.1`）。
> - **拍题相机修复**：在 `AndroidManifest.xml` `<queries>` 增加 `IMAGE_CAPTURE`，在 `proguard-rules.pro` 显式保留 `*Annotation*`，在 `PhotoAccessPlugin` 补充 `ClipData` + `grantUriPermission` 授权；同时前端三处拍照入口增加 `capture="environment"` 无缝兜底，彻底消除“当前设备暂不支持直接调用相机”提示。
> - **下载提速与 CDN 分流**：服务端 `server/index.mjs` 补齐 `.apk` 标准 MIME、`Content-Length` 与 `206` 断点续传；已发布 Gitee Release `v0.2.1`（`https://gitee.com/vesper1111/school-hackathon/releases/download/v0.2.1/shishuo-android-0.2.1.apk`），介绍站与 `/api/app/version` 均已指向 Gitee Release 免登录直链，同时在服务器保留同域镜像 `/intro/download/shishuo-android-0.2.1.apk`。

> 第五批优化与 v0.2.2 发布（2026-11-22）：
> - **真正的应用内直接更新**：`AppSystemPlugin` 改用原生流式下载（支持 Gitee 多跳 302 + 备用镜像回退）并向前端实时推送下载百分比进度条，完成后检测 `canRequestPackageInstalls()`（未开启时一键跳系统授权页，返回自动续装），直接通过 `FileProvider` 调起系统安装包，无需跳转浏览器。
> - **平板横屏左下角课表修复**：修复 `layout.css` 在矮屏（`max-height: 780px`）把「本周课程」内容全部 `display: none` 掏空成空白框以及 `.side-nav` 不收缩导致底部账号按钮被裁切的问题；矮横屏下自动切换为「下一节 / 今日课程摘要」卡片，点击直达整周课程表页。

> 第六批优化 v0.2.3（2026-11-22）：
> - **解决「安装失败(-7) 与已安装应用签名不同」引导**：`AppSystemPlugin.getAppInfo()` 新增当前安装包签名 SHA-256 与 `debuggable` 检测，`/api/app/version` 返回 `releaseSha256`；前端识别 `0.1.0 / 0.2.0` 早期 debug 签名后，在更新弹窗与设置页提前警示并引导“先保存正式版 APK → 卸载旧版 → 再安装”（不删 `cacheDir` 导致丢包），自正式版起全面支持应用内直接覆盖升级。
> - **手机端设置清晰显示版本号**：在「设置 → 账号头卡」顶部展示 `Android vX.Y.Z` 徽章，并在 `cleanup.css` 为 `.settings-row.is-keep-hint` 放行，使「安卓手机端」分组内的版本号、Build 号、签名类型与下载进度完整可见。

> 第七批优化 v0.2.5（2026-11-22）：
> - **桌面小组件完整显示 4 节及以上全部课程**：将 `widget_schedule.xml` 静态 3 行改为 `ListView` + `ScheduleWidgetService`（`RemoteViewsService`），并收紧单行垂直间距；4 节课一屏完整展示，5 节及以上支持上下滑动查看，点击任意课程直达课表页。
> - **修复小组件右上角圆角裁切**：将 `widget_root` 左右内边距增至 `16dp`、顶部增至 `13dp` 并为表头增加左右安全间距，避免「今日无课 · 明日 X 节」被 18dp 圆角切字。

> 第八批优化 v0.2.6（2026-11-22，OPPO / ColorOS 小组件兼容）：
> - **主小组件补预览**：`widget_schedule_info.xml` 增加 `android:previewImage="@drawable/widget_preview"` 与 `android:previewLayout="@layout/widget_schedule_preview"`，解决部分 OEM 桌面小组件选择器里不显示/空白的问题。
> - **新增兼容版静态小组件**：`ScheduleWidgetStaticProvider` + `widget_schedule_static.xml`，只使用普通 `RemoteViews`，不依赖 `ListView` / `RemoteViewsService`；3×2、最多 4 行，适用于 ColorOS 等无法添加集合小组件的桌面，三个 Provider/布局/字符串/清单均已接入。
> - **OPPO 一键添加优先兼容版**：`ScheduleBridgePlugin.requestPinWidget()` 按 `Build.MANUFACTURER/BRAND` 识别 OPPO / realme / OnePlus / OPlus，优先请求兼容版；失败再回退完整版。课表同步会同时刷新两个 Provider。
> - **前端引导**：添加失败时明确提示「长按桌面空白处 → 小组件 → 搜索『师说』；OPPO 若找不到，请选『师说 · 今日课表（兼容版）』」，并阻止 0.1.0 旧版误点。
> - **发布**：`versionCode 8` / `versionName 0.2.6`，`dev/builds/shishuo-0.2.6-release.apk`，1,465,383 B；签名证书 SHA-256 仍为 `f1cce83c…123c58`，可从 0.2.5 直接应用内覆盖更新。生产备份 `/root/shishuo-widget-backup-20261122-123831`。
