import { chromium } from 'playwright-core'
import fs from 'node:fs'
const FPS=30
const tl=JSON.parse(fs.readFileSync('promo/full/timeline.json','utf-8'))
const total=Math.ceil(tl.total*FPS)
const start=Number(process.argv[2]||0), end=Math.min(Number(process.argv[3]||total),total)
const b=await chromium.launch({channel:'msedge'})
const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,locale:'zh-CN'})
await p.addInitScript(js=>{window.__TIMELINE__=js},tl)
p.on('pageerror',e=>console.log('PAGE EXCEPTION:',e.message))
await p.goto('http://127.0.0.1:5302/promo/full/film.html',{waitUntil:'networkidle'})
await p.waitForFunction(()=>window.__ready===true,null,{timeout:120000})
fs.mkdirSync('promo/full/frames',{recursive:true})
for(let i=start;i<end;i++){
  await p.evaluate(t=>window.__render(t),i/FPS)
  await p.screenshot({path:`promo/full/frames/f_${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:95})
  if(i%500===0||i===end-1) console.log(`frame ${i}/${total} t=${(i/FPS).toFixed(1)}`)
}
await b.close()
console.log('chunk done',start,end)
