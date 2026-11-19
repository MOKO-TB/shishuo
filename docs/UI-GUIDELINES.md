# UI 规范（三端共用）

> 适用范围：学生端、教师端、管理端。改动任何界面样式前先读这份，改完跑 `npm run check:ui`。
> 目标：一套语义 token 管三端、移动优先、便于后续迁到微信小程序。

---

## 1. 分层与文件职责

| 文件 | 职责 | 允许写什么 |
|---|---|---|
| `src/styles/tokens.css` | 唯一的语义层 | 变量定义（浅/深两套），不写选择器 |
| `src/styles/base.css` | 原始色板 + 基础排版 | 色板变量、reset、`.card` 等基础规则 |
| `src/styles/fill.css` | 填充原语 | `[data-fill]` / `[data-radius]` / 焦点样式 |
| `src/styles/<页面>.css` | 页面级样式 | 只用 `var(--*)`，不写色值与 px 圆角 |
| `src/styles/ui-cleanup.css` 等 | 历史补丁层 | **不再新增**，见 §7 |

`src/styles.css` 的 @import 顺序即优先级：tokens → base → 页面 → 补丁层 → fill。

---

## 2. 填充：只用 5 个角色

```
--bg         页面底
--bg-card    主容器（卡片）
--bg-card-alt 次级卡 / 侧栏小卡
--bg-inset   卡片内嵌区（如代码块、输入框底）
--bg-accent  强调底（jade soft）
--bg-strong  深色反白块
```

组件里优先用属性，不要各写一遍 `background + border + radius + shadow`：

```html
<section data-fill="card">…</section>
<div data-fill="inset" data-radius="md">…</div>
<aside data-fill="hero">…</aside>
```

可用的 `data-fill`：`card` / `inset` / `plain` / `accent` / `hero` / `panel` / `strong`。

**渐变只允许两个变量**：`--fill-hero`（首屏/重点卡）、`--fill-panel`（面板/促销卡）。
不要在组件里直接写 `linear-gradient(...)` —— 深色模式下会变成看不见的浅色块。

---

## 3. 文案与字号

| Token | 值 | 用途 |
|---|---|---|
| `--text-meta` | 11px | 仅徽标、计数、时间戳 |
| `--text-xs` | 12px | 次要说明 |
| `--text-sm` | 13px | 正文（列表、表单标签） |
| `--text-base` | 14px | 正文（默认） |
| `--text-lg` | 16px | 输入框、卡片标题 |
| `--text-xl` | 20px | 区块标题 |
| `--text-2xl` | 28px | 页面副标题 |
| `--text-display` | clamp(26px, 3.4vw, 44px) | 页面主标题（`.display-title`） |

规则：

- **正文不小于 13px，元信息不小于 11px**；`npm run check:ui` 会拦住 < 11px。
- 中文不要用 8–10px：笔画会糊，投影/低分屏更明显。
- 数字与单位分开写时，单位用 `--text-meta`，数字用 `--text-2xl`。

---

## 4. 间距、圆角、阴影、触控

| 类别 | 允许值 |
|---|---|
| 间距 | `--space-1..6` = 4 / 8 / 12 / 16 / 24 / 32 |
| 圆角 | `--radius-xs..xl` = 8 / 10 / 12 / 18 / 24，胶囊用 `--radius-pill` |
| 阴影 | `--shadow-card`（卡片）、`--shadow-float`（浮层） |
| 触控 | `--touch` = 44px，移动端按钮/图标按钮不小于这个值 |
| 顶栏 | `--header-h` = 64px（三端统一） |

不要写 `border-radius: 9px`/`17px` 这类"差一点"的值——视觉上对不齐，且无法统一替换。

---

## 5. 响应式：移动优先

断点只保留 3 档，且**只用 `min-width` 递进**：

```css
/* base：<640px 单列 */
@media (min-width: 720px) { /* 平板：两列 */ }
@media (min-width: 1180px) { /* 桌面：三栏 */ }
```

