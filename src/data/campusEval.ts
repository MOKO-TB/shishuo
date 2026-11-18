export type CampusEvalExpect = 'answer' | 'escalate'

export interface CampusEvalCase {
  id: string
  question: string
  expect: CampusEvalExpect
  expectedFaqId?: string
}

/**
 * 校园问答检索评测集。
 * 目标不是覆盖 73 张卡的每一张，而是覆盖学生最可能问的 30+ 个场景，
 * 并保留 4 条明确超出知识卡的负例，防止“什么都敢答”。
 */
export const CAMPUS_EVAL_CASES: CampusEvalCase[] = [
  // 学业规划
  { id: 'campus-eval-01', question: '大一怎么判断自己要不要转专业？', expect: 'answer', expectedFaqId: 'campus-K001' },
  { id: 'campus-eval-02', question: '转专业一般什么时候能报名？', expect: 'answer', expectedFaqId: 'campus-K001' },
  { id: 'campus-eval-03', question: '计算机专业大一最该练什么？', expect: 'answer', expectedFaqId: 'campus-K002' },
  { id: 'campus-eval-04', question: '高数挂科边缘怎么自救？', expect: 'answer', expectedFaqId: 'campus-K003' },
  { id: 'campus-eval-05', question: '民办本科绩点多少算够用？', expect: 'answer', expectedFaqId: 'campus-K004' },
  { id: 'campus-eval-06', question: '大学四年每个阶段该做什么？', expect: 'answer', expectedFaqId: 'campus-K005' },
  { id: 'campus-eval-07', question: '期末两周怎么突击复习？', expect: 'answer', expectedFaqId: 'campus-K007' },
  { id: 'campus-eval-08', question: '怎么找直系学长学姐问经验？', expect: 'answer', expectedFaqId: 'campus-K008' },

  // 竞赛
  { id: 'campus-eval-09', question: '大一能参加哪些门槛低的竞赛？', expect: 'answer', expectedFaqId: 'campus-K010' },
  { id: 'campus-eval-10', question: '蓝桥杯零基础怎么备赛？', expect: 'answer', expectedFaqId: 'campus-K011' },
  { id: 'campus-eval-11', question: '数学建模三个人怎么分工？', expect: 'answer', expectedFaqId: 'campus-K012' },
  { id: 'campus-eval-12', question: '竞赛和专业课冲突怎么取舍？', expect: 'answer', expectedFaqId: 'campus-K016' },
  { id: 'campus-eval-13', question: '竞赛报名费和差旅能报销吗？', expect: 'answer', expectedFaqId: 'campus-K018' },

  // 证书
  { id: 'campus-eval-14', question: '计算机二级到底值不值得考？', expect: 'answer', expectedFaqId: 'campus-K019' },
  { id: 'campus-eval-15', question: '英语四级大一能考吗，怎么备考？', expect: 'answer', expectedFaqId: 'campus-K020' },
  { id: 'campus-eval-16', question: '六级比四级难多少？', expect: 'answer', expectedFaqId: 'campus-K021' },
  { id: 'campus-eval-17', question: '教师资格证大一能准备吗？', expect: 'answer', expectedFaqId: 'campus-K023' },
  { id: 'campus-eval-18', question: '软考在校生适合考吗？', expect: 'answer', expectedFaqId: 'campus-K024' },
  { id: 'campus-eval-19', question: '大学什么时候学驾照最合适？', expect: 'answer', expectedFaqId: 'campus-K025' },

  // 实习就业
  { id: 'campus-eval-20', question: '大一暑假能找到实习吗？', expect: 'answer', expectedFaqId: 'campus-K028' },
  { id: 'campus-eval-21', question: '没有实习经历，第一份简历怎么写？', expect: 'answer', expectedFaqId: 'campus-K029' },
  { id: 'campus-eval-22', question: '民办本科进大厂现实吗？', expect: 'answer', expectedFaqId: 'campus-K031' },
  { id: 'campus-eval-23', question: '实习信息一般去哪里找？', expect: 'answer', expectedFaqId: 'campus-K032' },
  { id: 'campus-eval-24', question: '秋招大三上要准备什么？', expect: 'answer', expectedFaqId: 'campus-K035' },

  // 考研
  { id: 'campus-eval-25', question: '民办本科考研复试会被歧视吗？', expect: 'answer', expectedFaqId: 'campus-K037' },
  { id: 'campus-eval-26', question: '考研择校冲稳保怎么定？', expect: 'answer', expectedFaqId: 'campus-K039' },
  { id: 'campus-eval-27', question: '学硕和专硕有什么区别？', expect: 'answer', expectedFaqId: 'campus-K040' },
  { id: 'campus-eval-28', question: '跨专业考计算机怎么准备？', expect: 'answer', expectedFaqId: 'campus-K043' },
  { id: 'campus-eval-29', question: '民办本科保研有机会吗？', expect: 'answer', expectedFaqId: 'campus-K044' },

  // 心理与校园生活
  { id: 'campus-eval-30', question: '上了民办本科心态崩了怎么调整？', expect: 'answer', expectedFaqId: 'campus-K045' },
  { id: 'campus-eval-31', question: '宿舍关系处不好怎么办？', expect: 'answer', expectedFaqId: 'campus-K046' },
  { id: 'campus-eval-32', question: '总是拖延、离不开手机怎么办？', expect: 'answer', expectedFaqId: 'campus-K048' },
  { id: 'campus-eval-33', question: '学校心理咨询怎么预约？', expect: 'answer', expectedFaqId: 'campus-K051' },
  { id: 'campus-eval-34', question: '大一加几个社团比较合适？', expect: 'answer', expectedFaqId: 'campus-K053' },
  { id: 'campus-eval-35', question: '助学金和勤工俭学怎么申请？', expect: 'answer', expectedFaqId: 'campus-K055' },
  { id: 'campus-eval-36', question: '图书馆的资源怎么用才不浪费？', expect: 'answer', expectedFaqId: 'campus-K058' },
  { id: 'campus-eval-37', question: '体测不及格会影响毕业吗？', expect: 'answer', expectedFaqId: 'campus-K059' },

  // 明确超出知识卡：应该转人工，而不是硬答
  { id: 'campus-eval-38', question: '今天食堂哪个窗口有糖醋排骨？', expect: 'escalate' },
  { id: 'campus-eval-39', question: '学校附近哪家奶茶店最好喝？', expect: 'escalate' },
  { id: 'campus-eval-40', question: '校车周末几点从肇庆校区发车？', expect: 'escalate' },
  { id: 'campus-eval-41', question: '网球场怎么预约，多少钱一小时？', expect: 'escalate' },
]
