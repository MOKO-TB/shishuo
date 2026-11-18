/**
 * Offline check for the 成绩查询 automation script (no 教务 account needed).
 * Feeds 强智-like markup into a real browser and asserts the script does the right thing.
 *
 *   node dev/check-jw-scores.mjs
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { scoresQueryScript } from './jw-scripts.mjs'

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

const executablePath = BROWSERS.find((candidate) => existsSync(candidate))
if (!executablePath) {
  console.error('没有找到 Edge 或 Chrome，无法运行检查。')
  process.exit(2)
}

let failures = 0
function check(ok, label) {
  console.log(`${ok ? 'ok ' : 'BAD'} ${label}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage()

async function evaluate(html, target = '__all__') {
  await page.setContent(html)
  const result = await page.evaluate(scoresQueryScript(target))
  return { result, state: await page.evaluate(() => ({
    value: document.querySelector('select')?.value ?? null,
    tableShown: document.getElementById('t')?.style.display ?? '',
    navClicked: Boolean(window.navClicked),
    submitted: Boolean(window.submitted),
    clicks: window.q ?? 0,
  })) }
}

// A · 典型强智：全部学期 + 查询按钮 + 一个会长得像按钮的「成绩查询」导航链接
{
  const { result, state } = await evaluate(`
    <form id="f">
      <a href="#" onclick="window.navClicked = true; return false">成绩查询</a>
      <select name="xnxq">
        <option value="">全部学期</option>
        <option value="2025-1">2025-2026-1</option>
        <option value="2025-2">2025-2026-2</option>
      </select>
      <input type="button" value="查 询" onclick="document.getElementById('t').style.display='table'">
      <table id="t" style="display:none"><tr><th>课程名称</th><th>成绩</th></tr>
        <tr><td>大学英语</td><td>88</td></tr></table>
    </form>`)
  check(result.select && result.all, 'A 找到学期下拉并选中「全部学期」')
  check(result.optionText === '全部学期', `A 选中的选项文案是全部学期（实际：${result.optionText}）`)
  check(result.clicked && result.via === 'button', 'A 点到了查询按钮')
  check(state.tableShown === 'table', 'A 查询确实被执行（表格出现）')
  check(!state.navClicked, 'A 没有误点导航里的「成绩查询」链接')
  check(state.value === '', 'A 下拉的值停在全部学期')
}

// B · 没有「全部学期」：不假装选上了，交给调用方逐学期读取
{
  const { result } = await evaluate(`
    <form>
      <select name="xnxq">
        <option value="2025-1">2025-2026-1</option>
        <option value="2025-2">2025-2026-2</option>
      </select>
      <input type="button" value="查询" onclick="window.q = (window.q || 0) + 1">
    </form>`)
  check(result.select && !result.all, 'B 无全部学期时不虚报 all')
  check(result.options.length === 2, 'B 返回全部学期选项供逐学期读取')
  check(result.clicked, 'B 仍然按当前学期查询')
}

// C · 占位项「请选择学期」不能被当成全部学期
{
  const { result, state } = await evaluate(`
    <form>
      <select name="xnxq">
        <option value="">请选择学期</option>
        <option value="2025-1">2025-2026-1</option>
      </select>
      <input type="button" value="查询">
    </form>`)
  check(!result.all && state.value === '', 'C 占位项不会被选成全部学期')
}

// D · 没有查询按钮时提交表单
{
  const { result, state } = await evaluate(`
    <form onsubmit="window.submitted = true; return false">
      <select name="xnxq"><option value="">全部学期</option></select>
    </form>`)
  check(result.clicked && result.via === 'form', 'D 没有按钮时提交表单')
  check(state.submitted, 'D 表单提交事件确实触发')
}

// E · 指定学期（逐学期兜底用）
{
  const { result, state } = await evaluate(
    `<select name="xnxq">
       <option value="">全部学期</option>
       <option value="2025-2">2025-2026-2</option>
     </select>`,
    '2025-2',
  )
  check(state.value === '2025-2' && result.clicked === false, 'E 指定学期时只改下拉')
}

await browser.close()
console.log(`\n${failures === 0 ? '全部通过' : `失败 ${failures} 项`}`)
process.exit(failures === 0 ? 0 : 1)
