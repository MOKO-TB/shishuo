/**
 * 课程学习问答 Skill 与教学相关性数据过滤（Study Q&A Skill & Filter）
 *
 * 适用于学生端「问 AI 助教」「追问」与「AI 导师」问答模块：
 * 1. 先做教学/学习相关性筛选（本地快速预筛 + AI 语义标记 [INVALID_QA]）；
 * 2. 与教学无关的内容直接提示无关，不进入问答记录与对外展示，并上报后台标记为无效问答；
 * 3. 与学习相关但属于其他学科时，点名推荐对应课程与任课老师；
 * 4. 有效学习问题保持简明扼要，只做问题总结与核心要点，不事无巨细。
 */

export interface CourseTeacherOption {
  name: string
  teacher?: string
}

export interface LocalRelevanceResult {
  invalid: boolean
  reason: string
  notice: string
  category?: 'gibberish' | 'chitchat' | 'campus_life'
}

export const INVALID_QA_MARKER = '[INVALID_QA]'

export const STUDY_QA_SKILL = `# 课程学习答疑 Skill（相关性筛选 + 精简总结）

你是高校课程学习答疑助手，必须严格按以下两步执行，先筛选、再精简作答：

## 第一步：学习与学科相关性筛选（先判断，再决定是否作答）
1. **与教学/学习无关的内容**（如乱码、纯数字、测试字符、日常闲聊、情感娱乐、游戏八卦、点外卖、天气、生活琐事、宿舍/网络报修、食堂、请假、社团/比赛报名等非学科问题）：
   - **必须在回复最开头输出固定标记** \`${INVALID_QA_MARKER}\`（紧跟换行或空格，然后写提示语），以便系统将其过滤为无效问答、不计入提问记录。
   - **不要展开闲聊或长篇回答**，只用 1–2 句话礼貌提示：「这条内容与当前课程教学无关，未计入提问记录。请发送具体的课程概念、作业题或题目截图。」
   - 若属于校园生活、报修、食堂、选课或比赛通知，可补充一句：「校园事务请切换到「校园」板块问「引路学长」。」
2. **与学习相关，但明显属于其他课程 / 其他老师负责的学科**（例如在《数据结构》下问微积分、模电运放、大学英语翻译、思政论述、其他专业课等）：
   - 不要输出 \`${INVALID_QA_MARKER}\`。
   - 先明确提示：「这个问题更偏向《对应课程》的内容，不属于当前课程范围。」
   - 优先从下方「可选课程与任课老师」清单中**点名推荐对应的课程与任课老师**（或提示切换对应学科的 AI 导师）；清单里没有时，直接建议找对应学科的任课老师提问。
   - 最多用 1–2 句话点明最核心方向，**不要代替别的学科老师长篇讲解**。
3. **与当前课程学习相关**（或附带了相关题目图片/课程文档）：进入第二步正常作答，不要输出 \`${INVALID_QA_MARKER}\`。

## 第二步：精简问题总结规范（严禁冗长、不事无巨细）
1. **只做问题总结与核心提炼**，不照搬教材整段定义、不堆砌废话、不把每个细枝末节都展开。
2. **推荐三段极简结构**：
   - **核心结论**：1–2 句话直接给出判断、思路或答案要点；
   - **关键要点**：用 2–3 条短列表概括最关键的条件、步骤或易错点（每条 1 句话）；
   - **下一步 / 核对**：1 句话收尾（如需老师确认课程口径或评分标准，单独一行写「需要老师确认：……」）。
3. **字数硬性控制**：
   - 普通提问控制在 **180–260 字**以内；
   - 涉及上传长文档或复杂图片分析时，控制在 **380 字**以内；
   - 禁止输出长篇大论与 Markdown 表格；数学公式统一用 $...$ 或 $$...$$ 包裹。`

export function buildStudyQaSkillBlock({
  currentCourse,
  availableCourses,
}: {
  currentCourse?: string
  availableCourses?: CourseTeacherOption[]
}) {
  const uniqueCourses = new Map<string, string>()
  for (const item of availableCourses ?? []) {
    const courseName = item.name.trim()
    if (!courseName) continue
    if (currentCourse && courseName === currentCourse.trim()) continue
    const teacher = item.teacher?.trim()
    const label = teacher
      ? `${courseName}（${teacher.endsWith('老师') ? teacher : `${teacher}老师`}）`
      : courseName
    if (!uniqueCourses.has(courseName)) {
      uniqueCourses.set(courseName, label)
    }
  }
  const roster = Array.from(uniqueCourses.values()).slice(0, 20)
  const currentLine = currentCourse?.trim()
    ? `\n\n当前所在课程：${currentCourse.trim()}`
    : ''
  const rosterLine =
    roster.length > 0
      ? `\n可选的其他课程与任课老师（跨学科提问时优先从中推荐）：${roster.join('、')}`
      : ''

  return `${STUDY_QA_SKILL}${currentLine}${rosterLine}`
}

