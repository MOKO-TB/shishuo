# 校园工具、评测与复核

这篇文档给后续维护校园功能的人：数据从哪来、怎么重新生成、评测门槛是什么、复核怎么跑。

## 1. 文件地图

| 文件 | 作用 |
| --- | --- |
| `src/views/campus/CampusTools.tsx` | 学生端校园工具页（GPA / 校历 / 图书馆 / 地图） |
| `src/data/campusTools.ts` | 校历、图书馆、建筑索引（由脚本生成） |
| `public/campus/map.jpg` | 校园手绘底图（367 KB） |
| `src/data/campusEval.ts` | 校园问答评测集（37 可答 + 4 负例） |
| `dev/eval-campus.mjs` | 校园评测脚本 |
| `dev/import-campus-tools.mjs` | 从引路学长仓库生成工具数据 |
| `server/campus-review.mjs` | 复核状态计算（待核实/过期/即将到期） |
| `dev/check-campus-review.mjs` | 命令行复核报告，可接 cron |
| `src/views/admin/AdminVerificationPanel.tsx` | 管理台「内容核实」页 |

## 2. 数据重新生成

```bash
node dev/import-campus-tools.mjs /path/to/yinlu-xuezhang
```

会生成：
- `src/data/campusTools.ts`：校历 22 条、图书馆 4 条、建筑 36 个
- `public/campus/map.jpg`：从 `frontend/img/campus/map.jpg` 复制

地图坐标基于源图 2559×1279；`CampusTools.tsx` 用百分比定位覆盖框，所以换底图时要同步改 `CAMPUS_MAP.width/height`。

GPA 工具优先使用学生「账号与课表 → 成绩」同步的教务成绩（`src/lib/profile.ts` 的 `scoreStats`），没有成绩时用手动试算；计算只在本机，不上传。

## 3. 校园评测

```bash
npm run eval:campus
```

- 可答问题 Top-1 门槛：85%
- 负例转人工门槛：75%
- 当前基线：37/37（100%）+ 4/4（100%）

新增校园 FAQ 后，先补/改 `src/data/campusEval.ts`，再跑评测；低于门槛脚本以非 0 退出，适合 CI。

负例的意义：学生问“食堂今天有什么菜”“校车几点发车”这类知识卡没有覆盖的问题时，必须转人工，不能硬答。

## 4. 内容复核

- 数据字段：`lastVerifiedAt / reviewIntervalDays / nextReviewAt / verifiedBy`。
- 管理台 `/admin/` →「内容核实」：
  - 待核实、已过期、14 天内到期、正常四类；
  - 标记已核实时写入核实人、周期、下次时间，并清除待核实；
  - 30/90/180/365 天周期可选。
- 服务端每 6 小时检查一次，有未核实/过期内容时每天写一条 `campus-review-due` 审计；同一天只写一次。
- 外部 cron/timer：
  ```bash
  npm run review:campus -- --db /opt/shishuo/data/shishuo.db
  ```
  有待核实/过期时退出码为 1，可接邮件/监控告警。
- 已核实的 D 级卡片会改为 `V-已核实`，前端显示「已核实」；原始来源仍保留在 `sourceChannel/sourceUrl`。

## 5. 管理端入口

```bash
npm run dev
# 主站：http://localhost:5173/
# 管理端：http://localhost:5173/admin/
```

`npm run build` 会输出 `dist/index.html` 和 `dist/admin/index.html`；生产同样访问 `/admin/`。管理端与主站同源、同 Cookie，不需要第二个 Node 进程或端口。
