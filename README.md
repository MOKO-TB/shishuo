# 师说 · AI 双通道课后答疑

> AI 先答，老师精答，答案留下来。让每个课后问题都有回响。

面向高校课程的 AI + 教师双通道答疑平台。对应「数字造梦师 · 软件应用赛道」中的 **AI 智能 Agent / Web 应用与小程序工具 / 效率工具与校园数字化服务** 方向。

当前版本已从单机演示升级为**有账号、有数据库、有服务端 AI 网关的多用户试点**，并把课程收缩到 5 门做深：

**高等数学、数据结构、电路、模电、数电。**

学生和教师用不同账号登录同一个共享课程空间，完成「提问 → 检索与判断 → 同题合并 → 转交老师 → 教师回复 → FAQ 沉淀 → 通知同步」的闭环。模型 Key 只保存在服务端，浏览器接触不到。

---

## 1. 现在能做什么

### 学生端
- 选课程提问，可附题目图片；输入时实时提示相近 FAQ 与正在等待的同题组。
- 本地课程检索带出处作答，高 / 中 / 低三档置信度；证据不足时明确拒答，不编“像答案”的东西。
- 知识库没把握时，若服务端 AI 网关已配置，则由网关补充回答并标注“非课程依据”；网关未配置或额度用完时，直接转交老师。AI 补充回答与 AI 导师回答走流式输出（边生成边渲染），回答按 Markdown + KaTeX 公式排版（标题、列表、代码块、引用、`行内代码`）。
- 只上传图片时，由服务端视觉模型识别题干，识别结果先回填输入框，学生确认后再发送。
- 可补充说明、直接「同问」等待中的同题组；老师回复后继续追问、确认「已解决」，或撤下问题重新发起。
- 「我的提问」支持按状态 / 课程筛选；完整档案支持关键词、时间、收藏筛选并导出当前结果 CSV。
- 顶栏铃铛接收转交、同问、老师回复、学生确认等通知，点一条直接打开对应问答。
- 知识详情与问答详情支持「复制链接」生成深链（`#/faq/…`、`#/thread/…`），发给同学或老师直接打开对应内容。
- 账号设置里可开启「老师回复时邮件提醒我」：老师回复后服务端发一封提醒邮件（需配置 SMTP；未开启或未配置时只走站内铃铛）。
- 「复习卡」错题本：把收藏、负反馈、已解决和「还没会」过的问题组成一轮自测；「还没会」按账号记次数，下次排在前面。
- 提问框支持语音输入：点「语音」说出题目（中文），识别结果实时回填输入框，可再手动修改；仅 Chrome / Edge 支持，其他浏览器自动隐藏入口。
- 顶栏可切换深色 / 浅色模式，选择按浏览器记住；390px 起移动端自适应（底部导航、卡片堆叠、弹窗单列）。
- 左侧「AI 导师」默认提供 5 位试点导师，点「管理导师」可从 32 位导师库添加线代等扩展导师，也可随时移除；列表按账号保存在本机，添加后立即进入 AI 老师切换器。所有导师都提供课程地图、卡点诊断、先修检查、关键一步、误区与迁移题；扩展导师只做导师答疑，不进入 5 门试点课程问答。
- 数电抽屉带数制 / 补码、3/4 变量卡诺图、D 触发器 / 计数器时序波形；模电抽屉带 Q 点、共射小信号、反馈组态判断。

### 教师端
- 每个教师账号绑定一位试点课程教师；待办按语义同题自动合并，同问同学进入同题组。
- 追问会带上一次回复；AI 提供检索依据与回复草稿；教师可一次回复整组并沉淀为课程 FAQ。
- 回复可撤回：问题回到待办，本次沉淀或更新的 FAQ 按快照回滚。
- 课程知识库支持搜索、筛选、新增、编辑、删除、别名与章节维护，以及 CSV / JSON 批量导入导出。
- 编辑 FAQ 时可让 AI 建议检索别名与标签，点一下加入，让学生的口语问法更容易命中。
- 负反馈闭环：同一 FAQ 近期累计 2 次「还不够」后自动标记待完善、降低后续检索置信度并通知教师；教师编辑保存后计数清零。
- 知识缺口可一键生成 FAQ 草稿；答疑洞察显示 AI 解决率、教师首响、重复合并、置信度分布、课程覆盖与章节卡点热力（按提问引用的章节统计哪里最难）。
- 仅教师账号可以重置共享演示空间；学生账号看不到重置入口。

### 邮箱验证与自助找回
- 学生注册需要邮箱验证码，验证通过后自动登录；管理员创建的账号不走邮箱验证。
- 登录页「忘记密码？」输入注册邮箱、邮箱验证码和新密码，即可自助重置；重置成功后所有旧会话立即失效。
- 验证码 6 位、10 分钟有效、只能使用一次；同一邮箱 60 秒内不能重复发送，15 分钟最多 5 次，连续输错 5 次失效。
- 本地没有 SMTP 时默认进入开发邮件模式：验证码打印到服务端日志，同时显示在登录页，方便直接试用。
- 生产环境配置 `SMTP_HOST` / `MAIL_FROM` 后走真实 SMTP；`MAIL_DEV_MODE` 在 production 下不生效。

