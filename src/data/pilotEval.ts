export type PilotEvalCourseId = 'math' | 'ds' | 'circuit' | 'analog' | 'digital'

export interface PilotEvalCase {
  id: string
  courseId: PilotEvalCourseId
  question: string
  expect: 'answer' | 'escalate'
  expectedFaqId?: string
}

let sequence = 0

function answers(
  courseId: PilotEvalCourseId,
  expectedFaqId: string,
  questions: string[],
): PilotEvalCase[] {
  return questions.map((question) => ({
    id: `eval-${++sequence}`,
    courseId,
    question,
    expect: 'answer',
    expectedFaqId,
  }))
}

function escalates(courseId: PilotEvalCourseId, questions: string[]): PilotEvalCase[] {
  return questions.map((question) => ({
    id: `eval-${++sequence}`,
    courseId,
    question,
    expect: 'escalate',
  }))
}

export const PILOT_EVAL_CASES: PilotEvalCase[] = [
  // 高等数学
  ...answers('math', 'faq-pilot-equiv', [
    'x 趋于 0 时 sinx-x 能不能直接把 sinx 换成 x？',
    '等价无穷小在加减法里什么时候会出错？',
    '1-cosx 的等价无穷小是什么？',
  ]),
  ...answers('math', 'faq-pilot-continuity', [
    '可导和连续到底是什么关系？',
    '分段函数在分界点怎么判断可导？',
  ]),
  ...answers('math', 'faq-pilot-implicit', [
    '隐函数求导遇到 xy 项怎么处理？',
    '隐函数二阶导怎么求？',
  ]),
  ...answers('math', 'faq-pilot-mean-value', [
    '罗尔定理的辅助函数怎么构造？',
    '拉格朗日中值定理的结论是什么？',
  ]),
  ...answers('math', 'faq-pilot-taylor', [
    '泰勒展开到几阶才够用？',
    '用泰勒公式求 sinx-x 除以 x³ 的极限',
  ]),
  ...answers('math', 'faq-pilot-parts', [
    '分部积分 u 和 dv 怎么选？',
    '∫x e^x dx 怎么积？',
  ]),
  ...answers('math', 'faq-pilot-improper', [
    '反常积分怎么判断收敛？',
    'p 积分在什么范围收敛？',
  ]),
  ...answers('math', 'faq-pilot-multivariable', [
    '偏导存在是不是就说明可微？',
    '多元函数可微的定义怎么判断？',
  ]),
  ...answers('math', 'faq-pilot-double-order', [
    '二重积分交换积分次序怎么换？',
    'X 型区域换成 Y 型怎么确定上下限？',
  ]),
  ...answers('math', 'faq-pilot-series', [
    '级数收敛用比值判别法还是根值？',
    '交错级数怎么判断收敛？',
  ]),
  ...answers('math', 'faq-pilot-ode', [
    '一阶线性微分方程的积分因子怎么求？',
    'y′+y=e^x 的通解怎么算？',
  ]),
  ...answers('math', 'faq-pilot-parametric', ['参数方程的二阶导数公式是什么？']),
  ...answers('math', 'faq-lhopital', ['洛必达法则什么时候不能用？']),
  ...answers('math', 'faq-variable-upper', ['变上限积分函数怎么求导？']),
  ...answers('math', 'faq-substitution', ['定积分换元后上下限怎么变？']),
  ...answers('math', 'faq-extrema', ['极值和最值有什么区别？']),
  ...escalates('math', [
    '老师，这道题直接告诉我选 A 还是 B 吧。',
    '期末考试会考哪几道原题？',
    '能帮我写一份高数学习计划表吗？',
    '老师能推荐一本高数习题册吗？',
    '怎么用 Python 求数值积分？',
  ]),

  // 数据结构
  ...answers('ds', 'faq-pilot-stack-queue', [
    '栈和队列有什么区别？',
    '循环队列怎么判断队满？',
  ]),
  ...answers('ds', 'faq-pilot-kmp', [
    'KMP 的 next 数组表示什么？',
    'KMP 失配后主串要不要回退？',
  ]),
  ...answers('ds', 'faq-pilot-bst', [
    '二叉搜索树删除有两个孩子的节点怎么删？',
    '二叉搜索树为什么会退化？',
  ]),
  ...answers('ds', 'faq-pilot-avl', ['AVL 的 LR 型怎么旋转？', '平衡因子怎么算？']),
  ...answers('ds', 'faq-pilot-redblack', [
    '红黑树插入时叔叔节点是红色怎么处理？',
    '红黑树和 AVL 有什么区别？',
  ]),
  ...answers('ds', 'faq-pilot-heap', [
    '建堆的时间复杂度为什么是 O(n)？',
    'TopK 为什么用小根堆？',
  ]),
  ...answers('ds', 'faq-pilot-graph-store', ['邻接矩阵和邻接表怎么选？']),
  ...answers('ds', 'faq-pilot-bfs-dfs', [
    'BFS 和 DFS 的区别是什么？',
    '无权图最短路用 BFS 还是 DFS？',
  ]),
  ...answers('ds', 'faq-pilot-topo', ['拓扑排序怎么判断有环？']),
  ...answers('ds', 'faq-pilot-mst', [
    'Prim 和 Kruskal 怎么选？',
    '最小生成树和最短路径有什么区别？',
  ]),
  ...answers('ds', 'faq-pilot-stability', ['哪些排序是稳定的？']),
  ...answers('ds', 'faq-pilot-binary-search', ['二分查找边界怎么写不会死循环？']),
  ...answers('ds', 'faq-quicksort', ['快速排序最坏情况是什么？']),
  ...answers('ds', 'faq-hash', ['哈希冲突开放定址和链地址怎么选？']),
  ...answers('ds', 'faq-recursion', ['递归栈溢出怎么办？']),
  ...answers('ds', 'faq-dp', ['动态规划状态转移方程怎么找？']),
  ...answers('ds', 'faq-complexity', ['时间复杂度 O(log n) 和 O(n) 区别？']),
  ...answers('ds', 'faq-traversal', ['二叉树前中后序遍历怎么记？']),
  ...answers('ds', 'faq-list-select', ['数组和链表怎么选？']),
  ...answers('ds', 'faq-dijkstra', ['Dijkstra 为什么不能处理负权？']),
  ...escalates('ds', [
    '老师，能帮我看看这段 Java 报错吗？',
    '学校 ACM 队什么时候招新？',
    '考研 408 的复习顺序怎么安排？',
    '这道题直接告诉我选哪个。',
    '能帮我写一份课程设计报告吗？',
  ]),

  // 电路
  ...answers('circuit', 'faq-pilot-reference-power', [
    '参考方向算出来是负数怎么办？',
    '功率正负怎么判断吸收还是发出？',
  ]),
  ...answers('circuit', 'faq-pilot-superposition', [
    '叠加定理功率能不能叠加？',
    '叠加定理电压源电流源怎么置零？',
  ]),
  ...answers('circuit', 'faq-pilot-thevenin-controlled', [
    '含受控源的戴维南等效电阻怎么求？',
    '外加电源法怎么用？',
  ]),
  ...answers('circuit', 'faq-pilot-rc-three', [
    'RC 一阶电路三要素法怎么用？',
    '换路定则是什么？',
  ]),
  ...answers('circuit', 'faq-pilot-rlc-damping', [
    'RLC 串联怎么判断过阻尼？',
    '二阶电路阻尼比怎么算？',
  ]),
  ...answers('circuit', 'faq-pilot-phasor', [
    '相量法为什么能把微分变代数？',
    '相量法什么时候不能用？',
  ]),
  ...answers('circuit', 'faq-pilot-impedance-power', [
    '阻抗串并联怎么算？',
    '功率因数怎么提高？',
  ]),
  ...answers('circuit', 'faq-pilot-three-phase', [
    '三相星形线电压和相电压关系？',
    '三相功率怎么算？',
  ]),
  ...answers('circuit', 'faq-pilot-mutual', [
    '互感同名端怎么判断？',
    '互感去耦等效怎么画？',
  ]),
  ...answers('circuit', 'faq-pilot-resonance', [
    '串联谐振频率和品质因数怎么算？',
    '谐振带宽怎么算？',
  ]),
  ...answers('circuit', 'faq-pilot-two-port', [
    '二端口 Z 参数和 ABCD 怎么选？',
    '级联二端口用什么参数？',
  ]),
  ...answers('circuit', 'faq-pilot-ideal-opamp-circuit', [
    '理想运放虚短虚断怎么用？',
    '反相放大增益怎么算？',
  ]),
  ...answers('circuit', 'faq-circuit-theorems', [
    '叠加定理、戴维南和最大功率怎么用？',
  ]),
  ...answers('circuit', 'faq-circuit-analysis', [
    '节点电压法和回路电流法怎么选？',
  ]),
  ...escalates('circuit', [
    '实验室的示波器探头怎么校准？',
    '电路板焊盘掉了怎么补？',
    '这道题直接给答案。',
    '期末考试范围有哪些？',
    '能推荐一个电路仿真软件吗？',
  ]),

  // 模拟电子技术
  ...answers('analog', 'faq-pilot-diode', [
    '二极管导通怎么判断？',
    '理想二极管和恒压模型怎么选？',
  ]),
  ...answers('analog', 'faq-pilot-zener', [
    '稳压管限流电阻怎么算？',
    '怎么判断稳压管能不能稳压？',
  ]),
  ...answers('analog', 'faq-pilot-bjt-config', ['共射、共集、共基怎么区分？']),
  ...answers('analog', 'faq-pilot-emitter-follower', [
    '射极跟随器有什么作用？',
    '射极跟随器的电压增益为什么接近 1？',
  ]),
  ...answers('analog', 'faq-pilot-small-signal', [
    'r_be 怎么计算？',
    '共射放大倍数怎么估算？',
  ]),
  ...answers('analog', 'faq-pilot-diff-amp', [
    '差分放大为什么抑制共模？',
    'CMRR 是什么？',
  ]),
  ...answers('analog', 'faq-pilot-current-source', ['镜像电流源怎么算电流？']),
  ...answers('analog', 'faq-pilot-opamp-circuits', [
    '反相运放增益怎么算？',
    '积分运放电路怎么列式？',
  ]),
  ...answers('analog', 'faq-analog-opamp', ['比较器为什么不能虚短？']),
  ...answers('analog', 'faq-pilot-comparator', ['滞回比较器阈值怎么定？']),
  ...answers('analog', 'faq-pilot-class-ab', ['甲乙类功放为什么减小交越失真？']),
  ...answers('analog', 'faq-pilot-regulator', ['串联稳压电源由什么组成？']),
  ...answers('analog', 'faq-pilot-frequency-response', [
    '放大电路上限截止频率由什么决定？',
    '密勒效应是什么？',
  ]),
  ...answers('analog', 'faq-analog-qpoint', ['静态工作点怎么算？']),
  ...answers('analog', 'faq-analog-feedback', ['反馈组态怎么判断？']),
  ...answers('analog', 'faq-analog-opamp', ['虚短虚断什么时候能用？']),
  ...escalates('analog', [
    '老师，这个芯片在哪里能买到？',
    '能帮我调试一下 Arduino 程序吗？',
    '实验报告的数据处理怎么写？',
    '这道题直接告诉我选哪个。',
    '晶体管怎么焊接才不会虚焊？',
  ]),

  // 数字电子技术
  ...answers('digital', 'faq-pilot-number-system', [
    '负数补码怎么算？',
    'n 位补码范围是多少？',
  ]),
  ...answers('digital', 'faq-pilot-demorgan', [
    '德摩根定律怎么用？',
    '逻辑函数怎么化简？',
  ]),
  ...answers('digital', 'faq-pilot-cmos-ttl', [
    'CMOS 和 TTL 有什么区别？',
    '5V TTL 能直接接 3.3V CMOS 吗？',
  ]),
  ...answers('digital', 'faq-pilot-encoder-decoder', [
    '3-8 译码器怎么实现逻辑函数？',
    '编码器和译码器区别？',
  ]),
  ...answers('digital', 'faq-pilot-mux', ['数据选择器怎么实现逻辑函数？']),
  ...answers('digital', 'faq-pilot-adder', [
    '全加器和半加器区别？',
    '补码减法怎么实现？',
  ]),
  ...answers('digital', 'faq-pilot-flipflop', [
    'D 触发器怎么转 JK？',
    'JK 触发器特征方程？',
  ]),
  ...answers('digital', 'faq-pilot-state-machine', [
    '时序逻辑设计步骤？',
    '米利型和摩尔型区别？',
  ]),
  ...answers('digital', 'faq-pilot-counter', [
    '怎么用计数器构造 N 进制？',
    '计数器清零法和置数法区别？',
  ]),
  ...answers('digital', 'faq-pilot-shift-register', ['移位寄存器能做什么？']),
  ...answers('digital', 'faq-pilot-555', [
    '555 单稳态脉宽怎么算？',
    '555 多谐振荡频率怎么算？',
  ]),
  ...answers('digital', 'faq-pilot-adc-dac', [
    'ADC 分辨率和量化误差怎么算？',
    '采样定理是什么？',
  ]),
  ...answers('digital', 'faq-pilot-memory', [
    'SRAM 和 DRAM 区别？',
    'FPGA 和 ROM 有什么区别？',
  ]),
  ...answers('digital', 'faq-digital-kmap', ['卡诺图化简步骤？']),
  ...answers('digital', 'faq-digital-seq', ['时序逻辑电路怎么分析？']),
  ...answers('digital', 'faq-digital-comb', ['组合逻辑怎么设计？']),
  ...escalates('digital', [
    '老师，Verilog 代码报错怎么查？',
    '老师，实验箱在哪里借？',
    '实验报告怎么写？',
    '这道题直接给答案。',
    '计算机二级考试什么时候报名？',
  ]),
]
