import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CircleAlert,
  ImagePlus,
  KeyRound,
  Layers3,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useStore } from '../store'
import {
  averageFirstResponseMinutes,
  durationLabel,
  formatNumber,
  percent,
} from '../lib/utils'
import { Badge, BrandMark, Seal } from '../components/ui'

interface AboutViewProps {
  onEnterStudent: () => void
  onEnterTeacher: () => void
}

const pains = [
  {
    number: '01',
    title: '课后问题，断在群里',
    body: '下课铃一响，问题就散进群聊和私聊。学生怕打扰老师，老师也未必看得到；很多问题最后变成“算了，不问了”。',
    quote: '“想问，但不知道什么时候问、找谁问。”',
  },
  {
    number: '02',
    title: '老师的时间，被重复切碎',
    body: '同一道题一晚上答五遍，每遍都要重新看题、组织语言。真正需要个别辅导的同学，反而排不上。',
    quote: '“不是不愿意答，是答不过来。”',
  },
  {
    number: '03',
    title: '答案留不下来，下一届再问一遍',
    body: '群消息刷屏，好的讲解两小时后就翻不到了。老师写过的好答案，没有变成课程资产。',
    quote: '“每年都在从零回答同一批问题。”',
  },
]

const loopSteps = [
  {
    index: '01',
    icon: MessageCircle,
    title: '学生提问',
    body: '选课程、描述卡点，可选匿名；输入时先提示相近知识与同题组。AI 先接住，不用等老师在线。',
    tone: 'jade',
  },
  {
    index: '02',
    icon: Bot,
    title: 'AI 先答',
    body: '检索课程知识库，带出处作答；证据不足就明确拒答，不编“像答案”的东西，并自动转交老师。',
    tone: 'clay',
  },
  {
    index: '03',
    icon: Users,
    title: '老师接管',
    body: '按课程路由给对应老师，同题自动合并；AI 附上摘要、依据和草稿，老师只判断、定调、改最后一版。',
    tone: 'gold',
  },
  {
    index: '04',
    icon: BookOpen,
    title: '沉淀成 FAQ',
    body: '回复自动进入知识库，下一次同类问题由 AI 直接命中，老师不用再答一遍。',
    tone: 'blue',
  },
]

const aiCapabilities = [
  {
    icon: Layers3,
    title: '按课程检索，不是关键词碰巧命中',
    body: '把问题与课程知识、别名、标签做相似度匹配，答案必须带出处；不同课程不串库。',
  },
  {
    icon: ShieldCheck,
    title: '置信度门控，答不准就自动转交',
    body: '高置信直接答，中置信提示核对，低置信明确说“没有可靠依据”，并自动交给老师；学生可以补充说明。',
  },
  {
    icon: Users,
    title: '同题合并，同问也不用重复排队',
    body: '语义相近的问题自动聚类，其他同学可以一键“同问”。老师打开的是一个卡点，不是七条重复消息。',
  },
  {
    icon: Sparkles,
    title: '基于老师原话写草稿',
    body: '草稿优先复用已沉淀的课程知识，老师修改后发送，减少从零组织语言的时间。',
  },
  {
    icon: CircleAlert,
    title: '从拒答与负反馈里发现缺口',
    body: 'AI 把“没答好”的 topic 变成知识缺口清单；同一 FAQ 负反馈达到阈值会自动降低置信度、通知老师，并可一键生成 FAQ 草稿。',
  },
  {
    icon: Check,
    title: '每一次回复都在训练下一次回答',
    body: '回复 + 沉淀 + 引用 + 反馈 + 追问 + 学生确认「已解决」形成闭环；发错的回复还能撤回并回滚沉淀。不是一次性聊天，而是课程资产的积累。',
  },
  {
    icon: ImagePlus,
    title: '图片题目，进入同一条答疑链路',
    body: '上传题目照片，视觉模型只负责识别题干；学生确认后仍走课程知识库与置信度门控，原图随问题交给老师。',
  },
  {
    icon: KeyRound,
    title: '服务端网关，按需补充',
    body: '知识库没把握时，由服务端 AI 网关补充回答，明确标注“非课程依据”；Key 只存在服务端环境变量，浏览器接触不到。',
  },
  {
    icon: Users,
    title: '多教师课程路由，问题找到对的人',
    body: '按课程把待办路由给对应老师；每位老师只处理自己的课程、缺口和可编辑知识，同题仍然自动合并。',
  },
]