### 管理员后台
- `teacher@shishuo.local`（陈砚）同时是试点管理员，顶栏与侧栏都有「账号与审计」入口。
- 查看全部学生 / 教师账号，新建教师或学生账号，给教师分配 5 门试点课程中的任意组合。
- 修改账号姓名与课程分配；修改课程后，该教师的数据投影和待办立即切换。
- 重置任意账号密码；被重置账号的旧会话立即失效，需用新密码重新登录。
- 操作审计：记录管理员建号 / 改课 / 重置密码，以及学生提问、转交、反馈、老师回复、撤回回复、FAQ 编辑、重置空间和越权拒绝等操作，显示操作人、课程、revision 与时间。
- AI 用量看板：今日 / 近 7 天调用次数、token 与失败数、按天用量条形图、调用最多的账号排行。

### 账号与共享空间
- 邮箱 + 密码注册 / 登录；注册需要邮箱验证码，忘记密码可凭邮箱验证码自助重置。密码用 scrypt 加盐哈希，登录态放在 HttpOnly Cookie 中，有效期 7 天。
- 共享工作区保存在服务端 SQLite；学生提问、教师回复、FAQ、通知等在两个浏览器间自动同步。
- 状态轮询间隔约 3.5 秒，先探轻量的 `/api/state/revision`，revision 没变就不拉全量工作区；保存采用 600ms 防抖和 revision 乐观锁。
- 学生资料（姓名、学院、专业、学号、课表、成绩、老师显示设置）按账号保存在服务端。
- 题目图片先压缩，再上传到 `data/uploads`；工作区只保存 `/uploads/...` URL，不把 base64 大图塞进状态文档。
- 教务系统登录态仍然只留在本机，不进入师说服务端。

---

## 2. 本期 5 门试点课程

| 课程 | 任课教师（演示） | 教师演示账号 | 导师侧重点 |
|---|---|---|---|
| 高等数学 | 李芸 | `teacher.math@shishuo.local` | 极限、导数、积分、级数、多元微积分；12 章课程地图 |
| 数据结构 | 陈砚 | `teacher@shishuo.local` | 复杂度、线性表、树、图、查找、排序、动态规划 |
| 电路 | 石岩 | `teacher.circuit@shishuo.local` | 参考方向、KCL / KVL、等效、戴维南、动态电路 |
| 模电 | 陆衡 | `teacher.analog@shishuo.local` | 二极管、三极管、Q 点、小信号、反馈、运放 |
| 数电 | 顾明 | `teacher.digital@shishuo.local` | 数制、逻辑代数、门电路、组合 / 时序逻辑、ADC / DAC |

导师内容由公开课字幕离线提炼，使用虚构导师姓名与任课教师姓名，不冒充任何真实主讲人，也不复制声音、形象、口头禅或逐字稿。原始字幕只用于离线处理，已从仓库删除、不入库。