const ACADEMIC_SIGNAL_RE =
  /题|怎么算|怎么求|怎么解|怎么做|怎么写|为什么|区别|原理|定义|概念|公式|定理|证明|推导|步骤|思路|例题|作业|实验|考试|复习|考点|报错|代码|程序|函数|变量|指针|数组|链表|栈|队列|二叉树|图|排序|查找|复杂度|动态规划|递归|哈希|矩阵|行列式|向量|微积分|导数|积分|极限|级数|概率|分布|方差|期望|电路|电阻|电容|电感|电压|电流|运放|三极管|二极管|放大|滤波|逻辑|门电路|卡诺图|触发器|时序|进制|补码|信号|系统|网络|协议|数据库|sql|python|java|c\+\+|matlab|verilog|linux|英语|翻译|语法|作文|毛概|习概|思政|线性代数|高数|数电|模电|离散|算法|结构|分析|建模|采集|预处理/i

const PURE_GREETING_RE =
  /^(你好|您好|哈喽|嗨|在吗|在不在|你好呀|你好啊|早安|早上好|上午好|中午好|下午好|晚上好|晚安|拜拜|再见|谢谢|感谢|好的|嗯|哦|啊|哈哈+|呵呵+|嘿嘿+|hi|hello|hey|ok|okay|thanks|thank you|你是谁|你叫什么|能聊天吗|聊聊天|陪我聊天|无聊|好无聊|摸鱼|测试|测试一下|test|testing|aaa+|bbb+|qwer+|asdf+|zxcv+)[!！?？。.，,~～\s]*$/i

const CAMPUS_LIFE_RE =
  /(校园网|宽带|断网|连不上网|宿舍.*(报修|坏了|漏水|空调|热水|门锁|灯)|物业报修|食堂.*(吃什么|好吃|几点|开门)|外卖|快递|菜鸟驿站|放假|校车|洗澡|充水费|充电费|查电费|门禁|请假怎么请|体测|补办校园卡|校园卡丢了)/i

const OFF_TOPIC_LIFE_RE =
  /(今天天气|明天天气|推荐.*(电影|电视剧|动漫|综艺|小说|歌|音乐|游戏)|好玩的游戏|王者荣耀|和平精英|原神|英雄联盟|金铲铲|吃什么好|中午吃什么|晚上吃什么|点什么外卖|讲个笑话|说个段子|星座|算命|塔罗|占卜|表白|追女生|追男生|谈恋爱|分手|八卦|明星|买什么手机|旅游攻略|减肥|穿搭|彩票|股票|炒股)/i

/**
 * 本地快速预筛：拦截明显与课程教学无关的乱码、纯数字、闲聊、生活琐事，
 * 避免消耗 AI 额度并杜绝脏数据进入问答记录。
 */