export function AboutView({ onEnterStudent, onEnterTeacher }: AboutViewProps) {
  const { data } = useStore()
  const weekly = data.daily.slice(-7)
  const ai7 = weekly.reduce((sum, entry) => sum + entry.ai, 0)
  const human7 = weekly.reduce((sum, entry) => sum + entry.human, 0)
  const rate7 = ai7 + human7 > 0 ? ai7 / (ai7 + human7) : 0
  const savedHours = (ai7 * 4) / 60
  const pendingGroups = data.threads.filter((thread) => thread.status === 'pending').length
  const knowledgeCourseCount = new Set(data.faqs.map((faq) => faq.courseId)).size
  const firstResponse = durationLabel(averageFirstResponseMinutes(data.threads))

  return (
    <div className="page about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <div className="about-eyebrow">
            <span className="about-eyebrow-dot" />
            数字造梦师 · 软件应用赛道
            <span className="eyebrow-sep">/</span>
            AI 原生校园工具
          </div>
          <h1 className="about-title">
            师说<span className="about-title-dot">。</span>
            <br />
            <span>让每个课后问题都有回响。</span>
          </h1>
          <p className="about-lead">AI 先答，老师精答，答案留下来。</p>
          <p className="about-desc">
            面向高校课程的 AI + 教师双通道答疑平台。不是把聊天机器人塞进校园，而是把「提问
            → 判断 → 转交 → 沉淀」做成一个会自我变厚的知识闭环。
          </p>
          <div className="about-actions">
            <button className="button button-primary about-primary" onClick={onEnterStudent}>
              进入学生端
              <ArrowRight size={16} />
            </button>
            <button className="button button-ghost" onClick={onEnterTeacher}>
              看教师待办
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="about-tags">
            <span>AI 智能 Agent</span>
            <span>Web 应用</span>
            <span>校园数字化服务</span>
            <span>可运行原型</span>
          </div>
        </div>

        <div className="about-visual" aria-label="一次答疑闭环示意">
          <div className="about-visual-caption">
            <span>一次真实闭环</span>
            <span className="about-live">
              <i />
              演示数据
            </span>
          </div>

          <div className="visual-question-card">
            <div className="visual-card-meta">
              <span className="visual-avatar">林</span>
              <span>学生 · 林晓</span>
              <span>数据结构</span>
            </div>
            <p>动态规划的状态怎么定义？每次写转移方程都没有思路。</p>
          </div>

          <div className="visual-connector">
            <span />
            <em>AI 先检索课程知识</em>
          </div>

          <div className="visual-ai-card">
            <div className="visual-ai-head">
              <span className="visual-ai-mark">
                <Sparkles size={13} />
              </span>
              <strong>AI 助教</strong>
              <Badge tone="medium" dot>
                中置信 58%
              </Badge>
            </div>
            <p>匹配到《动态规划的状态转移方程到底怎么找？》，但这条答案近期被反馈不够具体。</p>
            <div className="visual-ai-foot">
              <span>建议老师确认</span>
              <span>已附 1 条依据</span>
            </div>
          </div>

          <div className="visual-connector">
            <span />
            <em>并入同题组 · 3 人</em>
          </div>

          <div className="visual-teacher-card">
            <div className="visual-teacher-head">
              <span className="visual-avatar gold">陈</span>
              <span>
                <strong>陈砚老师</strong>
                <em>AI 草稿 + 合并回复</em>
              </span>
              <Seal className="seal-small">已沉淀</Seal>
            </div>
            <p>“先定义 dp[i] 的含义，再找最后一步，最后补边界。”</p>
          </div>

          <div className="visual-footnote">
            <BrandMark size={22} />
            回复进入 FAQ，下次 AI 直接答。
          </div>
        </div>
      </section>

      <section className="about-section about-pain-section">
        <div className="about-section-head">
          <span className="about-section-index">01</span>
          <div>
            <div className="eyebrow">问题真实价值</div>
            <h2>不是伪需求：每个上过大课的人，都见过这三个瞬间。</h2>
          </div>
          <span className="about-section-note">场景原型设定 · 不伪造调研数据</span>
        </div>
        <div className="pain-grid">
          {pains.map((pain) => (
            <article className="pain-card" key={pain.number}>
              <div className="pain-number">{pain.number}</div>
              <h3>{pain.title}</h3>
              <p>{pain.body}</p>
              <blockquote>{pain.quote}</blockquote>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <div className="about-section-head">
          <span className="about-section-index">02</span>
          <div>
            <div className="eyebrow">产品逻辑与 AI 融合</div>
            <h2>AI 不只是一个聊天框，它参与判断、合并、起草和沉淀。</h2>
          </div>
        </div>
        <div className="loop-grid">
          {loopSteps.map((step, index) => {
            const Icon = step.icon
            return (
              <div className="loop-step-wrap" key={step.index}>
                <article className="loop-step">
                  <div className={`loop-icon ${step.tone}`}>
                    <Icon size={19} />
                  </div>
                  <span className="loop-index">{step.index}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
                {index < loopSteps.length - 1 && (
                  <span className="loop-arrow" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="about-section">
        <div className="about-section-head">
          <span className="about-section-index">03</span>
          <div>
            <div className="eyebrow">AI 真正做了什么</div>
            <h2>把“看起来很智能”，拆成九个可验证的动作。</h2>
          </div>
        </div>
        <div className="ai-cap-grid">
          {aiCapabilities.map((capability) => {
            const Icon = capability.icon
            return (
              <article className="ai-cap-card" key={capability.title}>
                <span className="ai-cap-icon">
                  <Icon size={17} />
                </span>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="about-metrics">
        <div className="about-metrics-head">
          <div>
            <div className="eyebrow">原型内置数据 · 可复现</div>
            <h2>先看一组闭环跑起来后的数字。</h2>
          </div>
          <span className="about-metric-note">不是真实教学成效承诺</span>
        </div>
        <div className="about-metric-grid">
          <div>
            <strong>{percent(rate7)}</strong>
            <span>近 7 天 AI 独立解决率</span>
          </div>
          <div>
            <strong>
              {firstResponse.value}
              <em>{firstResponse.unit}</em>
            </strong>
            <span>老师平均首响</span>
          </div>
          <div>
            <strong>{savedHours.toFixed(1)}<em>h</em></strong>
            <span>估算每周为老师省下</span>
          </div>
          <div>
            <strong>{formatNumber(data.faqs.length)}<em>条</em></strong>
            <span>{knowledgeCourseCount} 门课程的知识资产</span>
          </div>
        </div>
        <p className="about-metrics-foot">
          当前内置 {pendingGroups} 个待老师确认的问题、{data.duplicatesMerged} 次重复问题合并。你可以直接进入教师端处理一组，再回到学生端看 AI 如何使用新答案。
        </p>
      </section>

      <section className="about-section about-criteria-section">
        <div className="about-section-head">
          <span className="about-section-index">04</span>
          <div>
            <div className="eyebrow">对照赛道评审</div>
            <h2>问题价值、AI 融合、交互与落地，各自落在哪里。</h2>
          </div>
        </div>
        <div className="criteria-grid">
          <article className="criteria-card">
            <div className="criteria-top">
              <Badge tone="jade">01 · 问题真实价值</Badge>
              <Check size={16} />
            </div>
            <h3>切口小，但足够真</h3>
            <p>
              聚焦一门课的课后答疑，目标用户清晰：任课教师与选课学生。重复问题、响应时差、答案不可沉淀，都是高频且可感知的痛点。单门课跑通后可复制到同院系课程。
            </p>
          </article>
          <article className="criteria-card">
            <div className="criteria-top">
              <Badge tone="clay">02 · 产品逻辑与 AI 融合</Badge>
              <Check size={16} />
            </div>
            <h3>AI 参与决策，而不是装饰</h3>
            <p>
              检索、置信度判断、同题聚类、草稿生成、缺口发现都由 AI 完成。老师仍然是最终判断者，但重复劳动被显著削掉，闭环能够自我增强。
            </p>
          </article>
          <article className="criteria-card">
            <div className="criteria-top">
              <Badge tone="gold">03 · 交互与落地可行性</Badge>
              <Check size={16} />
            </div>
            <h3>三步能讲清，单课程能启动</h3>
            <p>
              学生三步提问，老师一次处理。原型用 React + TypeScript 构建，可离线演示；知识库结构可直接替换为校内向量库或大模型，冷启动只需 10–20 条高质量问答。
            </p>
          </article>
        </div>
      </section>

      <section className="boundary-grid">
        <article className="boundary-card do-card">
          <div className="boundary-head">
            <Badge tone="jade" dot>
              会做
            </Badge>
            <h3>把一门课的知识与讲法做深</h3>
          </div>
          <ul>
            <li>
              <Check size={14} />
              课程级知识库、匿名提问、置信度门控
            </li>
            <li>
              <Check size={14} />
              AI 导师按公开课整理，先诊断再讲关键一步
            </li>
            <li>
              <Check size={14} />
              课程 AI 把一条答案讲成结论 / 拆解 / 例子 / 自测
            </li>
            <li>
              <Check size={14} />
              同题合并、AI 草稿、回复沉淀
            </li>
            <li>
              <Check size={14} />
              可解释的数据洞察与知识缺口
            </li>
          </ul>
        </article>
        <article className="boundary-card dont-card">
          <div className="boundary-head">
            <Badge tone="neutral">刻意不做</Badge>
            <h3>不替代老师，也不做大而全</h3>
          </div>
          <ul>
            <li>
              <CircleAlert size={14} />
              不做通用校园问答，不追求无所不答
            </li>
            <li>
              <CircleAlert size={14} />
              导师讲教学法与卡点，不替代任课老师给课程结论
            </li>
            <li>
              <CircleAlert size={14} />
              AI 不替老师给分、评价学生
            </li>
            <li>
              <CircleAlert size={14} />
              不把低置信答案包装成确定结论
            </li>
          </ul>
        </article>
      </section>

      <div className="about-feasibility">
        <ShieldCheck size={17} />
        <p>
          <strong>当前原型的边界：</strong>账号、共享工作区和调用记录保存在服务端 SQLite，学生与教师用不同账号协作；
          课程检索仍是本地模拟 RAG，配置服务端 AI 网关后才会在低置信时补充回答或识别图片。模型 Key
          只从服务端环境变量读取，不下发浏览器，外部回答会明确标注“非课程依据”。教务账号密码只在登录时短暂提交给服务器换取登录态，不落库，登录态按学生账号隔离；
          接入真实场景时，可替换为校内大模型、向量数据库与统一身份认证，并沿用“数据不出校”的部署原则。
        </p>
      </div>

      <section className="about-cta">
        <div>
          <BrandMark size={38} />
          <div>
            <div className="eyebrow">从一门课开始</div>
            <h2>让下一届学生，不用再问同一遍。</h2>
          </div>
        </div>
        <div className="about-cta-actions">
          <button className="button button-primary" onClick={onEnterStudent}>
            去问一个问题
            <ArrowRight size={16} />
          </button>
          <button className="button button-ghost" onClick={onEnterTeacher}>
            去处理一组待办
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}
