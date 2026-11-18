/**
 * 校园问答检索评测：复用真实 retrieve 代码，检查 Top-1 命中与负例转人工。
 *
 * 运行：npm run eval:campus
 * 门槛：可答问题 Top-1 ≥ 85%，负例转人工 ≥ 75%；低于门槛返回非 0。
 */
import { createServer } from 'vite'

const ANSWER_THRESHOLD = 0.85
const ESCALATE_THRESHOLD = 0.75

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const campus = await server.ssrLoadModule('/src/data/campusFaqs.ts')
  const evaluation = await server.ssrLoadModule('/src/data/campusEval.ts')
  const engine = await server.ssrLoadModule('/src/lib/engine.ts')

  const faqs = campus.createCampusFaqs()
  const cases = evaluation.CAMPUS_EVAL_CASES
  const faqIds = new Set(faqs.map((faq) => faq.id))

  const missingExpected = cases.filter(
    (test) => test.expectedFaqId && !faqIds.has(test.expectedFaqId),
  )
  if (missingExpected.length > 0) {
    console.error('校园评测集引用了不存在的 FAQ：')
    for (const test of missingExpected) console.error(`  ${test.id} -> ${test.expectedFaqId}`)
    process.exitCode = 1
  } else {
    let answerTotal = 0
    let answerPass = 0
    let escalateTotal = 0
    let escalatePass = 0
    const failures = []

    for (const test of cases) {
      const result = engine.retrieve(faqs, test.question, 'campus')
      if (test.expect === 'answer') {
        answerTotal += 1
        const passed = result.confidence !== 'low' && result.top?.faq.id === test.expectedFaqId
        if (passed) answerPass += 1
        else {
          failures.push({
            test,
            confidence: result.confidence,
            top: result.top?.faq.id ?? '-',
            topQuestion: result.top?.faq.question ?? '-',
            missing: result.missingTerms ?? [],
          })
        }
      } else {
        escalateTotal += 1
        const passed = result.confidence === 'low'
        if (passed) escalatePass += 1
        else {
          failures.push({
            test,
            confidence: result.confidence,
            top: result.top?.faq.id ?? '-',
            topQuestion: result.top?.faq.question ?? '-',
            missing: result.missingTerms ?? [],
          })
        }
      }
    }

    const pct = (passed, total) => (total > 0 ? passed / total : 0)
    const answerRate = pct(answerPass, answerTotal)
    const escalateRate = pct(escalatePass, escalateTotal)
    console.log(`\n师说 · 校园问答检索评测（${cases.length} 个问题）`)
    console.log(`可答问题 Top-1：${answerPass}/${answerTotal}（${(answerRate * 100).toFixed(1)}%）`)
    console.log(`负例转人工：${escalatePass}/${escalateTotal}（${(escalateRate * 100).toFixed(1)}%）`)
    console.log(`门槛：可答 ≥ ${(ANSWER_THRESHOLD * 100).toFixed(0)}% · 负例 ≥ ${(ESCALATE_THRESHOLD * 100).toFixed(0)}%`)

    if (failures.length > 0) {
      console.log('\n未通过明细：')
      for (const failure of failures) {
        console.log(
          `  [${failure.test.id}] ${failure.test.question}\n` +
            `    期望 ${failure.test.expect}${failure.test.expectedFaqId ? ` ${failure.test.expectedFaqId}` : ''} · ` +
            `实际 ${failure.confidence} · top ${failure.top} ${failure.topQuestion}` +
            (failure.missing.length ? ` · 未覆盖 ${failure.missing.join('/')}` : ''),
        )
      }
    }

    if (answerRate < ANSWER_THRESHOLD || escalateRate < ESCALATE_THRESHOLD) {
      console.error('\n校园评测未达标。')
      process.exitCode = 1
    } else {
      console.log('\n校园评测通过。')
    }
  }
} finally {
  await server.close()
}
