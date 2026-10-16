import {chromium} from 'playwright';import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync('index.html'));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const report={errors:[],arrivals:[]};
try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__stars=[];new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&n.matches?.('.star-flash'))window.__stars.push({id:n.dataset.fid,at:performance.now()});}))).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);await page.evaluate(()=>V03Feed.complete());
 for(const tab of ['fact','relation']){await page.evaluate(tab=>V03Store.set({tab,sk:{mode3d:true},geo:{level:'L1',focus:null},rel:{view:'globe',level:'L1',focus:null,sel:null,kind:null,stack:[]}}),tab);const n=await page.evaluate(()=>window.__stars.length);await page.waitForFunction(n=>window.__stars.length>n,n,{timeout:22000});
  const arrival=await page.evaluate(tab=>({tab,note:document.querySelector(tab==='fact'?'#factSide .fresh-note':'#relSide .fresh-note')?.textContent,first:document.querySelector(tab==='fact'?'#sideBody [data-fid]':'#relBody [data-obj]')?.dataset,debug:(tab==='fact'?V03Fact:V03Relation).debug().globe}),tab);report.arrivals.push(arrival);
  if(tab==='relation'){assert(arrival.note.includes('新本体'));assert.equal(arrival.debug.nodes,600);const obj=await page.evaluate(id=>V03Data.objById(id),arrival.first.obj);assert(['Market','Base','LogisticsNode'].includes(obj.entityType));}
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.mkdirSync('test/artifacts/v24',{recursive:true});fs.writeFileSync('test/artifacts/v24/globe.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
