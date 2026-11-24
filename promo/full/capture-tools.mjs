import { chromium } from 'playwright-core'
const b=await chromium.launch({channel:'msedge'})
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
await p.goto('http://localhost:5200/',{waitUntil:'networkidle'}); await p.waitForTimeout(600)
await p.getByText('学生 · 林晓').click(); await p.getByRole('button',{name:'登录',exact:true}).click(); await p.waitForTimeout(2400)
await p.addStyleTag({content:`html{scrollbar-width:none} ::-webkit-scrollbar{display:none} .guide-button{display:none!important}`})
await p.getByText('数据结构导师',{exact:true}).first().click(); await p.waitForTimeout(900)
// digital
try{
  await p.getByText('数字电子技术基础',{exact:true}).first().click(); await p.waitForTimeout(1000)
  console.log('DG DRAWER:\n'+(await p.locator('body').innerText()).slice(-900))
  await p.getByText('卡诺图',{exact:true}).first().click(); await p.waitForTimeout(1200)
  await p.screenshot({path:'promo/full/assets/digital-kmap.png'})
  console.log('kmap ok')
}catch(e){console.log('kmap fail',e.message.slice(0,120))}
await p.keyboard.press('Escape'); await p.waitForTimeout(600)
// analog
try{
  await p.getByText('数据结构导师',{exact:true}).first().click(); await p.waitForTimeout(800)
  await p.getByText('模拟电子技术基础',{exact:true}).first().click(); await p.waitForTimeout(1000)
  console.log('ANALOG DRAWER:\n'+(await p.locator('body').innerText()).slice(-900))
  const q=p.getByText('Q 点计算',{exact:true}).first()
  if(await q.count()){await q.click(); await p.waitForTimeout(1200)}
  await p.screenshot({path:'promo/full/assets/analog-q.png'})
  console.log('analog ok')
}catch(e){console.log('analog fail',e.message.slice(0,120))}
// clean dark home
try{
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  await p.getByRole('button',{name:/我的答疑/}).first().click(); await p.waitForTimeout(900)
  await p.locator('[aria-label="切换到深色模式"]').first().click(); await p.waitForTimeout(900)
  await p.evaluate(()=>{
    for(const el of document.querySelectorAll('button,span,div,a')){
      const t=(el.textContent||'').trim()
      if(t==='AI 未配置'){const b=el.closest('button'); if(b)b.style.display='none'}
    }
    for(const el of document.querySelectorAll('*')){
      if(el.children.length===0 && (el.textContent||'').includes('长回答布局测试')) {
        const row=el.closest('button,article,li,.recent-item'); if(row) row.style.display='none'
      }
    }
    document.querySelectorAll('.daily-card,.class-card,.side-timetable').forEach(el=>el.remove())
  })
  await p.waitForTimeout(500)
  await p.screenshot({path:'promo/full/assets/dark-home.png'})
  console.log('dark clean ok')
}catch(e){console.log('dark fail',e.message.slice(0,120))}
await b.close()
