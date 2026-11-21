/**
 * 弹层栈：让安卓返回键一次只关最上面一层。
 *
 * Modal / Drawer 打开时把 onClose 压栈，关闭时出栈；
 * MainActivity 通过 window.__shishuoNativeBack 调 closeTopOverlay()。
 * 真实 Escape 键仍然由各弹层自己的 keydown 监听处理。
 */

const stack: Array<() => void> = []

export function pushOverlay(close: () => void) {
  stack.push(close)
}

export function popOverlay(close: () => void) {
  const index = stack.lastIndexOf(close)
  if (index >= 0) stack.splice(index, 1)
}

export function closeTopOverlay() {
  const close = stack[stack.length - 1]
  if (!close) return false
  close()
  return true
}
