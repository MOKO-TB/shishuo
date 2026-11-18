# 引路学长 · 校园助手 Web 版 —— 部署到 121.37.30.147

> 目标：把 `MOKO-TB/yinlu-xuezhang` 的**网页版（只读校园问答）**部署到现有服务器，与「师说」并存于同一台机器、同一域名下两个入口。
> 前置结论：**两者代码不能直接合并**（Python agent 引擎 vs Node 后端），但可以**同机并置 + 知识库数据互通**。详见 `合并可行性评估.md`。

---

## 一、这套产物包含什么

| 文件 | 用途 |
|---|---|
| `pack.sh` | 本地执行，产出 `yinlu-src.tar.gz`（排除 venv/测试/大图，约 6–8 MB） |
| `deploy.sh` | **服务器端**一键部署/升级/回滚（幂等，可重复跑） |
| `nginx-campus.conf` | nginx 反代，含 SSE 必需的 `proxy_buffering off` |
| `README-部署.md` | 本文件 |

部署拓扑：

```
公网 8081 ──nginx──> 127.0.0.1:8480  引路学长 web（Python 标准库 HTTP + SSE）
公网 80   ── 现有 ──> 师说（Node + React，保持不动）
```

---

## 二、前置条件（缺一不可）

| # | 条件 | 谁准备 | 说明 |
|---|---|---|---|
| 1 | 服务器 SSH 账号（root 或 sudo） | 你 | 22 端口已开放 |
| 2 | 华为云安全组放行 **TCP 8081** | 你（控制台） | 不放行则外网打不开，应用本身没事 |
| 3 | 一个公网 LLM 的 API Key | 你 | 智谱 GLM 或 DeepSeek；校园内网端点 `10.223.24.16:8080` 在云上**不可达** |
| 4 | 服务器 Python ≥ 3.10 | `deploy.sh` 自动装 | Ubuntu 22.04 自带 3.10 |

> **关键风险**：引路学长内置默认模型是校园内网端点。云服务器访问不到它，必须换成公网 API，否则页面能打开但 AI 一问就报错。这不是可选项。

---

## 三、部署步骤

### 步骤 1 · 本地打包（Windows，Git Bash）

```bash
cd D:/KFGJ/WorkBuddy/projects/yinlu-deploy
bash pack.sh
# 产出 yinlu-src.tar.gz
```

### 步骤 2 · 上传

```bash
scp yinlu-src.tar.gz deploy.sh nginx-campus.conf root@121.37.30.147:/tmp/
```

### 步骤 3 · 服务器执行部署

```bash
ssh root@121.37.30.147
cd /tmp && chmod +x deploy.sh
./deploy.sh /tmp/yinlu-src.tar.gz
```

脚本会依次：装 Python/venv → 建 `yinlu` 系统用户 → 解包到 `/opt/yinlu/releases/<时间戳>` → 建虚拟环境装依赖 → 生成 `/opt/yinlu/config.local.json` → 写 systemd 单元并启动 → 健康检查。

### 步骤 4 · 填 API Key（必做）

```bash
vim /opt/yinlu/config.local.json      # 填 providers[0].api_key 与 model
systemctl restart yinlu-web
```

`base_url` 二选一：
- 智谱：`https://open.bigmodel.cn/api/paas/v4`，model `glm-4.6`
- DeepSeek：`https://api.deepseek.com/v1`，model `deepseek-chat`

> 该文件权限已是 `640 root:yinlu`，不进 git，不随版本回滚。

### 步骤 5 · 配 nginx

```bash
cp /tmp/nginx-campus.conf /etc/nginx/conf.d/yinlu-campus.conf
# 在 /etc/nginx/nginx.conf 的 http{} 内补两行限流区（文件末尾已给出）
nginx -t && systemctl reload nginx
```

### 步骤 6 · 放行安全组

华为云控制台 → 弹性云服务器 → 安全组 → 入方向添加规则：`TCP 8081`，源 `0.0.0.0/0`。

---

## 四、验收（6 条，逐条打勾）

```bash
# 1. 服务在跑
systemctl is-active yinlu-web              # 期望 active

# 2. 本地直连
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8480/          # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8480/bridge-web.js  # 200

# 3. 经 nginx
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/          # 200

# 4. 外网可达（在你本机执行）
curl -s -o /dev/null -w "%{http_code}\n" http://121.37.30.147:8081/      # 200
```

| # | 验收项 | 通过标准 |
|---|---|---|
| 5 | 浏览器打开 `http://121.37.30.147:8081/` | 显示「引路学长」首页，样式正常，无 404 资源 |
| 6 | 提一个校园问题（如"图书馆在哪"） | 有流式回复；若报模型错误 → 回到步骤 4 查 Key |
| 7 | 「师说」原站 | `http://121.37.30.147/` 行为与部署前**完全一致**（本次不动它） |

---

## 五、回滚

```bash
/opt/yinlu/../..//tmp/deploy.sh --rollback    # 若脚本已移到别处
bash deploy.sh --rollback                      # 切回上一版本目录并重启
```

或手工：`ln -sfn /opt/yinlu/previous /opt/yinlu/current && systemctl restart yinlu-web`

停服不影响师说：`systemctl stop yinlu-web`（两个服务完全独立）。

---

## 六、已知风险与限制（部署前必须知情）

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| 1 | **网页版无登录**（作者设计：校园网内完全开放） | 放到公网后任何人可问，只能按 IP 限流 | 已有每 IP 12 次/分 + 全局并发 3 + 每日 2000 次；如需收紧改 `web_server.py` 常量 |
| 2 | 默认模型是校园内网端点 | 云上 AI 不可用 | 换公网 API（步骤 4） |
| 3 | 一次多工具问答实测 30–40 s | 用户以为卡住 | nginx 超时已设 300 s；前端有流式输出 |
| 4 | 宿舍/校园网外的学生也能访问 | 内容合规与成本 | 每日配额 + 用量日志 `web-usage.log` |
| 5 | 前端单文件 792 KB | 首屏慢（弱网） | 已加 nginx 短缓存；后续可拆包 |
| 6 | 首次启动要在能连模型的机器上预热 | 冷启动慢 | deploy 后手动问一次 |

---

## 七、日常运维

```bash
systemctl status yinlu-web          # 状态
tail -f /var/lib/yinlu/server.log   # 日志（已配 logrotate 每日轮转保留 7 天）
bash deploy.sh --status             # 状态 + 健康检查一把梭
bash deploy.sh /tmp/yinlu-src.tar.gz  # 升级（自动保留上一版）
```

---

## 八、升级流程（对应协作规范 §9）

1. 本地 `git pull` 最新 `main`
2. `bash pack.sh`
3. 上传 → `./deploy.sh /tmp/yinlu-src.tar.gz`
4. 跑第四节的 6 条验收
5. 不通过立即 `--rollback`，别现场 debug
