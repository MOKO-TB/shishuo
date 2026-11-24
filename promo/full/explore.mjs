import { chromium } from 'playwright-core'
const BASE='http://localhost:5200/'
const b=await chromium.launch({channel:'msedge'})
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
const p=await ctx.newPage()
await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(600)
await p.getByText('学生 · 林晓').click(); await p.getByRole('button',{name:'登录',exact:true}).click(); await p.waitForTimeout(2400)
console.log('HOME\n'+(await p.locator('body').innerText()).slice(0,600))
// archive
const viewAll=p.getByText('查看全部',{exact:true}).first()
if(await viewAll.count()){ await viewAll.click(); await p.waitForTimeout(1200); console.log('ARCHIVE\n'+(await p.locator('body').innerText()).slice(-1600)); await p.screenshot({path:'promo/full/assets/archive-probe.png'}); await p.keyboard.press('Escape'); await p.waitForTimeout(500) }
// review
const review=p.getByText('复习卡',{exact:true}).first()
if(await review.count()){ await review.click(); await p.waitForTimeout(1200); console.log('REVIEW\n'+(await p.locator('body').innerText()).slice(-1200)); await p.screenshot({path:'promo/full/assets/review-probe.png'}); await p.keyboard.press('Escape'); await p.waitForTimeout(500) }
await b.close()
