# 管理台开发说明（Admin Console）

管理台是师说的第三个视角：**学生端 / 教师端之外的管理端**。它是全页应用，不是弹窗；代码集中在 `src/views/admin/`，服务端接口在 `server/api.mjs` 的 `/api/admin/*`。

> 旧的 `src/components/AdminModal.tsx` 已被管理台取代并删除；历史版本可在 git 记录里找到。不要再往弹窗里加管理功能。

## 1. 入口与权限

- 入口：**独立的 `/admin/` 页面**，有自己的登录页和管理台顶栏；不在教师端导航里。教师端顶部的「管理台」只是一个跳转链接。
- 权限：服务端 `requireAdmin(req)` 要求 `users.is_admin = 1`；普通教师即使知道 `/admin/` 也进不去。
- 前端只负责隐藏入口，**真正的权限必须在服务端**。新增管理接口时先加 `requireAdmin`，写操作再加 `sameOrigin(req)`，并补审计。
- 管理员自动拥有校园生活域（`campus`）权限，因此可以处理校园待办、编辑校园 FAQ；普通课程老师看不到校园问答。
- `/admin/` 与主站同源、同 Cookie、同部署产物；不需要第二个 Node 进程或端口。要独立端口时可用 Nginx/Caddy 把 `/admin/` 反代到主服务，但当前服务器没有 nginx。

## 2. 代码地图

| 文件 | 职责 |
| --- | --- |
| `admin/index.html` | 独立管理端 HTML 入口，Vite 多页构建输出 `dist/admin/index.html` |
| `src/admin-main.tsx` | 管理端 React 入口（只挂 AuthProvider，不挂 StoreProvider） |
| `src/views/admin/AdminApp.tsx` | 管理端登录页、管理员守卫、独立顶栏 |
| `src/views/admin/AdminConsoleView.tsx` | 全页壳、页头、9 个 tab、概览、权限守卫 |
| `src/views/admin/AdminUsersPanel.tsx` | 账号列表、创建账号、改姓名/课程、重置密码 |
| `src/views/admin/AdminModerationPanel.tsx` | 敏感词、图片审核、用户禁言/封禁、内容队列 |
| `src/views/admin/AdminCampusPanel.tsx` | 学生问答总览；管理员以校园主理人身份回复校园问题并沉淀 FAQ |
| `src/views/admin/AdminVerificationPanel.tsx` | 校园 FAQ 复核计划、到期状态、标记已核实 |
| `src/views/admin/AdminAuditPanel.tsx` | 审计日志、按账号/动作/课程/摘要筛选 |
| `src/views/admin/AdminUsagePanel.tsx` | AI 调用量、Token、失败、Top 用户 |
| `src/views/admin/AdminContentPanel.tsx` | 课程 FAQ 分布、校园内容健康度、导入命令 |
| `src/views/admin/AdminSystemPanel.tsx` | 健康检查、接口索引、备份/部署命令、上线检查 |
| `src/views/admin/helpers.ts` | 动作中文名、角色/课程标签、时间格式化 |
| `src/data/adminTypes.ts` | 管理接口的前端类型（与 server 返回对齐） |
| `src/styles/admin-console.css` | 管理台页面级样式；弹窗基础样式仍在 `src/styles/admin.css` |
| `server/api.mjs` | `/api/admin/*` 路由与 `requireAdmin` |
| `server/permissions.mjs` | 工作区权限、教师/学生投影、FAQ/问答合并校验 |
| `server/audit.mjs` | 审计写入与查询 |

