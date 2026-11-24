import { chromium } from 'playwright-core'
const b=await chromium.launch({channel:'msedge'})
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
await p.goto('http://localhost:5200/',{waitUntil:'networkidle'}); await p.waitForTimeout(600)
await p.getByText('学生 · 林晓').click(); await p.getByRole('button',{name:'登录',exact:true}).click(); await p.waitForTimeout(2400)
// mentor drawer
await p.getByText('数据结构导师',{exact:true}).first().click(); await p.waitForTimeout(1200)
console.log('MENTOR TABS:\n'+(await p.locator('body').innerText()).slice(-1600))
// click 数电 tab
const dg=p.getByText('数字电子技术基础',{exact:true}).first()
console.log('dg count',await dg.count())
if(await dg.count()){ await dg.click(); await p.waitForTimeout(1000); console.log('DG:\n'+(await p.locator('body').innerText()).slice(-1800)); await p.screenshot({path:'promo/full/assets/dg-probe.png'}) }
// list buttons in drawer
const btns=await p.locator('.mentor-drawer button, .mentor-panel button, [class*=mentor] button').allInnerTexts().catch(()=>[])
console.log('BTNS',btns.slice(0,40))
await b.close()