5 门试点课目前共 **81 条课程 FAQ**（高等数学 16、数据结构 20、电路 14、模电 15、数电 16），覆盖极限、树与图、电路定理、放大电路、组合 / 时序逻辑等核心章节。每条 FAQ 带章节、标签和检索别名，内容集中在 [src/data/pilotFaqs.ts](file:///D:/100h/jiaoshi%20ai/src/data/pilotFaqs.ts)，种子版本已升到 18。

### 检索评测

新增可重复运行的评测集 [src/data/pilotEval.ts](file:///D:/100h/jiaoshi%20ai/src/data/pilotEval.ts)：157 个问题，包含 132 个应命中指定 FAQ 的问题和 25 个应转人工的边界问题。评测复用真实检索代码，检查 Top-1 命中、低置信转人工和失败明细：

```bash
npm run eval:retrieval
```

当前 5 门课全部通过（157/157，100%）。评测失败时会以非 0 退出码结束，便于后续改内容时做回归。

检索的「未覆盖术语」判定按课程使用分桶的领域词表（[src/data/domainTerms.ts](file:///D:/100h/jiaoshi%20ai/src/data/domainTerms.ts)）：词条取自对应课程 FAQ 的问题 / 答案 / 标签，保证应命中的问题不会因为术语误判而被强制转人工。

> 种子从 17 升到 18。已有旧演示工作区需要在教师端重置一次，才能加载新增 FAQ；正式部署应改为数据库内容迁移。仓库里仍保留其余 27 门课程的导师与 FAQ 资料：课程问答 / 知识库 / 教师待办通过 `src/data/pilot.ts` 的 `PILOT_COURSE_IDS` 白名单只展示上述 5 门，其余导师可在「AI 导师 → 管理导师」中自行添加或移除，用于导师答疑。新增正式试点课程时，需要同时更新客户端白名单和服务端 `server/policy.mjs`。

### 校园知识库（引路学长）

学生端新增「校园生活」入口，内置 73 条校园经验卡，覆盖考研、实习就业、学业规划、竞赛、证书、心理情绪、校园生活 7 个分类。数据来自 [MOKO-TB/yinlu-xuezhang](https://github.com/MOKO-TB/yinlu-xuezhang) 的 `kb/knowledge.json`（MIT License），采集于 2026-10-31，许可证原文见 [LICENSES/yinlu-xuezhang-MIT.txt](file:///D:/100h/jiaoshi%20ai/LICENSES/yinlu-xuezhang-MIT.txt)。

- 每条卡片保留 `category / tags / credibility / source_channel / source_url`；页面明确区分「官方来源」「教师回复」「待核实」，60 条待核实内容仅供参考。
- 学生端支持搜索、分类筛选、可信度筛选、可信优先 / 待核实优先排序；可以直接提问，先查校园 FAQ，没把握时转交校园主理人。
- 教师端「校园知识库」提供运营视角：待核实统计、待处理队列、回复并沉淀 FAQ、编辑可信度/来源/答案、导出 CSV。
- 校园域复用课程 FAQ / 问答 / 权限模型，但使用独立的 `campus` 课程 ID，不进入 5 门课程白名单；普通课程老师看不到校园问答，管理员兼任校园主理人。
- 现有工作区导入：`node dev/import-campus-faqs.mjs --db <db> --apply --backup-dir <dir>`（幂等，只补缺失 ID）。
- 重新生成数据：`node dev/import-campus-kb.mjs /path/to/yinlu-xuezhang/kb/knowledge.json`（同时生成 `src/data/campusKb.ts` 和 `server/data/campus-faqs.json`）。

### 管理台（Admin Console）

管理员登录后，左侧「管理台」进入全页管理端，与学生端 / 教师端并列：概览、账号管理、风控审核、操作审计、AI 用量、内容运营、系统与开发。前端代码集中在 `src/views/admin/`，服务端接口在 `server/api.mjs` 的 `/api/admin/*`；全量内容统计走 `/api/admin/workspace-summary`，不依赖管理员本人的课程投影。

「风控审核」是服务器后台能力：维护敏感词表（学生提问、转交、补充和 AI 调用都会过词表）、审核/撤下违规图片、禁言或封禁学生/教师、查看内容队列。禁言和封禁在服务端强制执行，不只是前端隐藏按钮。

开发说明、接口索引、新增面板步骤和安全检查见 [docs/admin-console.md](docs/admin-console.md)。

---

## 3. 架构

```text
Browser (React 19 + Vite)
        │  same-origin /api/*
        ▼
Node HTTP server (server/index.mjs)
        ├─ /api/auth        注册、登录、会话
        ├─ /api/state       共享工作区读写（revision 乐观锁）
        ├─ /api/threads     动作 API：提问 / 转交 / 回复 / 撤回等事务化动作
        ├─ /api/faqs        动作 API：FAQ 增改删
        ├─ /api/profile     学生资料
        ├─ /api/admin       账号管理、课程分配、密码重置、审计
        ├─ /api/uploads     题目图片对象存储
        ├─ /api/ai/status   网关状态与当日额度
        ├─ /api/ai/chat     服务端 AI 网关（注入 Key）
        └─ /api/health
        │
        ├─ SQLite（node:sqlite）  users / sessions / workspaces / ai_usage / uploads / audit_log / email_codes / workspace_entities / archived_threads
        ├─ data/uploads       压缩后的题目图片
        ├─ SMTP / 开发邮件     注册验证码、重置密码验证码
        └─ AI provider（OpenAI 兼容 /chat/completions）
```

- **开发模式**：`npm run dev` 同时启动 Node API（默认 8787）和 Vite（默认 5173）。Vite 只代理 `/api/auth`、`/api/state`、`/api/profile`、`/api/ai`、`/api/health`；教务代理 `/api/jw/*` 仍走本机 Playwright 插件。
- **生产模式**：`npm run build && npm start`，由 Node 服务在 8787 同时托管 `dist/` 与 API，SPA 路由回退到 `index.html`。
- **数据库**：默认 `data/shishuo.db`，启用 WAL。工作区目前以一个 JSON 文档整体保存，适合试点规模，便于快速迭代。
- **AI 网关**：前端不再需要 API Key；服务端从环境变量读取，统一注入上游请求，并记录模型、token 用量、状态码与调用时间。

---

## 4. 快速开始

要求 Node 24+（使用内置 `node:sqlite`；Node 22.5+ 也可，但建议 24）。

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

打开 `http://localhost:5173/`。API 默认在 `http://127.0.0.1:8787`。

### 演示账号

首次启动会自动创建（可通过 `SHISHUO_DEMO_ACCOUNTS=0` 关闭）：

| 角色 | 邮箱 | 密码 | 姓名 |
|---|---|---|---|
| 学生 | `student@shishuo.local` | `student123` | 林晓 |
| 学生 | `student2@shishuo.local` | `student123` | 周可 |
| 教师 / 管理员 | `teacher@shishuo.local` | `teacher123` | 陈砚（数据结构） |
| 教师 | `teacher.math@shishuo.local` | `teacher123` | 李芸 |
| 教师 | `teacher.circuit@shishuo.local` | `teacher123` | 石岩 |
| 教师 | `teacher.analog@shishuo.local` | `teacher123` | 陆衡 |
| 教师 | `teacher.digital@shishuo.local` | `teacher123` | 顾明 |

登录页可以一键填入学生或主教师账号；其余教师账号见上表。演示账号由服务端直接创建，不需要邮箱验证码；新注册学生需要验证邮箱。演示密码只用于本地试点，正式部署请设置 `SHISHUO_DEMO_ACCOUNTS=0` 并删除演示数据库。

### 配置邮件（验证码与找回密码）

本地开发可以先不配 SMTP：服务端会打印验证码，登录页也会显示「本地开发验证码」。生产环境配置：

```ini
AUTH_SECRET=一串固定的长随机字符串
SMTP_HOST=smtp.example.edu.cn
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=no-reply@example.edu.cn
SMTP_PASS=...
MAIL_FROM=师说 <no-reply@example.edu.cn>
MAIL_DEV_MODE=0
```

- `AUTH_SECRET` 用于验证码 HMAC；不设置时每次重启生成随机值，旧验证码立即失效。
- 生产环境即使误设 `MAIL_DEV_MODE=1` 也不会回显验证码。
- 未配置 SMTP 且不在开发模式时，注册和自助找回会返回 503，不会静默失败。

### 配置服务端 AI 网关

编辑 `.env`：

```ini
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...
AI_DAILY_LIMIT=120
AI_DAILY_LIMIT_STUDENT=120
AI_DAILY_LIMIT_TEACHER=120
AI_BLOCKLIST=
AI_TIMEOUT_MS=95000
```

- `AI_DAILY_LIMIT_STUDENT` / `AI_DAILY_LIMIT_TEACHER` 按角色覆盖每日额度；不填回落 `AI_DAILY_LIMIT`。
- `AI_BLOCKLIST` 填逗号分隔的审核词（如 `词1,词2`），用户提问命中即返回 400；留空关闭。
- 发往上游的提示词会自动脱敏：邮箱、手机号和带「学号 / QQ / 电话」等标签的编号替换为占位符。

### 配置对象存储（可选，默认本地磁盘）

题目图片默认写 `data/uploads` 并由 `/uploads/*` 静态托管。设置 `STORAGE_DRIVER=s3` 后改写入任意 S3 兼容服务（AWS S3、MinIO、OSS 兼容模式），AWS SigV4 签名在服务端本地实现（`server/storage.mjs`），已用 AWS 官方测试套件向量对拍：

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.cn-north-1.amazonaws.com.cn
S3_REGION=cn-north-1
S3_BUCKET=shishuo-uploads
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# 可选：CDN / 自定义域名，不填用 endpoint/bucket 拼接对象 URL
S3_PUBLIC_BASE=
```

- 凭证不全会自动回落本地磁盘，不影响启动。
- 工作区保存对象 URL（`S3_PUBLIC_BASE` 或 `endpoint/bucket/key`），对象需可匿名读或经 CDN 鉴权，口径与本地驱动的「随机地址」一致。
- 已上传的历史对象不受切换影响：本地文件仍由 `/uploads/*` 托管。

- Key 只从服务端环境变量读取，**绝不下发浏览器、不写入数据库、不写日志**。
- 图片识别需要 `AI_MODEL` 支持视觉输入。
- 不填 `AI_API_KEY` 时，网关状态显示“未配置”，低置信问题直接转交老师；核心闭环仍可完整演示。
- `.env` 已在 `.gitignore` 中，不要提交真实密钥。

### 生产 / 局域网运行

```bash
npm run build
npm start
```

默认监听 `127.0.0.1:8787`。局域网演示可设置：

```ini
HOST=0.0.0.0
PORT=8787
```

如果通过 HTTPS 访问，设置 `COOKIE_SECURE=1`。`NODE_ENV=production` 时也会自动启用 Secure Cookie；在本地 HTTP 下不要设置 `NODE_ENV=production`，否则浏览器不会保存登录态。

---

## 5. 双账号演示路径

1. **学生浏览器**：打开登录页 → 填学生演示账号 → 进入学生端。
2. 选「数据结构」→ 问一个知识库没有的问题，例如「红黑树删除后，为什么要向兄弟节点借黑色节点？」→ AI 低置信拒答并自动转交陈砚老师。
3. **教师浏览器**（另一个浏览器或无痕窗口）：登录 `teacher@shishuo.local` → 进入陈砚老师待办台。
4. 打开新出现的同题组 → 查看 AI 依据与草稿 → 修改回复 → 勾选「回复后沉淀为课程 FAQ」→「发送并沉淀」。
5. **学生浏览器**：等待约 3.5 秒自动同步 → 打开「我的提问」或铃铛通知 → 看到陈砚老师回复。
6. 学生确认「已解决」、继续追问或给负反馈，教师端会同步收到通知 / 待完善标记。

若演示其他课程，用对应教师账号登录：高数李芸、电路石岩、模电陆衡、数电顾明。

### 服务端 AI 演示

配置 `AI_API_KEY` 后，在提问框底部点「服务端 AI 已开」可看到网关模型与当日额度，也可测试连通性。低置信问题会先得到服务端 AI 补充；只上传图片时会先识别题干。

---

## 6. API 与数据

### 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 存活、AI 是否配置、工作区 revision |
| `POST` | `/api/auth/email-code` | 发送注册 / 重置密码邮箱验证码 |
| `POST` | `/api/auth/register` | 学生注册（需邮箱验证码）；教师注册还需 `TEACHER_INVITE_CODE` |
| `POST` | `/api/auth/reset-password` | 用邮箱验证码重置密码并注销旧会话 |
| `POST` | `/api/auth/login` | 登录，设置 HttpOnly Cookie |
| `POST` | `/api/auth/logout` | 退出并清除会话 |
| `GET` | `/api/auth/me` | 当前用户，未登录返回 `{ user: null }` |
| `GET` | `/api/state` | 共享工作区 + revision |
| `GET` | `/api/state/revision` | 轻量版本探测，轮询先打它，没变化不拉全量 |
| `POST` | `/api/threads` | 动作：学生新建提问（ask / same / follow-up） |
| `POST` | `/api/threads/:id/escalate` | 动作：学生把 AI 问答转交老师 |
| `POST` | `/api/threads/:id/feedback` | 动作：学生反馈有帮助 / 不够清楚 |
| `POST` | `/api/threads/:id/resolve` | 动作：学生确认 / 撤销已解决 |
| `POST` | `/api/threads/:id/withdraw` | 动作：学生撤下 / 重新发起 |
| `POST` | `/api/threads/:id/favorite` | 动作：收藏 / 取消收藏 |
| `POST` | `/api/threads/:id/supplement` | 动作：学生补充老师要求的信息 |
| `POST` | `/api/threads/:id/reply` | 动作：教师回复（可带整组 threadIds 与沉淀 FAQ） |
| `POST` | `/api/threads/:id/undo-reply` | 动作：教师撤回回复 |
| `POST` | `/api/threads/:id/request-info` | 动作：教师请求补充 |
| `POST` | `/api/threads/:id/withdraw-request` | 动作：教师撤回补充要求 |
| `POST` | `/api/faqs` · `PUT/DELETE /api/faqs/:id` | 动作：教师新增 / 编辑 / 删除 FAQ |
| `POST` | `/api/notifications/read` | 动作：批量标记通知已读 |
| `PUT` | `/api/state` | 提交当前账号可见的工作区；服务端按角色 / 课程 / 字段合并，越权返回 403；`baseRevision` 不一致返回 409 和最新数据 |
| `PUT` | `/api/profile` | 保存当前账号的学生资料 |
| `POST` | `/api/uploads/image` | 上传压缩后的题目图片，返回 `/uploads/...` URL |
| `GET` | `/api/admin/users` | 管理员查看账号与学生 / 教师数量 |
| `POST` | `/api/admin/users` | 管理员新建学生或教师账号并分配课程 |
| `PATCH` | `/api/admin/users/:id` | 修改姓名 / 教师课程分配 |
| `POST` | `/api/admin/users/:id/password` | 重置密码并注销目标账号旧会话 |
| `GET` | `/api/admin/audit` | 管理员读取最近操作审计 |
| `GET` | `/api/admin/ai-usage` | 管理员读取 AI 网关用量统计（按天 / 按账号） |
| `GET` | `/api/admin/archived-threads` | 管理员读取归档问答列表 |
| `GET` | `/api/ai/status` | 网关配置、模型、今日用量、额度 |
| `POST` | `/api/ai/chat/completions` | 服务端 AI 网关，需登录 |

### 数据表

- `users`：账号、角色、scrypt 密码哈希、学生资料 JSON、教师分配课程 `courses_json`、管理员标记 `is_admin`。
- `sessions`：会话 token 的 SHA-256 哈希、过期时间。
- `workspaces`：共享工作区 JSON、revision、最后修改人。
- `ai_usage`：每次模型调用的用户、模型、token、状态码、时间。
- `uploads`：图片 ID、上传人、MIME、字节数与时间；文件本体在 `data/uploads`。
- `audit_log`：账号操作与工作区写入的动作、课程、revision、操作人和时间。
- `email_codes`：邮箱、用途、验证码 HMAC、过期时间、错误次数和一次性消费时间。
- `workspace_entities`：工作区实体镜像（问答 / FAQ / 通知 / 课程公告按行落库），每次成功写入在事务内对齐，供 SQL 查询与后续动作 API 迁移。
- `archived_threads`：归档问答原文；`npm run maintain:archive` 把 90 天（可配 `ARCHIVE_DAYS`）前已结束的问答移出工作区 JSON 存到这里，管理员可在后台查看。

### 权限模型

权限校验在服务端执行，不依赖前端隐藏按钮：

- **可见数据投影**：`GET /api/state` 只返回当前账号可见的数据。
  - 学生：自己的问答 + 本课程仍在等待老师的同问；本课程 FAQ；发给自己的通知。
  - 教师：账号所分配课程的问答、FAQ，以及该课程的回复通知；其他课程数据不返回。
- **学生写入**：只能新增自己的提问 / 同问 / 追问，修改自己的反馈、已解决、撤下、收藏和转交补充；不能改写 FAQ 正文，不能伪造老师回复，不能修改其他同学的问答或通知，不能重置共享空间。
- **教师写入**：只能在 `users.courses_json` 分配的课程内回复、撤回回复、新增 / 编辑 / 删除 FAQ；不能修改学生问题、引用、收藏或其他课程数据，不能新增 / 删除学生问答。
- **通知**：学生只能标记自己的通知为已读；教师只能标记自己的教师通知为已读，并只能为回复过的问题创建 / 撤回对应的学生通知。
- **重置 / 恢复**：只有教师账号可以执行，且重置载荷必须覆盖 5 门试点课程和完整课程知识；学生调用返回 403。
- **启动例外**：共享空间第一次为空时，首个登录账号会用前端种子初始化工作区；初始化完成后立即进入上述投影与校验流程。正式部署可改为服务端离线种子。
- **课程分配**：教师账号的 `courses_json` 决定可写范围；种子账号已按 5 门课分配。教师自助注册需要管理员邀请码，并会被分配至少一门试点课程。

### 并发口径

两个账号同时编辑时，服务端以 revision 为准。落后的一方会收到 409，客户端载入最新共享空间。写入时服务端只接受当前账号可见实体的合法变化，并保留它看不到的其他课程 / 其他同学数据；不做字段级三方合并。

---

## 7. 安全与边界

- **密码**：scrypt 加盐哈希，登录比较使用 timing-safe 方式。
- **邮箱验证码**：服务端生成 6 位验证码，使用 `AUTH_SECRET` 做 HMAC 后入库；数据库不存明文。验证码 10 分钟过期、一次性消费、最多尝试 5 次；发送有 60 秒冷却和 15 分钟 5 次限制。
- **自助找回**：重置成功后删除该账号全部会话；未知邮箱发送验证码时返回与已注册邮箱相同的响应形态，避免账号枚举。
- **会话**：随机会话 token，数据库只存哈希；Cookie 为 `HttpOnly; SameSite=Lax; Path=/`，HTTPS 下加 `Secure`。
- **CSRF**：所有写操作校验 `Origin` 与 Host 一致；开发环境通过同源 Vite 代理。
- **权限**：学生与教师账号角色隔离；服务端按账号投影可见数据，并对写入做角色 / 课程 / 字段级校验。学生不能改 FAQ、老师回复或他人问答；教师只能操作已分配课程，不能改写学生问题或新增 / 删除问答；重置与恢复仅教师可用；账号管理、课程分配、密码重置与审计仅 `is_admin` 账号可用。
- **教师身份**：账号可以独立于课程教师姓名；回复和 FAQ 使用课程绑定的教师身份，审计记录实际管理员 / 教师账号。一个账号可以分配多门课程。
- **图片**：上传需要登录和同源校验；文件头需与 MIME 匹配，单张压缩后不超过 2MB，文件名随机；工作区只保存 URL。上传文件默认人人可读（随机地址），不用于存放敏感证件。
- **审计**：所有工作区写入、账号创建 / 改课 / 密码重置和越权拒绝都写入 `audit_log`；审计不保存密码、Key 或完整请求体。
- **AI Key**：只存在服务端环境变量；请求体不记录、不返回。
- **AI 治理**：每日额度按角色独立（`AI_DAILY_LIMIT_STUDENT` / `AI_DAILY_LIMIT_TEACHER`，缺省回落 `AI_DAILY_LIMIT`）；发往上游前做敏感信息脱敏（邮箱、手机号、带「学号 / QQ / 电话」等标签的编号替换为占位符，不碰普通数学数字）；`AI_BLOCKLIST` 配置内容审核词表，命中直接拒绝调用（留空关闭）。
- **动作 API**：与整包同步共享同一套 `authorizeAndMerge` 校验和 revision 乐观锁，越权动作同样写审计并返回 403。
- **演示数据**：课程、教师、学生与统计均为虚构演示数据；不冒充真实授课老师，不宣称完整观看过公开课。
- **原始素材**：B 站原始字幕、临时抓取脚本和浏览器登录态均不入库；`.env`、`data/`、`.tmp-gh/`、`.jw-profile/` 已忽略。
- **教务**：课表 / 成绩的登录态仍只在本机浏览器配置中，不经师说服务端；教务读取依赖本机 Edge/Chrome。
- **当前未做**：真实 SMTP 服务商 / 校内邮件网关回归、S3 / OSS 等外部对象存储、多节点部署、真实 AI 供应商回归测试。

---

## 8. 验证记录

在本地用两个独立 Edge 上下文完成：

- 学生登录 → 提问低置信问题 → 自动转交；
- 教师登录 → 看到待办 → 回复并沉淀；
- 学生端约 3.5 秒内收到回复与通知；
- 服务端 409 并发冲突返回最新 revision；
- 权限回归：学生改 FAQ / 他人问答 / 伪造老师回复 / 重置、教师跨课程写、教师改学生问题、学生篡改通知、学生虚增 FAQ 计数均返回 403；
- 正常写入：学生新建问答、反馈、确认解决、撤下 / 重新发起、同问及同组通知，教师回复 / 撤回 / 编辑 FAQ / 重置，均通过服务端合并；
- 可见性投影：学生只拿到自己的问答 + 本课程待答同问 + 自己的通知；陈砚账号只拿到数据结构，李芸账号只拿到高等数学；
- 管理员后台：新建教师、分配 / 修改课程、重置密码并注销旧会话；被新建的教师账号能登录，并以所分配课程的教师身份回复；非管理员访问后台返回 403；
- 操作审计：建号、改课、重置密码、工作区同步、越权拒绝均能被管理员读取；
- 邮箱验证码：无验证码注册被拒；验证码以 HMAC 入库；注册、错误码、冷却、过期、一次性消费、未注册邮箱防枚举均验证；重置密码后旧会话失效、新密码可登录；
- 邮件 UI：注册页显示验证码并可填入；忘记密码完成「发码 → 重置 → 新密码登录」；浏览器无控制台错误；
- 图片上传：PNG 魔数校验、2MB 限制、随机 `/uploads/...` URL、静态访问；学生提问后工作区只保留 URL，不保留 base64；
- 用本地 mock 上游验证 AI 网关：客户端传入的模型名被忽略，服务端固定使用 `AI_MODEL`；正确注入服务端 Key；支持图片 Data URL；额度用尽返回 429；token 用量写入 `ai_usage`；
- 学生端图片识别、AI 补充回答、AI 导师回答均走服务端网关；
- 课程内容：5 门课 81 条 FAQ，学生端能命中新增 AVL 问答，知识库显示章节、标签和作者；
- 检索评测：157 个问题（132 可答 + 25 应转人工）全部通过，`npm run eval:retrieval` 可重复运行；
- 权限回归已自动化：`npm run test:api` 在临时数据库上起服务端，覆盖学生改 FAQ / 虚增计数 / 改他人问答 / 伪造老师回复 / 重置空间 / 越权通知、教师跨课程写 / 改学生问题 / 改写已发回复、409 并发冲突、可见性投影、审计写入、实体镜像与归档链路、动作 API 全链路（提问 → 转交 → 回复 → 撤回、反馈 / 收藏 / 已解决 / 通知已读、FAQ 增改删、越权与过期版本）、按角色配额与审核词表与脱敏断言，共 33 项；
- 对象存储：SigV4 签名与 AWS 官方测试套件 3 个向量逐字对拍通过（get-vanilla / empty-query-key / header-value-trim）；用进程内 mock S3 完成「登录 → 上传图片 → 签名 PUT → 对象字节一致」端到端验证；S3 缺凭证自动回落本地磁盘；
- 深色模式与移动端在浏览器里做过截图体检：桌面双主题、390px 移动端首屏 / 列表 / 复习卡弹窗均正常；
- `npm run build` 通过；生产静态托管、SPA 回退、缺失资源 404 均验证。

真实 AI 供应商 Key 未参与测试，也不应提交到仓库。上游模型名、视觉能力、账号额度与网络策略仍以实际服务商为准。

邮件部分当前用开发模式验证（验证码打印到服务端并回显登录页）；真实 SMTP 需要配置 `SMTP_HOST` / `MAIL_FROM` 后做一次投递回归。

---

## 9. 项目结构

```text
server/
  index.mjs        HTTP 服务、静态托管、启动与演示账号
  api.mjs          路由、鉴权、工作区、AI 网关
  actions.mjs      动作 API 的载荷构建（最小变更 → authorizeAndMerge 校验）
  permissions.mjs  角色 / 课程 / 字段校验、可见数据投影与合并
  maintenance.mjs  工作区实体镜像与问答归档
  redact.mjs       AI 提示词敏感信息脱敏
  storage.mjs      题目图片对象存储（本地磁盘 / S3 兼容驱动 + SigV4 签名）
  audit.mjs        操作摘要与审计日志
  policy.mjs       试点课程与教师课程分配
  auth.mjs         密码哈希、会话、Cookie
  mail.mjs         SMTP / 开发邮件发送
  email-codes.mjs  验证码签发、HMAC、冷却与校验
  http-error.mjs   HTTP 错误类型
  db.mjs           SQLite schema、迁移与演示账号
  config.mjs       .env 与运行配置
  dev.mjs          同时启动 API 与 Vite
src/
  auth.tsx         登录态与资料注入
  store.tsx        服务端加载、轮询、防抖保存、revision 冲突
  views/           视图入口 + 按「端」拆分的子模块（见下方说明）
    student/       学生端专属模块
      StudentRail.tsx    右侧栏（今日答疑 / 课程表 / 等老师 / 知识库热度 / 教师信息）
    teacher/       教师端专属模块
      TeacherQueue.tsx   待办台主区（筛选工具栏 + 待处理 / 等补充 / 已处理列表）
      TeacherRail.tsx    右侧栏（知识缺口 / 试点节省 / 知识库状态）
      types.ts          教师端共享状态类型（WorkTab / QueueFilter / 视图输入契约）
    StudentView.tsx     学生端入口（装配 + 状态编排，提问区 AskPanel 在此）
    TeacherView.tsx     教师端入口（装配 + 状态编排）
    KnowledgeView.tsx   课程知识库（跨端通用）
    InsightsView.tsx    答疑洞察（跨端通用）
    AboutView.tsx       方案说明（跨端通用）
  components/      登录页、布局、答卡、回复抽屉、FAQ、通知、导师抽屉、教学工具、账号后台
  components/AdminModal.tsx  账号管理、课程分配、密码重置、审计
  data/seed.ts     课程、FAQ、演示数据
  data/pilot.ts    5 门试点课程白名单
  data/pilotFaqs.ts  81 条试点课程 FAQ（章节、别名、标签）
  data/pilotEval.ts  157 条检索评测用例
  data/domainTerms.ts  按课程分桶的领域术语表
  lib/engine.ts    检索、置信度、别名匹配、聚类、草稿、知识缺口
  data/*Mentors.ts 导师档案与课程地图
  lib/ai.ts        服务端 AI 网关客户端
  lib/mentorSelection.ts  AI 导师启停、选择与按账号保存
  lib/profile.ts   学生资料与服务端持久化
  lib/speech.ts    语音输入（Web Speech API）
  lib/theme.ts     深浅色主题
  styles/          设计 tokens 与页面样式
dev/jw-proxy.ts       本机教务 Playwright 代理（仅开发 / 预览）
dev/eval-retrieval.mjs 5 门课检索评测脚本
dev/test-api.mjs      权限回归测试（node:test 打本地 API，独立临时库）
dev/archive-threads.mjs 归档维护脚本（配合 npm run maintain:archive）
dev/deploy/           部署辅助脚本（paramiko：ssh 执行 / base64 上传，凭据走环境变量，不落盘）
data/uploads/         题目图片对象存储（运行时生成，已 gitignore）
```

**按「端」拆分的设计**：`src/views/` 下用 `student/` 和 `teacher/` 两个目录分别承载学生端、教师端的专属模块，`StudentView` / `TeacherView` 作为入口只做装配与状态编排，把自洽的大块展示逻辑下沉到各自子模块。这样改学生端只进 `student/`、改教师端只进 `teacher/`，互不影响。两端共用的能力（`store` / `types` / `lib` / `components`）保持在同一层共享，不做重复拆分。学生端提问区（AskPanel）因与视图状态高度耦合，保留在 `StudentView` 内编排。

常用命令：

```bash
npm run dev        # API 8787 + Vite 5173
npm run dev:api    # 只启动 API
npm run dev:web    # 只启动 Vite（需另开 API）
npm run build          # 类型检查 + 生产构建
npm run eval:retrieval # 5 门课检索评测（157 个问题）
npm run test:api       # 权限回归测试（33 项，起临时数据库）
npm run maintain:archive  # 归档 N 天前已结束的问答（ARCHIVE_DAYS，默认 90）
npm start              # 托管 dist + API，默认 8787
```

---

## 10. 后续优先级

1. **前端迁移到动作 API**：服务端事务化动作接口已全部落地（`/api/threads`、`/api/faqs`、`/api/notifications/read`，与整包同步共享校验），下一步把前端各写入路径逐个切换到动作接口，最终淘汰整文档 PUT。
2. **对象存储收尾**：S3 兼容驱动与 SigV4 签名已落地（本地验证充分），接入真实云桶后剩余工作为存量对象迁移与生命周期策略。
3. **真实教学接入**：校内统一身份认证、选课名单、班级隔离知识库、校内模型与向量库。
4. **多节点部署**：SQLite 换成 PostgreSQL / MySQL，会话与额度改为共享存储。

演示数据只用于验证产品逻辑与交互，不代表真实教学成效。