## 3. 现有接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态、AI 配置、演示账号、工作区 revision |
| GET | `/api/admin/users` | 账号列表 |
| POST | `/api/admin/users` | 创建学生/教师账号 |
| PATCH | `/api/admin/users/:id` | 修改姓名、课程分配 |
| POST | `/api/admin/users/:id/status` | 禁言 / 封禁 / 恢复正常 |
| POST | `/api/admin/users/:id/password` | 重置密码并注销旧会话 |
| GET | `/api/admin/moderation/terms` | 敏感词列表 |
| POST | `/api/admin/moderation/terms` | 新增敏感词 |
| DELETE | `/api/admin/moderation/terms/:id` | 删除敏感词 |
| GET | `/api/admin/moderation/overview` | 风控汇总（词表、图片、禁言/封禁、命中内容） |
| GET | `/api/admin/moderation/threads?limit=200` | 内容审核队列 |
| POST | `/api/admin/moderation/threads/:id/review` | 通过 / 拒绝并撤下 / 仅撤下 |
| GET | `/api/admin/moderation/images` | 图片审核队列 |
| POST | `/api/admin/moderation/images/review` | 通过 / 撤下图片 |
| GET | `/api/admin/student-threads?limit=300` | 学生问答总览（含校园域）；管理员可见学生、课程、状态和回复 |
| POST | `/api/admin/campus/threads/:id/reply` | 以「校园主理人」回复校园问题；可选沉淀为校园 FAQ |
| GET | `/api/admin/campus/verification` | 校园 FAQ 复核计划（状态 + 全部条目） |
| POST | `/api/admin/campus/faqs/:id/verify` | 标记已核实并设置下次复核周期 |
| GET | `/api/admin/audit?limit=200` | 审计日志 |
| GET | `/api/admin/ai-usage` | 近 7 天 AI 用量 |
| GET | `/api/admin/ai-settings` | AI 网关配置（Key 只返回掩码） |
| POST | `/api/admin/ai-settings` | 保存 Key / Base URL / 模型 / 每日额度 / 启用状态 |
| GET | `/api/admin/archived-threads` | 归档问答 |
| GET | `/api/admin/workspace-summary` | **管理台专用**全量内容汇总（FAQ 分课程、校园健康度、待处理问答） |

### 为什么需要 workspace-summary

`/api/state` 是**按当前账号权限投影**过的：管理员如果同时是课程教师，只看得到自己课程 + 校园域。管理台要展示全站内容统计，不能用 `/api/state` 的数字，否则会少算其他课程。

新增统计维度时，优先扩展 `/api/admin/workspace-summary`，不要在管理台前端自己拼 `/api/state`。

## 3.1 内容风控

风控是管理台的一部分，不是教师端功能。核心代码：

- `server/moderation.mjs`：敏感词、用户状态、审核记录、文本命中判断。
- `server/db.mjs`：`moderation_terms`、`moderation_reviews` 表；`users.status/status_reason/status_until` 字段。
- `src/views/admin/AdminModerationPanel.tsx`：敏感词 / 图片审核 / 用户风控 / 内容队列 4 个子页。

### 敏感词

- 存在 `moderation_terms`，管理台可增删；首次建库预置 8 个基础词（代写、代考、校园贷、赌博等）。
- 命中点：
  - `POST /api/threads`（新建提问、转交、补充、教师回复、要求补充）；
  - `PUT /api/state`（学生新增或修改问题正文）；
  - `POST /api/ai/chat/completions`（AI 消息）。
- 命中后返回 400，并写入 `audit_log` 的 `moderation-blocked`。
- 删除词表后不会在重启时自动恢复（只有空表才会重新写入预置词）。

### 用户状态

- `users.status`：`active | muted | banned`；`status_until` 用于限时禁言。
- 禁言：不能新建提问、转交、补充、上传图片、调用 AI；仍可阅读。
- 封禁：所有写操作被拒绝，并删除该账号所有会话；登录直接返回 403。
- 管理员账号不能被禁言/封禁，避免把后台锁死。
- 所有状态变更写审计，`/api/admin/users` 会返回 `status/statusReason/statusUntil`。

### 图片审核

- 图片上传仍走 `/api/uploads/image`；被禁言/封禁账号不能上传。
- 当前是**事后审核**：图片先落到对象存储，管理员在「图片审核」里通过或撤下。
- 撤下会从工作区线程里删除 `attachment`，并写入 `moderation_reviews`（kind=`image`）和审计；原文件保留在存储里，便于追溯，需定期人工清理。
- 如果要**前置自动审核**：在 `saveUpload` 之后、返回 URL 之前接入外部内容安全 API，命中则删除对象并返回 400；或在线程审核通过前不展示附件。接口和数据结构已经为这个扩展留好位置。

