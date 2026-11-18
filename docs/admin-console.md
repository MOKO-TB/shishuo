# 管理台开发说明（Admin Console）

管理台是师说的第三个视角：**学生端 / 教师端之外的管理端**。它是全页应用，不是弹窗；代码集中在 `src/views/admin/`，服务端接口在 `server/api.mjs` 的 `/api/admin/*`。

> 旧的 `src/components/AdminModal.tsx` 已被管理台取代并删除；历史版本可在 git 记录里找到。不要再往弹窗里加管理功能。

## 1. 入口与权限

- 入口：管理员账号登录后，左侧导航「管理台」；顶部账号菜单里的「管理台」也指向同一页。
- 权限：服务端 `requireAdmin(req)` 要求 `users.is_admin = 1`；普通教师即使知道路由也拿不到数据。
- 前端只负责隐藏入口，**真正的权限必须在服务端**。新增管理接口时先加 `requireAdmin`，写操作再加 `sameOrigin(req)`，并补审计。
- 管理员自动拥有校园生活域（`campus`）权限，因此可以处理校园待办、编辑校园 FAQ；普通课程老师看不到校园问答。

## 2. 代码地图

| 文件 | 职责 |
| --- | --- |
| `src/views/admin/AdminConsoleView.tsx` | 全页壳、页头、6 个 tab、概览、权限守卫 |
| `src/views/admin/AdminUsersPanel.tsx` | 账号列表、创建账号、改姓名/课程、重置密码 |
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
| POST | `/api/admin/users/:id/password` | 重置密码并注销旧会话 |
| GET | `/api/admin/audit?limit=200` | 审计日志 |
| GET | `/api/admin/ai-usage` | 近 7 天 AI 用量 |
| GET | `/api/admin/archived-threads` | 归档问答 |
| GET | `/api/admin/workspace-summary` | **管理台专用**全量内容汇总（FAQ 分课程、校园健康度、待处理问答） |

### 为什么需要 workspace-summary

`/api/state` 是**按当前账号权限投影**过的：管理员如果同时是课程教师，只看得到自己课程 + 校园域。管理台要展示全站内容统计，不能用 `/api/state` 的数字，否则会少算其他课程。

新增统计维度时，优先扩展 `/api/admin/workspace-summary`，不要在管理台前端自己拼 `/api/state`。

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
# 管理员演示账号：teacher@shishuo.local / teacher123
```

登录后：
- 学生端：`/` → 学生视角
- 教师端：待办台 / 课程知识库 / 校园知识库
- 管理端：左侧「管理台」

管理台的 6 个 tab：

1. **概览**：账号数、FAQ 总数、待处理问答、AI 状态、最近审计、工作区快捷入口。
2. **账号管理**：创建/编辑账号、课程分配、重置密码。
3. **操作审计**：按账号、动作、课程、摘要筛选。
4. **AI 用量**：今日/近 7 天调用、Token、失败、Top 用户。
5. **内容运营**：课程 FAQ 分布、校园内容健康度、导入命令。
6. **系统与开发**：健康检查、接口索引、备份/部署命令、上线检查。

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

管理台是同一份前端构建产物，不需要单独部署；只要 `dist/` 更新并重启服务即可。

## 7. 安全与上线检查

- `.env` 权限保持 `600`；管理接口只允许 `is_admin`。
- 纯 HTTP 环境不要设置 `NODE_ENV=production`，否则 Secure Cookie 会让登录态失效。
- 生产 AI 默认 OpenAI 端点不可达；需要同时配 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。
- 新增管理写操作时，必须同时考虑：权限、输入校验、审计、并发 revision、回滚/备份。
- 管理台不直接改写学生问答；日常答疑仍在教师端和校园「校园待处理」完成。管理台只做账号、审计、用量、内容概览与系统信息。

## 8. 后续可以加的功能

- 校园内容批量核实 / 批量设置可信度；
- 审计日志导出 CSV；
- AI 用量按课程/按天筛选、配额调整；
- 账号导入（CSV）与批量分配课程；
- 系统告警（磁盘、内存、备份失败）；
- 权限模板（课程教师 / 校园主理人 / 只读审计）。

新增功能时优先复用现有 API 和组件，不要复制旧 `AdminModal` 的实现。
