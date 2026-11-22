import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './nativeShell'

interface ChaoxingAppPlugin {
  open(options: { url?: string }): Promise<{ opened: boolean }>
}

const ChaoxingApp = registerPlugin<ChaoxingAppPlugin>('ChaoxingApp')

/** 尝试交给手机版学习通 App；未安装/未处理返回 false。 */
export async function openChaoxingAppNative(url = '') {
  if (!isNativeApp()) return false
  try {
    const result = await ChaoxingApp.open({ url })
    return result?.opened === true
  } catch {
    return false
  }
}
