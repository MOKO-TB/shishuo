import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true, watch: { ignored: ['**/*'] } },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const seed = await server.ssrLoadModule('/src/data/seed.ts')
  const engine = await server.ssrLoadModule('/src/lib/engine.ts')
  const tools = await server.ssrLoadModule('/src/lib/teacherTools.ts')
  const qr = await server.ssrLoadModule('/src/lib/qrcode.ts')

  const data = seed.createSeedData()
  const now = Date.now()

  // 1. QR 码生成校验
  const matrix = qr.encodeQrMatrix('http://127.0.0.1:5173/?view=student&wall=1&course=ds&session=wall-1')
  assert.ok(Array.isArray(matrix) && matrix.length >= 21, 'QR 矩阵尺寸应至少为 21x21')
  assert.equal(matrix.length, matrix[0].length, 'QR 矩阵应为正方形')
  assert.equal(matrix[0][0], true, '左上角定位块应为深色')
  assert.equal(matrix[0][matrix.length - 1], true, '右上角定位块应为深色')
  assert.equal(matrix[matrix.length - 1][0], true, '左下角定位块应为深色')

  // 2. 本节提问墙：30 名学生围绕 5 类主题的提问自动归并
  const wallSessionId = 'wall-ds-demo'
  const topicTemplates = [
    {
      q: [
        '动态规划的状态转移方程怎么找？',
        '做动态规划题目时状态转移方程老是写不出来怎么办？',
        '动态规划怎么确定状态定义和转移方程？',
        '老师，DP 的状态转移方程一般从哪里找规律？',
        '写动态规划时状态转移方程怎么推导出？',
        '动态规划状态转移方程总漏掉边界情况怎么办？',
      ],
      aiSolved: true,
      source: 'faq-ds-dp',
    },
    {
      q: [
        '哈希表冲突有哪些解决办法？',
        '散列表发生哈希冲突怎么处理？',
        '哈希表冲突解决的开放定址法和拉链法有什么区别？',
        '哈希冲突时拉链法和线性探测怎么选？',
        '散列冲突处理办法有哪些，各自缺点是什么？',
        '哈希表发生冲突以后怎么解决冲突？',
      ],
      aiSolved: true,
      source: 'faq-ds-hash',
    },
    {
      q: [
        '红黑树删除节点后为什么要向兄弟节点借黑色？',
        '红黑树删除节点调整时为什么要向兄弟借黑节点？',
        '红黑树删除黑色节点后如何向兄弟借黑色并旋转？',
        '红黑树删除操作向兄弟借黑节点破坏黑高怎么理解？',
        '红黑树删除节点向兄弟节点借黑色的几种情况怎么记？',
        '为什么红黑树删除后要从兄弟借黑色节点？',
      ],
      aiSolved: false,
    },
    {
      q: [
        'KMP 算法的 next 数组为什么向右移动一位后整体减一？',
        'KMP 求 next 数组时前缀后缀最长公共长度怎么手算？',
        'KMP 的 next 数组手算老是差一位怎么理解？',
        '串匹配 KMP 算法里 next 数组定义为什么有减一版本？',
        'KMP 算法 next 数组下标从 0 还是从 1 开始算？',
        '手算 KMP 的 next 数组怎么避免算错？',
      ],
      aiSolved: false,
    },
    {
      q: [
        'B+ 树和 B 树在数据库索引里为什么更常用 B+ 树？',
        'B 树与 B+ 树的核心区别是什么，为什么索引选 B+ 树？',
        'B+ 树非叶子节点不存数据记录有什么好处？',
        '对比 B 树和 B+ 树的范围查询效率差异？',
        '为什么 MySQL 索引不用 B 树而用 B+ 树？',
        'B+ 树和 B 树节点分裂与叶子链表区别是什么？',
      ],
      aiSolved: false,
    },
  ]

  const wallThreads = []
  let idx = 0
  for (const group of topicTemplates) {
    for (const q of group.q) {
      idx += 1
      wallThreads.push({
        id: `t-wall-${idx}`,
        courseId: 'ds',
        student: { id: `stu-${idx}`, name: `学生${idx}`, anonymous: true },
        question: q,
        createdAt: now - (30 - idx) * 5_000,
        status: group.aiSolved ? 'ai' : 'pending',
        aiAnswer: group.aiSolved ? '参考课程 FAQ 解答' : undefined,
        confidence: group.aiSolved ? 'high' : 'low',
        confidenceScore: group.aiSolved ? 0.72 : 0.14,
        sources: group.source ? [group.source] : [],
        wallSessionId,
        wallTopic: '期中前串讲',
        ...(group.aiSolved
          ? {}
          : {
              escalation: {
                title: q.slice(0, 24),
                note: 'AI 没把握，自动转交',
                anonymous: true,
                urgency: 'week',
                at: now - (30 - idx) * 5_000,
                auto: true,
              },
            }),
      })
    }
  }

  const wallClusters = engine.clusterClassroomThreads(wallThreads, 'ds')
  const totalMergedCount = wallClusters.reduce((sum, item) => sum + item.totalCount, 0)
  assert.equal(totalMergedCount, 30, '归并后的提问总人次应为 30')
  assert.ok(
    wallClusters.length >= 4 && wallClusters.length <= 7,
    `30 条提问应自动归并为约 5 类（实测 ${wallClusters.length} 类）`,
  )
  assert.ok(
    wallClusters.some((c) => c.pendingCount > 0 && c.pendingGroupKey),
    '需人工介入的归并类应关联 pendingGroupKey',
  )

  // 3. 期末复习包：按提问频次、低置信度、未解决状态排序与导出
  const combinedThreads = [...wallThreads, ...data.threads]
  const byFreq = tools.buildFinalReviewPack(combinedThreads, data.faqs, ['ds'], 'frequency')
  assert.ok(byFreq.length >= 5, '复习包应汇总出高频专题')
  for (let i = 1; i < byFreq.length; i += 1) {
    assert.ok(byFreq[i - 1].frequency >= byFreq[i].frequency, '按频次排序应非递增')
  }
  const byLow = tools.buildFinalReviewPack(combinedThreads, data.faqs, ['ds'], 'low-confidence')
  for (let i = 1; i < byLow.length; i += 1) {
    assert.ok(
      byLow[i - 1].lowConfidenceCount >= byLow[i].lowConfidenceCount,
      '按低置信度排序应非递增',
    )
  }
  const byUnresolved = tools.buildFinalReviewPack(combinedThreads, data.faqs, ['ds'], 'unresolved')
  for (let i = 1; i < byUnresolved.length; i += 1) {
    assert.ok(
      byUnresolved[i - 1].unresolvedCount >= byUnresolved[i].unresolvedCount,
      '按未解决排序应非递增',
    )
  }
  const md = tools.exportReviewPackMarkdown(byFreq, {
    teacherName: '陈砚',
    courseLabel: '数据结构',
    includeAnswers: true,
  })
  assert.ok(md.includes('期末复习清单') && md.includes('- [ ]'), 'Markdown 导出格式应包含复选清单')
  const csv = tools.exportReviewPackCsv(byFreq, { includeAnswers: true })
  assert.ok(csv.startsWith('\uFEFF"优先级排名","课程"'), 'CSV 导出应包含 UTF-8 BOM 与表头')

  // 4. 下节课开场卡：基于知识缺口生成 3 条，含缺口描述 + 一句话讲法 + 关联 FAQ
  const gaps = engine.computeGaps(combinedThreads, data.faqs)
  const openingCards = tools.buildOpeningCards(gaps, combinedThreads, data.faqs, ['ds'])
  assert.equal(openingCards.length, 3, '应自动生成 3 条下节课开场卡')
  for (const card of openingCards) {
    assert.ok(card.gapDescription.length > 5, '每条开场卡必须有缺口描述')
    assert.ok(card.oneLiner.length > 5, '每条开场卡必须有一句话讲法')
    assert.ok(card.relatedFaq && card.relatedFaq.id && card.relatedFaq.question, '每条应关联 FAQ')
  }
  const announcement = tools.formatOpeningCardsAnnouncement(openingCards, '数据结构')
  assert.ok(
    announcement.includes('缺口描述：') &&
      announcement.includes('一句话讲法：') &&
      announcement.includes('关联 FAQ：'),
    '公告格式化应完整包含三要素',
  )

  console.log('✓ QR 矩阵、30→' + wallClusters.length + ' 类提问墙归并、期末复习包排序导出、3 条开场卡测试全部通过')
} finally {
  await server.close()
}