### 内容队列

- 展示最近 200 条问答，带学生、课程、命中词、附件和审核状态。
- 通过：只记录审核状态，不改工作区。
- 拒绝并撤下：设置 `withdrawnAt`、写 `moderation` 备注、移除附件，并写审计。
- 仅撤下：保留附件/内容，只让问答从队列消失。

## 3.2 为什么需要 workspace-summary

## 3.3 内容核实与定时复核
- 校园 FAQ 支持 `lastVerifiedAt / reviewIntervalDays / nextReviewAt / verifiedBy` 四个字段；旧数据没有字段时，服务端按 `collectedAt` + 可信度推导。
- 管理台「内容核实」按状态分组：待核实（从未标记）、已过期、14 天内到期、正常。
- 点击「标记已核实」会写入核实人、核实时间、周期和下次复核时间，并清除 `reviewNeeded`；动作写审计。
- 服务端每 6 小时检查一次；有未核实/过期内容时，每天往 `audit_log` 写一条 `campus-review-due` 系统记录（同一天只写一次）。
- 外部 cron/systemd timer 可以调用：
  ```bash
  npm run review:campus -- --db /opt/shishuo/data/shishuo.db
  ```
  有未核实/过期内容时退出码为 1，方便接告警。
- 复核周期建议：政策/截止日期 30 天，常规校园信息 90 天，稳定流程 180 天，长期有效 365 天。

## 3.4 AI 网关配置（管理端统一）

- 独立管理员账号：`SHISHUO_ADMIN_EMAIL` / `SHISHUO_ADMIN_PASSWORD`，默认 `admin@shishuo.local`；首次启动由 `seedAdminAccount` 创建，角色是 teacher + `is_admin=1`、不分配课程。
- 旧的演示教师 `teacher@shishuo.local` 会被收回管理员权限；它只负责数据结构课程。
- 管理员在「AI 用量」页填写 API Key、Base URL、模型、学生/教师每日上限和启用状态。
- 配置存在 `app_settings` 表（key=`ai_gateway`）；环境变量 `AI_*` 是初始兜底。保存后立即生效，不需要重启。
- 学生端和教师端都只调用 `/api/ai/chat/completions`；浏览器不保存 Key，也没有教师端 Key 配置。
- 接口永远只返回 `apiKeyMasked`；完整 Key 不会出现在 GET 响应、前端 bundle 或日志里。
- **安全**：Key 目前以明文 JSON 存在 SQLite（和密码哈希、审计同库）。数据库备份等同包含 Key，务必保证 `data/` 权限、备份加密；后续可改为 KMS/密钥文件加密。
- 每日额度是“按账号调用次数”，不是 token 上限；Token 用量在同一个页面查看。

## 3.5 学生问答与校园主理人

- 「学生问答」tab 通过 `/api/admin/student-threads` 读取**全部学生提问**，不受管理员本人课程分配限制；支持按全部 / 校园生活 / 课程问答、待回复 / 已回复 / 待补充和关键词筛选。
- 校园生活问题（`courseId=campus`）可以在详情区直接回复。服务端用 `POST /api/admin/campus/threads/:id/reply` 复用 `thread-reply` 动作：校验 revision、敏感词和校园权限，写入学生通知，并触发已开启的回复邮件提醒。
- 回复署名固定为「校园主理人」，不把“系统管理员”暴露给学生；实际操作人仍以管理员账号写入审计。
- 回复超过 40 字时默认勾选「同时沉淀为校园 FAQ」，生成 `campus-reply-<threadId>`，可信度为 `B-教师回复`；不勾选则只回复、不入库。
- 课程问题在管理端只读，详情区明确提示由对应任课教师在教师端处理；管理员不应代替课程老师回复。
- 这样「校园主理人」不再依赖管理员进入主站校园页：独立管理员账号即使没有任何课程，也能在 `/admin/` 内完成查看、回复和沉淀。

