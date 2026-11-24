import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE='http://localhost:5200/'
const OUT='promo/full/assets'
fs.mkdirSync(OUT,{recursive:true})
const css=`html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
  .guide-button{display:none!important}
  .ask-submit[disabled]{opacity:1!important;background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important}`
async function login(page,role){
  await page.goto(BASE,{waitUntil:'networkidle'}); await page.waitForTimeout(600)
  await page.getByText(role==='student'?'学生 · 林晓':'教师 · 陈砚（管理员）').click()
  await page.getByRole('button',{name:'登录',exact:true}).click(); await page.waitForTimeout(2400)
}
async function clean(page){
  await page.addStyleTag({content:css})
  await page.evaluate(()=>{
    for(const el of document.querySelectorAll('button,span,div,a')){
      const t=(el.textContent||'').trim()
      if(t==='AI 未配置'){const b=el.closest('button'); if(b)b.style.display='none'}
      if(t==='演示指引'||t==='看演示指引') el.style.display='none'
    }
    document.querySelectorAll('.daily-card,.class-card,.side-timetable').forEach(el=>el.remove())
  })
}
async function shot(page,name,top=true){
  if(top) await page.evaluate(()=>window.scrollTo(0,0))
  await page.waitForTimeout(350)
  await page.screenshot({path:`${OUT}/${name}.png`})
  console.log('saved',name)
}
const b=await chromium.launch({channel:'msedge'})

// ---------- student ----------
{
  const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
  const p=await ctx.newPage()
  await login(p,'student'); await clean(p)
  // archive
  try{
    await p.getByText('查看全部',{exact:true}).first().click(); await p.waitForTimeout(1000)
    const q=p.getByPlaceholder('搜索问题、老师回复或课程').first()
    if(await q.count()){await q.fill('动态规划'); await p.waitForTimeout(900)}
    await shot(p,'archive')
    await p.locator('.modal-close').first().click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(500)
  }catch(e){console.log('archive fail',e.message.slice(0,80))}
  // review
  try{
    await p.getByText('复习卡',{exact:true}).first().click(); await p.waitForTimeout(1000)
    await shot(p,'review')
    await p.locator('.modal-close').first().click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(500)
  }catch(e){console.log('review fail',e.message.slice(0,80))}
  // notifications
  try{
    await p.locator('.bell-button').first().click(); await p.waitForTimeout(800)
    await shot(p,'notifications')
    await p.locator('.modal-close').first().click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(500)
  }catch(e){console.log('notify fail',e.message.slice(0,80))}
  // mentor manager + tools
  try{
    await p.getByText('数据结构导师',{exact:true}).first().click(); await p.waitForTimeout(800)
    await p.getByText('管理导师',{exact:true}).first().click(); await p.waitForTimeout(900)
    await shot(p,'mentor-manager')
    await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  }catch(e){console.log('mentor manager fail',e.message.slice(0,80))}
  try{
    await p.getByText('数字电子技术基础',{exact:true}).first().click(); await p.waitForTimeout(800)
    await p.getByText('卡诺图',{exact:true}).first().click(); await p.waitForTimeout(1000)
    await shot(p,'digital-kmap')
    await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  }catch(e){console.log('kmap fail',e.message.slice(0,80))}
  try{
    await p.getByText('模拟电子技术基础',{exact:true}).first().click(); await p.waitForTimeout(800)
    const q=p.getByText('Q 点计算',{exact:true}).first()
    if(await q.count()){await q.click(); await p.waitForTimeout(1000)}
    await shot(p,'analog-q')
    await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  }catch(e){console.log('analog fail',e.message.slice(0,80))}
  // campus tools
  try{
    await p.getByRole('button',{name:/校园生活/}).first().click(); await p.waitForTimeout(1300)
    const tools=p.getByText('校园工具',{exact:true}).first()
    if(await tools.count()){await tools.scrollIntoViewIfNeeded(); await p.waitForTimeout(400)}
    for(const [tab,name] of [['GPA 计算','campus-gpa'],['校历','campus-calendar'],['图书馆','campus-library'],['校园地图','campus-map']]){
      try{
        await p.getByRole('tab',{name:new RegExp(tab)}).first().click(); await p.waitForTimeout(1000)
        await shot(p,name,false)
      }catch(e){console.log(name,'fail',e.message.slice(0,60))}
    }
  }catch(e){console.log('campus fail',e.message.slice(0,80))}
  // chaoxing
  try{
    await p.getByRole('button',{name:/学习通/}).first().click(); await p.waitForTimeout(1600)
    await shot(p,'chaoxing')
  }catch(e){console.log('chaoxing fail',e.message.slice(0,80))}
  // dark home
  try{
    await p.getByRole('button',{name:/我的答疑/}).first().click(); await p.waitForTimeout(1000)
    await p.locator('[aria-label="切换到深色模式"]').first().click(); await p.waitForTimeout(900)
    await shot(p,'dark-home')
  }catch(e){console.log('dark fail',e.message.slice(0,80))}
  await ctx.close()
}

// ---------- teacher KB ----------
{
  const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
  const p=await ctx.newPage()
  await login(p,'teacher'); await clean(p)
  try{
    await p.getByRole('button',{name:/课程知识库/}).first().click(); await p.waitForTimeout(1500)
    await shot(p,'teacher-kb')
    await p.getByText('导入 / 导出',{exact:true}).first().click(); await p.waitForTimeout(900)
    await shot(p,'teacher-import')
    await p.locator('.modal-close').first().click().catch(()=>p.keyboard.press('Escape')); await p.waitForTimeout(500)
  }catch(e){console.log('teacher kb fail',e.message.slice(0,80))}
  await ctx.close()
}

// ---------- admin ----------
{
  const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
  const p=await ctx.newPage()
  await p.goto(BASE+'admin/',{waitUntil:'networkidle'}); await p.waitForTimeout(700)
  await p.getByPlaceholder(/admin@|邮箱/).first().fill('admin@shishuo.local')
  await p.locator('input[type=password]').first().fill('admin123')
  await p.getByRole('button',{name:'进入管理台'}).click(); await p.waitForTimeout(2400)
  for(const [tab,name] of [['操作审计','admin-audit'],['内容核实','admin-verify']]){
    try{
      await p.getByText(tab,{exact:true}).first().click(); await p.waitForTimeout(1300)
      await shot(p,name)
    }catch(e){console.log(name,'fail',e.message.slice(0,60))}
  }
  await ctx.close()
}
await b.close()
console.log('done')