- 先写手机单列 DOM 顺序（提问卡 → 我的提问 → 右栏信息），桌面用 grid 把右栏提到侧边，**不要用 `max-width` 藏内容**。
- 横向滚动条必须给"还有内容"的提示：`mask-image` 渐隐 + `scroll-snap-type: x proximity`。
- 底部固定栏要留安全区：`padding-bottom: env(safe-area-inset-bottom)`。
- 字号用 `clamp()`，不要靠新增断点微调。

---

## 6. 可访问性（硬要求）

- 焦点：全局 `:focus-visible` 在 `fill.css` 统一定义，不要 `outline: none`。
- 弹窗：`Modal` / `Drawer` 已带 `role="dialog"` + `aria-modal` + 焦点圈定（`useFocusTrap`）+ 关闭归还焦点；新写的浮层必须复用它们。
- 键盘：**不要劫持 Tab / Enter**。演示快捷键一律加修饰键（当前是 `Ctrl/Cmd + Tab`）。
- 对比度：正文 ≥ 4.5:1，大字号 ≥ 3:1。`--fg-faint` 只能做装饰分隔，不承载信息。
- 图标按钮必须有 `aria-label`；纯装饰图形 `aria-hidden`。

---

## 7. 存量债务与卡口

`npm run check:ui` 检查三件事，并与 `dev/ui-baseline.json` 比对：

| 规则 | 当前基线 | 目标 |
|---|---|---|
| 字面色值（`#hex`/`rgba()`）出现在 tokens/base 之外 | 423 | 0 |
| `border-radius` 字面量 | 20 | 0 |
| `font-size` < 11px | 0 | 0 |

只允许基线下降，不允许上升：新增样式必须用 token，否则 CI 红。
清掉一批后执行 `node dev/check-ui.mjs --write` 收紧基线。

`ui-cleanup.css` / `closure.css` / `readability.css` / `transfer.css` 属于历史补丁层：

- 不再往里加新规则；
- 修 bug 时优先改回原始页面文件；
- 每轮迭代挑一个小节把补丁合并回源文件并删除。

---

## 8. 微信小程序迁移对照

| Web 现状 | 小程序做法 |
|---|---|
| `:root` CSS 变量 | `page { --bg: ... }` 或 `app.wxss` 全局变量（同名保留） |
| `px` | `rpx`（1px ≈ 2rpx，按 750 设计宽换算） |
| `position: fixed` 底部导航 | 用原生 `tabBar`，或 `position: fixed` + `safe-area-inset-bottom` |
| `backdrop-filter` | 小程序支持不稳，改用不透明底 `--bg-translucent` 的实色版本 |
| 多重渐变 | 只保留 `--fill-hero` / `--fill-panel` 两个，其它用纯色 |
| `lucide-react` 图标 | 内联 SVG → `<image src="data:image/svg+xml,...">` |
| `mask-image` | 改用外层渐变遮罩元素 |
| React 组件 | 数据逻辑留在 `lib/` 的纯函数，渲染层替换为 WXML |

原则：**展示与数据分离**。视图组件里不要直接 `fetch`，统一走 `lib/api` 与 `store`，迁移时只换渲染层。

---

## 9. 验证清单（改完必跑）

```bash
npm run check:ui     # token/圆角/字号卡口
npm run build        # 类型 + 构建
npm run test:api     # 后端回归（UI 改动不应影响，但防手滑）
```

视觉自查（三端 × 两主题 × 四个宽度）：

| 宽度 | 检查点 |
|---|---|
| 390 | 单列、底栏不压内容、横向滚动有渐隐、无横向溢出 |
| 768 | 两列、卡片等宽、按钮不换行 |
| 1180 | 三栏、右栏与主栏底边接近 |
| 1440 | 内容最大宽 1360、左右留白对称 |

深浅两套主题都要看：卡片是否有层次（`--bg` 与 `--bg-card` 明度差）、强调色是否刺眼。
