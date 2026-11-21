import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 安卓壳工程配置。
 *
 * 采用远程加载（server.url）而不是把 dist 打包进 APK：
 * - 与网页同源，HttpOnly Cookie / localStorage 原样可用，后端零改动；
 * - 前端发版后 App 无需重新发版；
 * - 代价是必须联网（本产品的 AI / 教务 / 学习通功能本来就需要联网）。
 *
 * 本地联调时指定局域网地址即可，例如：
 *   SHISHUO_APP_URL=http://192.168.1.10:8787 npm run android:sync
 */
const serverUrl = process.env.SHISHUO_APP_URL || 'http://121.37.30.147'

const config: CapacitorConfig = {
  appId: 'com.shishuo.app',
  appName: '师说',
  // 只打包一张极小的离线兜底页；网页本身走 server.url 远程加载，
  // 不把 dist（含 150MB 食堂图片）塞进 APK。
  webDir: 'android-shell',
  backgroundColor: '#f4f0e6',
  server: {
    url: serverUrl,
    // 生产目前是纯 HTTP（无域名证书），安卓 9+ 默认禁止明文流量。
    cleartext: true,
    // 主框架加载失败时落到本地品牌兜底页，而不是 WebView 的系统错误页。
    errorPath: 'index.html',
  },
  android: {
    // 移动端不需要双指缩放页面，关掉更接近原生手感。
    zoomEnabled: false,
  },
  plugins: {
    // 系统栏图标颜色由网页在主题/路由变化时通过 SystemBars 动态切换。
    // 安全区改由 MainActivity 自己注入 CSS 变量：Capacitor 8 在 WebView < 140 时
    // 会退回“原生给 WebView 加 padding”，无法做到透明沉浸。
    SystemBars: {
      style: 'LIGHT',
      insetsHandling: 'disable',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
