/**
 * 语音输入（听写）：基于浏览器 Web Speech API（Chrome / Edge）。
 * 只在支持的环境里启用；不支持时 createDictation 返回 null，由调用方降级提示。
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
  length: number
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}

interface SpeechRecognitionErrorEventLike {
  error?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as Record<string, unknown>
  const ctor = (scope.SpeechRecognition ?? scope.webkitSpeechRecognition) as
    | SpeechRecognitionCtor
    | undefined
  return typeof ctor === 'function' ? ctor : null
}

export function speechSupported() {
  return getRecognitionCtor() !== null
}

export interface DictationHandle {
  stop: () => void
}

/** 开启一次听写会话；final 文本逐段回调，interim 用于实时提示。 */
export function createDictation({
  lang = 'zh-CN',
  onText,
  onEnd,
}: {
  lang?: string
  onText: (text: string, isFinal: boolean) => void
  onEnd: (reason: 'done' | 'error') => void
}): DictationHandle | null {
  const Ctor = getRecognitionCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let ended = false
  const finish = (reason: 'done' | 'error') => {
    if (ended) return
    ended = true
    onEnd(reason)
  }

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result[0]?.transcript ?? ''
      if (transcript) onText(transcript, result.isFinal)
    }
  }
  recognition.onerror = (event) => {
    // no-speech / aborted 属于正常结束；not-allowed / network 等交给调用方提示。
    finish(event?.error && event.error !== 'no-speech' && event.error !== 'aborted' ? 'error' : 'done')
  }
  recognition.onend = () => finish('done')

  recognition.start()
  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        finish('done')
      }
    },
  }
}
