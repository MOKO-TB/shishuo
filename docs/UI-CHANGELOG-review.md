# 我的 UI 改动 · 变更清单与同步建议

> **状态：待队友核对（pending review）**
> 维护者：Li-811　核对人：待指派
> 对比基线：`origin/main@35d0cd9`（末次 pull 位置）　本地 HEAD：`1e614d4`
> 生成时间：2026-11-19 18:51
> 提交数：**17 个**（`843cfd1` → `1e614d4`）　文件：**47 个**（新增 9 / 修改 38 / 删除 0）　行数：**+3253 / −1735**

---

## 如何核对（给队友的三步）

1. **看范围**：读 §二 ~ §四，确认新增/修改/删除的文件是否都在预期内，有没有碰到不该动的模块。
2. **重点看冲突**：读 §六，两处冲突的处理建议（`closure.css` 两边都留、`NotificationCenter.tsx` 保留远端版本），有异议直接在此提。
3. **确认接口变化**：读 §八，如果你手上分支引用了这些类名或 DOM，需要同步调整。

> 核对意见请直接在本文件末尾「核对记录」追加，或提 issue / 群里说。**未核对完成前不 push 到远端。**

---

## 一、结论

| 判断 | 说明 |
|---|---|
| **需要提交上传** | 是。17 个提交全在本地，远端 `origin/main` 已到 `003cf08`（比基线又多 7 个提交），队友拉不到任何改动 |
| **合并会有 2 处冲突** | 已用临时分支实测：`src/components/NotificationCenter.tsx`、`src/styles/closure.css`；`src/components/AccountModal.tsx` 可自动合并 |
| **冲突规模小** | 都是「双方在同一段追加/修改」，`closure.css` 是远端末尾纯追加 409 行 |

---

## 二、新增文件（9 个）

| 文件 | 行数 | 作用 |
|---|---|---|
| `src/styles/tokens.css` | 144 | 语义层唯一来源：底色/文字/描边/圆角/字号/间距/侧栏色，浅深两套值 |
| `src/styles/fill.css` | 88 | `data-fill` 填充原语（card/inset/plain/accent/hero/panel/strong）+ 全局 `:focus-visible` |
| `src/styles/settings.css` | 248 | 设置页三步法：左右布局行、分组标题、危险操作独立组、账号头卡 |
| `src/styles/page-sheet.css` | 148 | 二级页面骨架 + 入场动效（复用 pageFade） |
| `src/styles/optical.css` | 42 | 视觉对齐补偿（三角/星形/头像单字/图标文字 1px 微调） |
| `src/components/PageSheet.tsx` | 98 | 二级页面组件：返回 + 标题 + 焦点圈定 + Esc 返回 |
| `docs/UI-GUIDELINES.md` | 165 | UI 规范文档（分层/填充/字号/断点/a11y/小程序映射/验证清单） |
| `dev/check-ui.mjs` | 55 | UI 卡口脚本 |
| `dev/ui-baseline.json` | 5 | 基线：字面色值 404、圆角字面量 20、小字号 0 |

## 三、删除与清理（无整文件删除）

| 内容 | 位置 | 原因 |
|---|---|---|
| `MajorMentorSidebarCard` 组件（52 行） | `src/components/MajorMentor.tsx` | 与「我的答疑」顶部横条功能重复（同一 hook、同一组操作） |
| `.side-mentor*` 共 19 条样式（145 行） | `src/styles/mentor.css` | 随组件一起移除 |
| 「窄侧栏本周课程」整段 + `::before` 的「+」号（52 行） | `src/styles/closure.css` | 伪元素 + 号误入口，点击会打开旧设置 |
| 8 处组件级深色补丁 | `src/styles/base.css` | 改由 `tokens.css` 换变量值 |
| 68 行重复/失效的 sidebar 规则 | `src/styles/layout.css` | 多轮追加造成的重复块 |

## 四、修改的主要文件（按改动量）

| 文件 | 行数 | 关键差异 |
|---|---|---|
| `src/components/Layout.tsx` | 477 | 侧栏重构：删导师卡、删重置/管理台/退出、底部只留「头像+设置」、本周课程并入底部吸底组、导航高亮跟随 `accountOpen` |
| `src/components/AccountModal.tsx` | 309 | 拆成「账号头卡 / 身份信息 / 通知 / 说明 / 账号操作」五组；设置项改左右布局；退出登录收进危险组；打开时滚到顶部 |
| `src/App.tsx` | 36 | 设置从弹窗改为内容区独占渲染；`navigate` 重置 `accountOpen`；7 个视图加互斥条件 |
| `src/components/ui.tsx` | 64 | 新增 `useFocusTrap`（Modal/Drawer 焦点圈定与归还） |
| `src/lib/placeholderTab.ts` | 37 | Tab 填 placeholder 改为 `Ctrl/Cmd+Tab`，回车只在单行 input 生效 |
| `src/styles/layout.css` | 325 | 顶栏统一 `--header-h`、底部固定区、课程条横滑、安全区 |
| `src/styles/admin-console.css` | 388 | 表单字段 44px/14px、KPI 双列、tab 横滑、去外层描边 |
| `src/styles/teacher.css` | 302 | workbench/rail 卡片语义化、工具栏 44px、<980 单列 |
| `src/styles/student.css` | 284 | 提问卡语义底、课程条吸附、移动端布局 |
| `src/styles/mentor.css` | 282 | 删侧栏卡样式，移动端横条压缩 |
| `src/styles/closure.css` | 229 | 删深色补丁与 + 号规则、学习通样式纳入规范 |
| 其余 27 个 CSS | — | 字号 `--text-meta` 化（668 处）、圆角 token 化（346 处） |

## 五、按主题归纳

