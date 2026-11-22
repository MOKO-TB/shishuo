(() => {
  const params = new URLSearchParams(window.location.search)
  const courseId = (params.get('course') || '').trim()
  const sessionId = (params.get('session') || '').trim()

  const $ = (id) => document.getElementById(id)
  const loading = $('loading-card')
  const closed = $('closed-card')
  const errorCard = $('error-card')
  const form = $('ask-form')
  const question = $('question')
  const count = $('count')
  const submit = $('submit-button')
  const result = $('result-card')
  const resultMark = $('result-mark')
  const resultTitle = $('result-title')
  const answerBox = $('answer-box')
  const answerText = $('answer-text')
  const resultHint = $('result-hint')

  let active = false

  function show(el) {
    el.classList.remove('is-hidden')
  }

  function hide(el) {
    el.classList.add('is-hidden')
  }

  function setMeta(info) {
    $('course-name').textContent = info.courseName || '本节提问墙'
    const bits = []
    if (info.teacher) bits.push(info.teacher + '老师')
    if (info.topic) bits.push(info.topic)
    $('course-meta').textContent = bits.join(' · ')
    document.title = `${info.courseName || '本节提问墙'} · 师说`
  }

  function showError(message) {
    hide(loading)
    hide(form)
    hide(closed)
    $('error-copy').textContent = message
    show(errorCard)
  }

  async function loadInfo() {
    if (!courseId || !sessionId) {
      showError('链接缺少课程或场次信息，请重新扫描老师投屏的二维码。')
      return
    }
    try {
      const response = await fetch(
        `/api/wall/info?course=${encodeURIComponent(courseId)}&session=${encodeURIComponent(sessionId)}`,
        { headers: { Accept: 'application/json' } },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) {
        showError(data?.error?.message || '链接对应的提问墙不存在，请重新扫码。')
        return
      }
      setMeta(data)
      hide(loading)
      active = data.active === true
      if (active) {
        show(form)
        question.focus({ preventScroll: true })
      } else {
        show(closed)
      }
    } catch {
      showError('暂时连不上课堂，请检查网络后刷新。')
    }
  }

  async function submitQuestion(event) {
    event.preventDefault()
    if (!active || submit.disabled) return
    const text = question.value.trim()
    if (text.length < 2) {
      question.focus()
      return
    }
    submit.disabled = true
    submit.textContent = '正在提交…'
    try {
      const response = await fetch('/api/wall/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          courseId,
          sessionId,
          question: text,
          website: form.elements.website?.value || '',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        const message = data?.error?.message || '提交失败，请稍后再试。'
        if (response.status === 410) {
          active = false
          hide(form)
          show(closed)
        }
        resultHint.textContent = message
        hide(form)
        show(result)
        resultMark.textContent = '!'
        resultMark.classList.add('is-closed')
        resultTitle.textContent = '这次没有提交成功'
        hide(answerBox)
        return
      }
      hide(form)
      show(result)
      resultMark.textContent = '✓'
      resultMark.classList.remove('is-closed')
      resultTitle.textContent = '已收到你的问题'
      if (data.answer) {
        answerText.textContent = data.answer
        show(answerBox)
        resultHint.textContent = 'AI 先给了一个参考答案；老师会在课上统一确认。'
      } else {
        hide(answerBox)
        resultHint.textContent = '老师会在课上统一处理；同类问题会自动归并。'
      }
      question.value = ''
      updateCount()
    } catch {
      resultHint.textContent = '网络不太稳定，请稍后再试。'
      hide(form)
      show(result)
      resultMark.textContent = '!'
      resultMark.classList.add('is-closed')
      resultTitle.textContent = '这次没有提交成功'
      hide(answerBox)
    } finally {
      submit.disabled = false
      submit.textContent = '匿名提交'
    }
  }

  function updateCount() {
    count.textContent = `${question.value.length} / 500`
  }

  question?.addEventListener('input', updateCount)
  form?.addEventListener('submit', submitQuestion)
  $('ask-again')?.addEventListener('click', () => {
    hide(result)
    answerBox.classList.add('is-hidden')
    resultMark.classList.remove('is-closed')
    if (active) {
      show(form)
      question.focus({ preventScroll: true })
    } else {
      show(closed)
    }
  })

  updateCount()
  void loadInfo()
})()