## 4. 新增一个管理面板

1. 在 `src/data/adminTypes.ts` 的 `AdminTab` 里加 key，例如 `'moderation'`。
2. 新建 `src/views/admin/AdminModerationPanel.tsx`，只负责自己的数据加载与 UI。
3. 在 `AdminConsoleView.tsx` 的 `TABS` 加一项，并在底部加 `{tab === 'moderation' && <AdminModerationPanel ... />}`。
4. 样式加到 `src/styles/admin-console.css`，复用 `.admin-panel`、`.admin-stat-grid`、`.admin-content-card` 等类。
5. 如果需要新接口：
   - 在 `server/api.mjs` 加路由；
   - 读接口用 `requireAdmin(req)`；
   - 写接口再加 `sameOrigin(req)` 和参数校验；
   - 写操作调用 `recordAudit`（参考账号操作）；
   - 在 `AdminSystemPanel` 的 `API_ROWS` 补一行，方便后续开发查。
6. 跑 `npm run build`、`npm run test:api`，再本地登录管理员验证。

## 5. 本地开发

```bash
npm run dev
# Vite: http://localhost:5173
# 管理员账号：admin@shishuo.local / admin123（生产用 SHISHUO_ADMIN_* 覆盖）
```

登录后：
- 主站：`/` → 学生/教师视角
- 管理端：**`/admin/`**（独立登录页；教师端顶部「管理台」只是跳转链接）

管理台的 9 个 tab：

1. **概览**：账号数、FAQ 总数、待处理问答、AI 状态、最近审计、工作区快捷入口。
2. **账号管理**：创建/编辑账号、课程分配、重置密码。
3. **风控审核**：敏感词、图片审核、用户禁言/封禁、内容队列。
4. **学生问答**：查看全部学生问题；校园问题由管理员以校园主理人身份回复并沉淀 FAQ。
5. **操作审计**：按账号、动作、课程、摘要筛选。
6. **AI 用量**：今日/近 7 天调用、Token、失败、Top 用户。
7. **内容运营**：课程 FAQ 分布、校园内容健康度、导入命令。
8. **内容核实**：校园 FAQ 复核计划与到期提醒。
9. **系统与开发**：健康检查、接口索引、备份/部署命令、上线检查。

## 6. 构建与部署

```bash
npm run build
npm run test:api
npm run eval:retrieval
```

生产机（华为云 121.37.30.147，`/opt/shishuo`）：

```bash
cd /opt/shishuo
npm run build
systemctl restart shishuo
curl -sS http://127.0.0.1/api/health
```

管理台是同一份前端构建产物，不需要单独部署；`npm run build` 会同时生成 `dist/index.html` 和 `dist/admin/index.html`。只要 `dist/` 更新并重启服务即可。访问 `/admin/` 即可进入独立管理端。

## 7. 安全与上线检查

- `.env` 权限保持 `600`；管理接口只允许 `is_admin`。
- 纯 HTTP 环境不要设置 `NODE_ENV=production`，否则 Secure Cookie 会让登录态失效。
- 生产 AI 默认 OpenAI 端点不可达；需要同时配 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。
- 新增管理写操作时，必须同时考虑：权限、输入校验、审计、并发 revision、回滚/备份。
- 管理台可以撤下违规问答/图片，但不要直接改学生问题正文；正文修改仍走学生/教师业务流程。

## 8. 后续可以加的功能

- 校园内容批量核实 / 批量设置可信度；
- 审计日志导出 CSV；
- AI 用量按课程/按天筛选、配额调整；
- 账号导入（CSV）与批量分配课程；
- 系统告警（磁盘、内存、备份失败）；
- 权限模板（课程教师 / 校园主理人 / 只读审计）；
- 图片前置自动审核（接腾讯云/阿里云内容安全，或自建视觉模型）；
- 禁言/封禁历史与申诉记录。

新增功能时优先复用现有 API 和组件，不要复制旧 `AdminModal` 的实现。