1. **语义填充层（地基）**：颜色从「颜色名」改为「用途名」；渐变只留 `--fill-hero` / `--fill-panel`；深色只换变量值，删 8 处补丁。
2. **移动优先**：断点 3 档 `min-width` 递进；课程条横滑+渐隐；知识库 1/2/3 列；底栏 safe-area；手机左右留白 16px。
3. **三端一致性**：三端顶栏统一 64px 与同一底色；管理端表单 44px/14px（避免 iOS 自动缩放）；教师端卡片语义化。
4. **设置页改造（三步法）**：左右布局、去外层卡片、分组（组间 32 / 组内 8）、危险操作独立成组；弹窗改二级页面 + 入场动效。
5. **侧栏重构**：底部固定区 = 本周课程 + 设置；头像收进设置页；删重复导师入口、重置、管理台、退出。
6. **可访问性与规范**：全局 `:focus-visible`、焦点圈定、对比度校准（3.9→4.99:1）、字号下限 11px、`npm run check:ui` 卡口。
7. **修过的真实 bug**：学习通样式破坏卡口；上游 `4028c60` 的 `NotificationKind` 类型缺项；设置打开时导航失效；窄屏周几两行 + 窄侧栏溢出。

---

## 六、与远端的关系（合并预判）

远端在基线之后又推了 **7 个提交**（`33835c7` → `003cf08`）：

```
003cf08 fix(campus): 回复文案统一为校园主理人
54c4e17 fix(jw): 修复成绩读取并登录后自动同步 GPA
e40f279 feat(chaoxing): auto-sync messages and homework in background
2432dc3 style(chaoxing): keep original layout and only remove helper copy
d79a11c style(chaoxing): simplify header copy and refine page layout
b12ebb9 fix(chaoxing): make chapters a tab and open course material library
33835c7 feat(chaoxing): group courses, sync chapters and fix QR polling
```

**双方都改过的文件（3 个）**

| 文件 | 远端 | 我方 | 冲突 |
|---|---|---|---|
| `src/styles/closure.css` | 末尾纯追加 +409（学习通样式） | 改既有规则、删补丁、删 + 号 | ⚠️ 冲突 |
| `src/components/NotificationCenter.tsx` | 补 `account-*` 映射（`ShieldAlert`/`ShieldCheck`） | 也补了 3 个（`CircleAlert`/`CircleCheck`） | ⚠️ 冲突 |
| `src/components/AccountModal.tsx` | 成绩读取后自动持久化 + GPA 同步 | 整体重构分组与布局 | ✅ 可自动合并，但需人工确认成绩逻辑仍在 |

**冲突处理建议**

1. `NotificationCenter.tsx`：**保留远端版本**（`ShieldAlert`/`ShieldCheck` 语义更准），删我加的三行。
2. `closure.css`：远端是纯追加，**两边都保留**，远端学习通样式接在我的修改之后。

---

## 七、建议的同步流程

```bash
git fetch origin
git rebase origin/main          # 冲突：解决 → git add → git rebase --continue
npm install                     # 远端可能新增依赖
npm run build
npm run check:ui
npm run test:api
npm run test:chaoxing           # 远端新增测试
git push origin main            # 不要 merge --squash，不要 force push
```

---

## 八、接口变化（组员必看）

| 变化 | 影响 |
|---|---|
| 设置不再是弹窗，改为 `.page-sheet` 二级页面 | `querySelector('.modal-panel')` 找不到设置页 |
| `AccountModal` 新增 `variant` prop（默认 `page`） | 需要弹窗形态时传 `variant="dialog"` |
| `Layout` 新增 `accountOpen` prop | 不传默认 `false`，底栏/侧栏不高亮 |
| `.side-mentor*` 类名全部删除 | 不要再引用 |
| 样式引用顺序：`tokens → base → 页面 → 补丁层 → fill/page-sheet/settings` | 新样式插在 `fill.css` 之前 |
| `dev/ui-baseline.json` 基线 404/20/0 | 新增字面色值会让 `check:ui` 变红 |

---

## 九、17 个提交一览

```
1e614d4 fix(settings): 打开设置页时滚动到最顶端
a321be1 chore(ui): 收紧 UI 基线到 404/20/0
6c676e4 fix(sidebar): 移除窄侧栏「+」号误入口并清理旧组件
f5f63bb fix(sidebar): 删除重复的 AI 导师侧栏入口，本周课程与设置整体贴底
dcedf57 feat(sidebar): 本周课程吸底、底部只留设置、头像收进设置页
8dfd452 feat(settings): 设置二级页面加入场动效
c5fbfa5 fix(nav): 打开设置后底栏/侧栏高亮同步到「账号」
036498c fix(nav): 设置页打开时点击导航无法离开
abfb7a1 fix(mobile): 设置二级页面在手机上保留左右留白
d76462b feat(sidebar): 三个设置按钮一字排开 + 设置改为二级页面
b070f01 style(sidebar): 侧栏底部按钮改为一字排开
4dd8b5a fix(sidebar): 修复未导入课表时「本周课程」卡片在窄侧栏溢出
91c3d0b fix(schedule): 修复窄屏周几切换被挤压成两行
170c882 feat(ui): 管理端与教师端对齐主站规范
c161a8f feat(ui): 设置页三步法排版 + 视觉对齐层
da68819 fix(ui): 学习通新样式纳入 UI 规范 + 补通知类型缺项
843cfd1 feat(ui): 语义填充层 + 移动优先布局 + 可访问性 + UI 规范卡口
```

---

## 十、核对记录

| 时间 | 核对人 | 结论 | 备注 |
|---|---|---|---|
| 2026-11-19 18:53 | Li-811 | 提交清单，待核对 | 已推送本条记录，未合入代码 |
|  |  |  |  |
