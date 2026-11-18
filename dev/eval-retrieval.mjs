import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const seed = await server.ssrLoadModule('/src/data/seed.ts')
  const engine = await server.ssrLoadModule('/src/lib/engine.ts')
  const evaluation = await server.ssrLoadModule('/src/data/pilotEval.ts')
  const data = seed.createSeedData()
  const cases = evaluation.PILOT_EVAL_CASES

  const missingExpected = []
  const faqIds = new Set(data.faqs.map((faq) => faq.id))
  for (const test of cases) {
    if (test.expectedFaqId && !faqIds.has(test.expectedFaqId)) {
      missingExpected.push(`${test.id} -> ${test.expectedFaqId}`)
    }
  }
  if (missingExpected.length > 0) {
    console.error('评测集引用了不存在的 FAQ：')
    for (const line of missingExpected) console.error('  ' + line)
    process.exitCode = 1
  }

  const courses = ['math', 'ds', 'circuit', 'analog', 'digital']
  const stats = new Map(
    courses.map((courseId) => [
      courseId,
      {
        total: 0,
        answer: 0,
        escalate: 0,
        answerPass: 0,
        escalatePass: 0,
        failures: [],
      },
    ]),
  )

  for (const test of cases) {
    const result = engine.retrieve(data.faqs, test.question, test.courseId)
    const entry = stats.get(test.courseId)
    entry.total += 1
    if (test.expect === 'answer') {
      entry.answer += 1
      const passed = result.confidence !== 'low' && result.top?.faq.id === test.expectedFaqId
      if (passed) entry.answerPass += 1
      else {
        entry.failures.push({
          question: test.question,
          expected: test.expectedFaqId,
          expectedKind: 'answer',
          confidence: result.confidence,
          top: result.top?.faq.id ?? '-',
          topQuestion: result.top?.faq.question ?? '-',
          missing: result.missingTerms ?? [],
        })
      }
    } else {
      entry.escalate += 1
      const passed = result.confidence === 'low'
      if (passed) entry.escalatePass += 1
      else {
        entry.failures.push({
          question: test.question,
          expected: 'escalate',
          expectedKind: 'escalate',
          confidence: result.confidence,
          top: result.top?.faq.id ?? '-',
          topQuestion: result.top?.faq.question ?? '-',
          missing: result.missingTerms ?? [],
        })
      }
    }
  }

  const pct = (passed, total) => (total > 0 ? `${((passed / total) * 100).toFixed(1)}%` : '-')
  let totalCases = 0
  let totalPass = 0
  console.log(`\n师说 · 5 门试点课检索评测（${cases.length} 个问题）`)
  console.log('课程      用例  可答  应转人工  可答通过  转人工通过  总通过率')
  for (const courseId of courses) {
    const item = stats.get(courseId)
    const pass = item.answerPass + item.escalatePass
    totalCases += item.total
    totalPass += pass
    console.log(
      `${courseId.padEnd(8)} ${String(item.total).padStart(4)} ${String(item.answer).padStart(5)} ${String(item.escalate).padStart(9)} ${pct(item.answerPass, item.answer).padStart(9)} ${pct(item.escalatePass, item.escalate).padStart(11)} ${pct(pass, item.total).padStart(10)}`,
    )
  }
  console.log(`\n总计：${totalPass}/${totalCases}（${pct(totalPass, totalCases)}）`)

  const failures = courses.flatMap((courseId) =>
    stats.get(courseId).failures.map((failure) => ({ courseId, ...failure })),
  )
  if (failures.length > 0) {
    console.log('\n失败明细：')
    for (const failure of failures) {
      console.log(
        `- [${failure.courseId}] ${failure.question}\n  期望 ${failure.expected}，实际 ${failure.confidence}，Top=${failure.top}《${failure.topQuestion}》${failure.missing.length ? `，未覆盖：${failure.missing.join('、')}` : ''}`,
      )
    }
    process.exitCode = 1
  } else {
    console.log('\n全部通过。')
  }
} finally {
  await server.close()
}
