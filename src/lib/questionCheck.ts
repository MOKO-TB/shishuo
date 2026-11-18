export type QuestionCheckKey = 'topic' | 'attempt' | 'blocker'

export interface QuestionCheckItem {
  key: QuestionCheckKey
  label: string
  ok: boolean
  hint: string
}

export interface QuestionCheckResult {
  items: QuestionCheckItem[]
  warnings: number
  ok: boolean
}

const CONCEPT_QUESTION =
  /(什么时候|为什么|为何|区别|原理|条件|定义|理解|判断|适用|优缺点|关系|怎么学|怎么复习|有哪些|是什么|办法|方案|怎么选|如何选|如何判断)/
const ATTEMPT =
  /(我试过|我算到|我写|我先|用了|尝试|思路|步骤|推导|算到|试了|做过|已经|我的做法|我的思路|答案是)/
const BLOCKER =
  /(卡在|不懂|不会|不明白|不知道|没想通|搞不清|没懂|没思路|不确定|分不清|这一步|理解不了|哪里错|为什么错|怎么来的|怎么选|怎么用|怎么求|怎么算|哪里卡|卡住)/
const SPECIFIC = /(\d|题号|第\s*\d+\s*题|这道题|例题|习题|选项|图|求|计算|证明|解方程|画图|代码)/
const SCAFFOLD_LABEL = /(题目\/题号|我已经试过|卡住的地方)\s*[:：]/g

export function checkQuestionClarity(text: string, hasImage: boolean): QuestionCheckResult {
  const clean = text.replace(SCAFFOLD_LABEL, ' ').trim()
  const conceptQuestion = CONCEPT_QUESTION.test(clean)
  const topicOk = hasImage || clean.length >= 8 || SPECIFIC.test(clean)
  const attemptOk =
    hasImage || ATTEMPT.test(clean) || (conceptQuestion && !/(不会|不懂|卡)/.test(clean))
  const blockerOk = BLOCKER.test(clean) || /[？?]/.test(clean) || conceptQuestion

  const items: QuestionCheckItem[] = [
    {
      key: 'topic',
      label: '题目/题号',
      ok: topicOk,
      hint: '写清题号、已知条件，或者附上题目图片。',
    },
    {
      key: 'attempt',
      label: '已试步骤',
      ok: attemptOk,
      hint: '说说你已经写到哪一步、用过什么方法，老师更容易定位。',
    },
    {
      key: 'blocker',
      label: '卡点',
      ok: blockerOk,
      hint: '指出具体卡在哪一步，或者哪个概念没想通。',
    },
  ]
  const warnings = items.filter((item) => !item.ok).length
  return { items, warnings, ok: warnings === 0 }
}

export function selfCheckTemplate(text: string) {
  const clean = text.trim()
  return clean
    ? `题目/题号：${clean}\n我已经试过：\n卡住的地方：`
    : '题目/题号：\n我已经试过：\n卡住的地方：'
}