export function checkLocalTeachingRelevance(
  raw: string,
  options?: { hasAttachment?: boolean; courseName?: string },
): LocalRelevanceResult {
  if (options?.hasAttachment) {
    return { invalid: false, reason: '', notice: '' }
  }
  const text = raw.trim()
  if (!text) {
    return {
      invalid: true,
      reason: '空白输入',
      notice: '请输入具体的课程问题后再发送。',
      category: 'gibberish',
    }
  }

  const compact = text.replace(/\s+/g, '')
  const hasAcademic = ACADEMIC_SIGNAL_RE.test(text)

  // 1. 纯数字、纯符号或无意义重复字符（例如 12332123、11111、???、asdfasdf）
  if (/^[\d\p{P}\p{S}_]+$/u.test(compact)) {
    return {
      invalid: true,
      reason: '纯数字或符号输入（与教学无关）',
      notice: '这条内容与课程教学无关，未计入提问记录。请发送具体的课程概念、作业题或题目截图。',
      category: 'gibberish',
    }
  }

  if (compact.length <= 1 || /^(.)\1{2,}$/u.test(compact)) {
    return {
      invalid: true,
      reason: '无意义单字或重复字符',
      notice: '这条内容与课程教学无关，未计入提问记录。请简要描述你卡住的知识点或具体题目。',
      category: 'gibberish',
    }
  }

  if (/^[a-z0-9]+$/i.test(compact) && !hasAcademic) {
    const uniqueChars = new Set(compact.toLowerCase()).size
    const looksLikeMash =
      compact.length <= 3 ||
      uniqueChars <= 2 ||
      /^(asdf|qwer|zxcv|hjkl|uiop|123|abc|test|demo)/i.test(compact) ||
      (!/[aeiou]/i.test(compact) && compact.length >= 5)
    if (looksLikeMash) {
      return {
        invalid: true,
        reason: '无意义字符/测试输入',
        notice: '这条内容与课程教学无关，未计入提问记录。请发送具体的课程问题或题目。',
        category: 'gibberish',
      }
    }
  }

  // 2. 纯打招呼 / 闲聊
  if (PURE_GREETING_RE.test(text)) {
    return {
      invalid: true,
      reason: '日常问候或闲聊（与教学无关）',
      notice: '这里用于课程学习答疑，日常闲聊不计入提问记录。有具体课程概念、作业题或卡点直接发给我即可。',
      category: 'chitchat',
    }
  }

  // 3. 校园生活/后勤事务（无学科关键词时引导至校园板块）
  if (!hasAcademic && CAMPUS_LIFE_RE.test(text)) {
    return {
      invalid: true,
      reason: '校园生活事务（非课程教学）',
      notice: '这个问题属于校园生活事务，与课程教学无关，未计入提问记录。建议切换到「校园」板块问「引路学长」。',
      category: 'campus_life',
    }
  }

  // 4. 娱乐/生活/情感等明显非教学内容
  if (!hasAcademic && OFF_TOPIC_LIFE_RE.test(text)) {
    return {
      invalid: true,
      reason: '生活娱乐等非教学话题',
      notice: '这条内容与课程教学无关，未计入提问记录。请提问课程相关知识点、习题或实验问题。',
      category: 'chitchat',
    }
  }

  return { invalid: false, reason: '', notice: '' }
}

/**
 * 清理流式输出开头的 [INVALID_QA] 标记（包含尚未输出完整的半截前缀），避免用户看到内部标签。
 */
export function stripInvalidQaMarker(text: string): string {
  const trimmedStart = text.trimStart()
  if (trimmedStart.startsWith(INVALID_QA_MARKER)) {
    return trimmedStart.slice(INVALID_QA_MARKER.length).replace(/^[\s:：—-]+/, '')
  }
  if (
    trimmedStart.startsWith('[') &&
    trimmedStart.length < INVALID_QA_MARKER.length &&
    INVALID_QA_MARKER.startsWith(trimmedStart)
  ) {
    return ''
  }
  return text
}

const SEMANTIC_INVALID_RE =
  /(和《?[^。\n]{0,20}》?的?课程学习无关|与当前课程(?:教学|学习)无关|与课程(?:教学|学习)无关|和学习无关|与教学无关|看不出题目或卡点|只是误发|非教学|不属于(?:课程)?学习问题)/

/**
 * 解析 AI 返回结果，判断是否被判定为「与教学无关的无效问答」。
 */
export function parseStudyQaResponse(raw: string): {
  invalid: boolean
  cleanText: string
  reason: string
} {
  const trimmed = raw.trim()
  const hasMarker = trimmed.startsWith(INVALID_QA_MARKER)
  const cleanText = stripInvalidQaMarker(trimmed).trim()
  if (hasMarker) {
    return {
      invalid: true,
      cleanText:
        cleanText || '这条内容与课程教学无关，未计入提问记录。请发送具体的课程问题或作业题。',
      reason: 'AI 判定与教学无关',
    }
  }
  // 兜底检测：即便模型漏写标记，但开头明确拒答非教学内容，同样拦截不入库
  const head = cleanText.slice(0, 140)
  if (SEMANTIC_INVALID_RE.test(head)) {
    return {
      invalid: true,
      cleanText,
      reason: 'AI 语义判定与教学无关',
    }
  }
  return {
    invalid: false,
    cleanText: cleanText || trimmed,
    reason: '',
  }
}

/**
 * 上报后台标记为「无效问答」（存入 invalid_qa 表并记入审计，不进入正式问答库、不对外展示）。
 */
export async function reportInvalidQa(payload: {
  source: 'ask' | 'mentor' | 'follow-up'
  courseId?: string
  courseName?: string
  question: string
  reason: string
  reply?: string
}): Promise<void> {
  try {
    await fetch('/api/qa/invalid', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // 后台标记失败不应阻断前端提示
  }
}
