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
adb install -r dev/builds/shishuo-0.1.0-debug.apk
```

或把 APK 发到手机，允许“安装未知来源应用”后直接安装。当前是 **debug 签名**，仅用于内测，不能直接上架。

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

## 八、原生相册权限（2026-11-22 补充）

- 学生点“图片”先申请系统权限：Android 13+ `READ_MEDIA_IMAGES`，Android 12 及以下 `READ_EXTERNAL_STORAGE`。
- 权限弹窗由 Android 系统提供：“允许全部 / 允许有限访问 / 拒绝”（不同 ROM 文案略有差异）。
- 允许后打开系统相册全库选图；原生 `PhotoAccessPlugin` 把图片压到最长边 1600px 的 JPEG 再回传，避免大图卡住 WebView。
- 拒绝后显示「照片权限未开启」：可跳系统设置授权、回来重新检查，或改用系统选择器（Photo Picker）只发本次选中的照片。
- 文件不走这个权限：继续用系统文件选择器（SAF）逐次授权；安卓没有普通应用的“访问全部文件”权限（`MANAGE_EXTERNAL_STORAGE` 需要特殊审核，未申请）。
- 三处入口都已接入：学生提问、教师 FAQ 附件、教师回复附图。
- Web 端仍保留原来的“发送前确认”弹窗；原生照片授权由系统弹窗承担，避免双重询问。

## 九、仍缺 / 后续

| # | 问题 | 影响 | 方向 |
|---|---|---|---|
| 1 | 生产仍是 HTTP 明文 | 无证书，长期不可上架 | 域名 + HTTPS，移除 `usesCleartextTraffic` |
| 2 | 没有系统推送 | 老师回复不能弹通知 | 国内厂商推送通道（FCM 不可用） |
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

> 本次部署记录（2026-11-22）：只替换了生产 `/opt/shishuo/dist` 的 `index.html`、`admin/`、`assets/` 与本次源码，另一条 UI 任务线的未提交改动没有上线；介绍站 `/intro/` 未受影响。服务器备份在 `/root/shishuo-stage1-backup-20261122-003959`。本地代码仍未提交，后续用 `git archive HEAD` 部署前需要先把本次文件提交。
