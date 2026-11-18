export interface MajorFaq {
  id: string
  question: string
  aliases: string[]
  answer: string
  tags: string[]
  source: string
}

export interface MajorStage {
  label: string
  courses: string[]
  note: string
}

export interface MajorGuide {
  id: string
  name: string
  aliases: string[]
  summary: string
  stages: MajorStage[]
  faqs: MajorFaq[]
  sourceNote: string
}

const MAJOR_OPTIONS = [
  '计算机科学与技术',
  '软件工程',
  '人工智能',
  '电子信息工程',
  '通信工程',
  '自动化',
  '数学与应用数学',
  '统计学',
  '法学',
  '汉语言文学',
  '临床医学',
  '会计学',
  '工商管理',
  '英语',
]

const CS_GUIDE: MajorGuide = {
  id: 'cs',
  name: '计算机科学与技术',
  aliases: ['计算机', '计算机科学', '计科', '计算机类', 'cs'],
  summary:
    '先把数学和程序设计打牢，再用数据结构与算法建立抽象能力；大二大三往操作系统、网络、数据库和方向课展开。',
  stages: [
    {
      label: '大一 · 打基础',
      courses: ['高等数学', '线性代数', '程序设计基础'],
      note: '先把一门语言和数学基础跑通，别急着铺方向。',
    },
    {
      label: '大二 · 建结构',
      courses: ['数据结构', '离散数学', '计算机组成原理', '概率统计'],
      note: '数据结构是分水岭；组成原理帮你理解程序下面发生了什么。',
    },
    {
      label: '大三 · 连系统',
      courses: ['操作系统', '计算机网络', '数据库系统', '算法设计与分析'],
      note: '把单门课连成系统，开始做完整项目。',
    },
    {
      label: '大四 · 选方向',
      courses: ['方向选修', '项目 / 实习', '毕业设计'],
      note: '按目标补项目、实习或科研，不要同时铺三条线。',
    },
  ],
  faqs: [
    {
      id: 'cs-math',
      question: '计算机专业数学重要吗？高数、线代、概率到底有什么用？',
      aliases: ['数学重要吗', '高数有什么用', '线代有什么用', '概率有什么用', '数学不好能学计算机吗'],
      answer:
        '数学不是每门课都直接用，但它决定你能走多远。高数和线代是算法分析、图形学、机器学习的地基；概率统计在网络、AI、数据分析里反复出现；离散数学直接服务数据结构、算法和逻辑。\n建议：不用一上来啃证明，先把概念和课程里的用法对上，比如线代在数据降维里怎么用、概率的期望在复杂度分析里怎么用。数学薄弱就先补微积分和线代的基础计算，再逐步加证明。',
      tags: ['数学', '课程关系'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-language',
      question: '先学哪门编程语言？C、Python、Java 怎么选？',
      aliases: ['先学什么语言', '学C还是Python', '编程语言怎么选', '先学哪门语言', '先学哪门编程语言'],
      answer:
        '先选一门你能用它写完完整程序的。C 适合理解内存和指针，Python 适合快速做项目和数据分析，Java 适合工程和面试。\n学校课程用什么就先用什么，别在选语言上耗一个学期。真正的分水岭是：你能不能独立写出链表、栈、队列、树，并能调试。语言只是工具。',
      tags: ['编程入门'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-ds',
      question: '数据结构与算法怎么练？只刷题够吗？',
      aliases: ['数据结构怎么学', '算法怎么练', '怎么刷题', '只刷题够吗'],
      answer:
        '刷题不是目的，能把结构写出来才是。\n建议三步：① 手写实现：链表、栈、队列、树、图，至少各写一遍；② 按题型练：排序、查找、动态规划、图；③ 复盘：每题写清「用了什么结构、为什么、复杂度多少」。\n只背题解，换一道就废；先把一道题讲给别人听，能讲清楚再刷下一道。',
      tags: ['数据结构', '算法'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-order',
      question: '这些课之间是什么关系？应该按什么顺序学？',
      aliases: ['课程顺序', '先修关系', '课程关系', '先学什么', '课程地图'],
      answer:
        '一条主线：程序设计 → 数据结构 → 算法设计与分析 → 操作系统 / 计算机网络 / 数据库。数学是并行支撑：高数、线代、概率、离散。\n不用等「全部学完」才做项目；但数据结构没打牢，后面的操作系统、数据库和算法课会反复卡。先修关系不是死规定，遇到不会的回头补即可。',
      tags: ['课程关系', '课程地图'],
      source: '培养方案摘录（演示）',
    },
    {
      id: 'cs-project',
      question: '项目和竞赛怎么选？什么时候开始？',
      aliases: ['项目怎么选', '竞赛怎么选', '什么时候做项目', '要不要参加竞赛'],
      answer:
        '先做一个能跑完的小项目：课程设计、工具脚本、个人网站都行。做完再考虑竞赛。\n竞赛选一个方向：算法、开发、数学建模，不要同时铺。项目要能讲清三件事：你解决了什么问题、怎么做的、怎么验证有效。简历上「参与过」不如「我负责哪一块、结果如何」。',
      tags: ['项目', '竞赛'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-score',
      question: '成绩、项目、竞赛哪个更重要？',
      aliases: ['成绩重要还是项目重要', '项目重要吗', '竞赛有用吗', '绩点重要吗'],
      answer:
        '取决于你的目标。保研 / 考研更看成绩和基础；就业更看项目、实习和工程能力；竞赛是加分项，不是替代品。\n大一大二先把成绩和基础稳住，大三再按目标加项目或实习。具体保研比例、加分政策以学校和学院当年文件为准，别拿网上的说法当结论。',
      tags: ['成绩', '规划'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-path',
      question: '想走开发、算法或考研，分别怎么安排？',
      aliases: ['开发怎么准备', '算法岗怎么准备', '考研怎么准备', '就业还是考研'],
      answer:
        '开发：语言 + 数据结构 + 一个完整项目 + 实习；算法：数学 + 算法 + 论文 / 竞赛；考研：目标院校科目 + 数学 / 专业课 + 真题。\n三条路都需要先打牢数据结构与数学。大二结束前不用急着锁死，先通过项目和课程判断自己更喜欢哪条；大三再集中投入。',
      tags: ['方向', '规划'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-catchup',
      question: '现在基础差，怎么补？',
      aliases: ['基础差怎么办', '怎么补基础', '跟不上怎么办'],
      answer:
        '先定位卡点：是不会写代码、不理解概念，还是数学跟不上。\n选一门最影响后续的课（通常是程序设计、数据结构或高数），用「课本例题 → 手写一遍 → 讲给别人听」补；每周固定两次、每次 45 分钟。不要同时补五门，先把一门从「完全不会」推到「能独立做题」。',
      tags: ['补基础'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-ask',
      question: '怎么问老师问题才有效？',
      aliases: ['怎么问老师', '问问题技巧', '怎么找老师'],
      answer:
        '先自己查课程 FAQ 和教材，把问题缩到「具体哪一步」。\n问的时候带上：题目、你的思路、卡住的点。课程知识库能答的先问 AI；需要老师定调的再转交。这样老师不用重复讲基础，你也能得到更具体的回复。',
      tags: ['学习方法', '问老师'],
      source: '专业学习建议（演示）',
    },
    {
      id: 'cs-plan',
      question: '大二、大三该做什么？',
      aliases: ['大二做什么', '大二该做什么', '大三做什么', '大三该做什么', '大学怎么规划'],
      answer:
        '大二：数据结构、计算机组成、离散数学打牢，开始一个小项目；大三：操作系统、网络、数据库，确定方向，找实习 / 科研 / 竞赛。\n每学期只加一个主线目标，别把课表排满。成绩、项目、方向至少保住两样，不要三样都想要。',
      tags: ['规划'],
      source: '专业学习建议（演示）',
    },
  ],
  sourceNote:
    '以上为演示版专业学习建议，不是学校正式培养方案；课程设置、保研 / 考研政策以学校和学院为准。',
}

const GENERIC_GUIDE: MajorGuide = {
  id: 'generic',
  name: '通用专业',
  aliases: [],
  summary:
    '没有该专业的演示培养方案时，导师只根据你的课表、成绩和课程知识库给建议，不编造课程地图。',
  stages: [],
  faqs: [
    {
      id: 'generic-plan',
      question: '这学期怎么安排比较稳？',
      aliases: ['这学期怎么安排', '怎么安排学习', '学习计划'],
      answer:
        '先看三件事：这学期有哪些课、哪门课最影响后续、你手头有没有没解决的问题。每周只设一个主线目标，其余时间用来跟进课程和复盘。没有课表时，先绑定课表，导师才能按真实进度排。',
      tags: ['规划'],
      source: '通用建议（演示）',
    },
    {
      id: 'generic-catchup',
      question: '基础差怎么补？',
      aliases: ['基础差怎么办', '怎么补基础', '跟不上怎么办'],
      answer:
        '先定位一门最影响后续的课，用「课本例题 → 手写一遍 → 讲给别人听」补；每周固定两次、每次 45 分钟。不要同时补五门，先把一门从「完全不会」推到「能独立做题」。',
      tags: ['补基础'],
      source: '通用建议（演示）',
    },
    {
      id: 'generic-ask',
      question: '怎么问老师问题才有效？',
      aliases: ['怎么问老师', '问问题技巧'],
      answer:
        '先自己查课程 FAQ 和教材，把问题缩到「具体哪一步」。问的时候带上：题目、你的思路、卡住的点。课程知识库能答的先问 AI；需要老师定调的再转交。',
      tags: ['学习方法'],
      source: '通用建议（演示）',
    },
    {
      id: 'generic-project',
      question: '项目和竞赛怎么选？',
      aliases: ['项目怎么选', '竞赛怎么选', '要不要参加竞赛'],
      answer:
        '先做一个能跑完的小项目，再考虑竞赛。竞赛选一个方向，不要同时铺。项目要能讲清：你解决了什么问题、怎么做的、怎么验证有效。',
      tags: ['项目', '竞赛'],
      source: '通用建议（演示）',
    },
  ],
  sourceNote: '通用学习建议，不包含该专业的课程地图；具体培养方案以学校为准。',
}

const MAJOR_GUIDES: MajorGuide[] = [CS_GUIDE]

function majorKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim()
}

export function majorOptions() {
  return Array.from(new Set([...MAJOR_GUIDES.map((guide) => guide.name), ...MAJOR_OPTIONS]))
}

/** Undefined means the student typed a major we have no demo guide for; use the generic guide. */
export function resolveMajor(name: string): MajorGuide | undefined {
  const key = majorKey(name)
  if (!key) return undefined
  return MAJOR_GUIDES.find((guide) =>
    [guide.name, ...guide.aliases].some((alias) => {
      const aliasKey = majorKey(alias)
      if (!aliasKey) return false
      return key === aliasKey || key.includes(aliasKey) || aliasKey.includes(key)
    }),
  )
}

export { GENERIC_GUIDE }