import { chromium } from 'playwright-core'
const b=await chromium.launch({channel:'msedge'})
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'})
await p.goto('http://localhost:5200/',{waitUntil:'networkidle'}); await p.waitForTimeout(600)
await p.getByText('学生 · 林晓').click(); await p.getByRole('button',{name:'登录',exact:true}).click(); await p.waitForTimeout(2400)
await p.addStyleTag({content:`html{scrollbar-width:none} ::-webkit-scrollbar{display:none} .guide-button{display:none!important}`})
try{
  await p.getByText('数据结构导师',{exact:true}).first().click(); await p.waitForTimeout(900)
  await p.getByText('模拟电子技术基础',{exact:true}).first().click(); await p.waitForTimeout(1200)
  console.log('ANALOG:\n'+(await p.locator('body').innerText()).slice(-900))
  const q=p.getByText('Q 点计算',{exact:true}).first()
  if(await q.count()){await q.click(); await p.waitForTimeout(1200); await p.screenshot({path:'promo/full/assets/analog-q.png'}); console.log('analog ok')}
  else console.log('no q button')
}catch(e){console.log('analog fail',e.message.slice(0,120))}
// empty classroom
try{
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  await p.getByRole('button',{name:/课程表/}).first().click(); await p.waitForTimeout(1200)
  const er=p.getByText('空教室',{exact:true}).first()
  if(await er.count()){await er.click(); await p.waitForTimeout(1800); await p.screenshot({path:'promo/full/assets/empty-room.png'}); console.log('empty ok')}
  else console.log('no empty button')
}catch(e){console.log('empty fail',e.message.slice(0,120))}
await b.close()
