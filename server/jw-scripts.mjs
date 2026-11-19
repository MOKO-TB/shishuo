/**
 * In-page scripts for the 教务 bridge.
 * Plain .mjs so both the Vite proxy (TS) and the offline checker can import the
 * exact same source — a copy would drift.
 */

/** Pick the semester select, choose 全部学期 (or a given value), then press 查询. */
export function scoresQueryScript(target = '__all__') {
  return `(() => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim()
  const result = {
    select: false,
    all: false,
    optionText: '',
    clicked: false,
    via: '',
    options: []
  }

  const selects = Array.from(document.querySelectorAll('select'))
  const semesterSelect =
    selects.find((select) =>
      Array.from(select.options).some((option) => /全部|所有/.test(option.textContent || '')),
    ) ||
    selects.find((select) => /xnxq|xnq|xq|semester|term|学期/i.test((select.name || '') + ' ' + (select.id || '')))
  if (!semesterSelect) return result
  result.select = true
  const options = Array.from(semesterSelect.options).map((option) => ({
    value: option.value,
    text: clean(option.textContent),
  }))
  result.options = options

  const target = ${JSON.stringify(target)}
  const wanted =
    target === '__all__'
      ? options.find((option) => /全部|所有/.test(option.text)) ||
        options.find((option) => option.value === '' && !/请|选择|--/.test(option.text))
      : options.find((option) => option.value === target) || options.find((option) => option.text.includes(target))
  if (wanted) {
    const before = semesterSelect.value
    semesterSelect.value = wanted.value
    if (before !== wanted.value) {
      semesterSelect.dispatchEvent(new Event('change', { bubbles: true }))
      semesterSelect.dispatchEvent(new Event('input', { bubbles: true }))
    }
    result.all = target === '__all__' && /全部|所有/.test(wanted.text)
    result.optionText = wanted.text
  }

  const isQuery = (el) => {
    const text = clean(el.value || el.textContent)
    return /查\\s*询|检\\s*索|搜\\s*索/.test(text) && !/成绩|打印|导出|清空|重置|返回|首页/.test(text)
  }
  const pick = (list) => list.find((el) => el.tagName !== 'A' && isQuery(el)) || list.find(isQuery)
  const scope =
    (semesterSelect.form || semesterSelect.closest('form') || semesterSelect.parentElement || document)
  const scoped = Array.from(scope.querySelectorAll('input[type=button], input[type=submit], button, a'))
  const globalList = Array.from(document.querySelectorAll('input[type=button], input[type=submit], button, a'))
  const query = pick(scoped) || pick(globalList)
  if (query) {
    query.click()
    result.clicked = true
    result.via = 'button'
  } else {
    const form = semesterSelect.form || semesterSelect.closest('form')
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.submit()
      result.clicked = true
      result.via = 'form'
    }
  }
  return result
})()`
}
