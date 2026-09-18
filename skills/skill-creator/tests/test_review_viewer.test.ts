import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {buildReviewIR,generateHtml} from "../dist/eval-viewer/generate_review.js";
import {auditReviewHtml,contrast} from "../dist/scripts/check_review_accessibility.js";

type Passes = Record<string,{candidate:boolean;baseline:boolean}>;
function fixture(hostile=false,count=1,passes:Passes={works:{candidate:true,baseline:false}},transcript=''){
  const root=mkdtempSync(join(tmpdir(),"review-ir-"));
  for(let i=0;i<count;i++)for(const cfg of ["with_skill","old_skill"]){
    const run=join(root,"eval-"+i,cfg,"run-1");mkdirSync(join(run,"outputs"),{recursive:true});
    writeFileSync(join(root,"eval-"+i,"eval_metadata.json"),JSON.stringify({eval_id:"case-"+i,prompt:hostile?'Prompt </script><img src=x onerror=alert(1)>':'Prompt '+i}));
    writeFileSync(join(run,"outputs","result.txt"),hostile?'<script>globalThis.pwned=true</script>':'ok');
    if(transcript&&i===0&&cfg==='with_skill')writeFileSync(join(run,"outputs","transcript.md"),transcript);
    const expectations=Object.entries(passes).map(([text,value])=>({text:hostile?'<img onerror=alert(1)>':text,passed:cfg==='with_skill'?value.candidate:value.baseline,evidence:'evidence'}));
    const failed=expectations.filter(x=>!x.passed).length;
    writeFileSync(join(run,"grading.json"),JSON.stringify({expectations,summary:{passed:expectations.length-failed,failed,total:expectations.length,pass_rate:(expectations.length-failed)/expectations.length}}));
    writeFileSync(join(run,"timing.json"),JSON.stringify({total_duration_seconds:cfg==='with_skill'?2:1,total_tokens:cfg==='with_skill'?20:10}));
  }
  const benchmark={run_summary:{with_skill:{pass_rate:{mean:1},time_seconds:{mean:2},tokens:{mean:20}},old_skill:{pass_rate:{mean:0},time_seconds:{mean:1},tokens:{mean:10}},delta:{pass_rate:'+1.00',paired:{pass_rate:{mean:1,stddev:0,confidence_interval_95:{lower:.8,upper:1}}}}}};
  return{root,benchmark};
}
function browser(){for(const name of [process.env.CHROME,'chromium','chromium-browser','google-chrome'].filter(Boolean) as string[]){const p=spawnSync('sh',['-c','command -v '+name],{encoding:'utf8'});if(p.status===0)return p.stdout.trim();}return null;}

async function withBrowser(html:string,hash:string,run:(evaluate:(expression:string)=>Promise<any>,key:(key:string,code?:string)=>Promise<void>)=>Promise<void>){
  const chrome=browser();if(!chrome)throw Error('browser unavailable');const dir=mkdtempSync(join(tmpdir(),'review-browser-')),file=join(dir,'review.html'),port=39000+Math.floor(Math.random()*1000);writeFileSync(file,html);
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${join(dir,'profile')}`,'file://'+file+hash],{stdio:'ignore'});
  try{
    let page:any;for(let i=0;i<100&&!page;i++){try{const tabs=await fetch(`http://127.0.0.1:${port}/json`);page=(await tabs.json()).find((x:any)=>x.type==='page');}catch{}if(!page)await new Promise(r=>setTimeout(r,50));}if(!page)throw Error('browser debugging endpoint unavailable');
    const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve(),{once:true});ws.addEventListener('error',()=>reject(Error('browser websocket failed')),{once:true});});let seq=0;const pending=new Map<number,(v:any)=>void>();ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){pending.get(m.id)!(m);pending.delete(m.id);}});
    const send=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async(expression:string)=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
    const key=async(key:string,code=key)=>{const vk=key==='Enter'?13:key==='Tab'?9:key===' '?32:undefined;await send('Input.dispatchKeyEvent',{type:key==='Enter'?'rawKeyDown':'keyDown',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});};
    await send('Runtime.enable');for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete"'))break;await new Promise(r=>setTimeout(r,20));}await run(evaluate,key);ws.close();
  }finally{child.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});}
}

test('shared IR is decision-oriented and inconclusive is not pass',()=>{const f=fixture();try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.candidate_id,'with_skill');assert.equal(ir.baseline_id,'old_skill');assert.equal(ir.decision.verdict,'pass');assert.equal(ir.metrics.find(x=>x.id==='time_seconds')?.delta,1);assert.match(ir.decision.evidence_href,/^#/);const weak=buildReviewIR(f.root,'demo',{run_summary:{with_skill:{pass_rate:{mean:1}},old_skill:{pass_rate:{mean:0}},delta:{pass_rate:'+1'}}});assert.equal(weak.decision.verdict,'inconclusive');}finally{rmSync(f.root,{recursive:true,force:true});}});
test('500 baseline weaknesses are disagreements, not candidate failures',()=>{const f=fixture(false,500);try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.scenarios.length,500);assert.equal(ir.scenarios.filter(x=>x.failed).length,0);assert.equal(ir.scenarios.filter(x=>x.baseline_weakness).length,500);assert.equal(ir.scenarios.filter(x=>x.disagreement).length,500);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('regressions link to exact assertion evidence',()=>{const f=fixture(false,1,{regressed:{candidate:false,baseline:true},shared:{candidate:true,baseline:true}});try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.decision.critical_regressions.length,1);assert.match(ir.decision.critical_regressions[0].href,/^#run-.*-assertion-/);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('custom static audit covers semantics, contrast, safety, and large-report behavior',()=>{const f=fixture(true,3);try{const html=generateHtml(buildReviewIR(f.root,'</script><script>bad()</script>',f.benchmark));assert.deepEqual(auditReviewHtml(html),[]);assert.ok(contrast('#455565','#ffffff')>=4.5);assert.doesNotMatch(html,/https?:\/\//);assert.doesNotMatch(html,/<script>globalThis\.pwned/);assert.match(html,/\u003c\/script>/);assert.match(html,/role="search"/);assert.match(html,/<caption>/);assert.match(html,/Run output is untrusted/);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('120-scenario/240-run and 2 MiB transcript benchmark stays within generation and memory budgets',()=>{const transcript='large transcript sentinel '+'.'.repeat(2*1024*1024);const f=fixture(false,120,undefined,transcript);try{const heapBefore=process.memoryUsage().heapUsed,started=performance.now();const ir=buildReviewIR(f.root,'large',f.benchmark);const html=generateHtml(ir);const elapsed=performance.now()-started,heapGrowth=process.memoryUsage().heapUsed-heapBefore;assert.equal(ir.scenarios.length,120);assert.ok(html.length>2*1024*1024);assert.ok(elapsed<10000,'generation took '+elapsed.toFixed(0)+'ms (budget 10000ms)');assert.ok(heapGrowth<64*1024*1024,'heap grew '+Math.round(heapGrowth/1024/1024)+' MiB (budget 64 MiB)');}finally{rmSync(f.root,{recursive:true,force:true});}});
test('browser interactions: keyboard order, announcements, load-more, disclosure, feedback, lazy search, and initial deep link',{skip:!browser()&&'Chromium/Chrome not installed'},async()=>{
  const passes={regressed:{candidate:false,baseline:true},shared:{candidate:true,baseline:true}};const f=fixture(false,120,passes,'BROWSER-LAZY-SENTINEL '+'.'.repeat(2*1024*1024));
  try{const ir=buildReviewIR(f.root,'large browser',f.benchmark),html=generateHtml(ir),assertionHash=ir.decision.critical_regressions.at(-1)!.href;
    await withBrowser(html,assertionHash,async(evaluate,key)=>{
      const deep=await evaluate(`({active:document.activeElement.id,open:[...document.activeElement.closest('.run').querySelectorAll('details')].slice(0,1).every(x=>x.open),announced:document.querySelector('#navigation-status').textContent,articles:document.querySelectorAll('article').length,transcriptBodies:[...document.querySelectorAll('pre')].filter(x=>x.textContent.includes('BROWSER-LAZY-SENTINEL')).length})`);
      assert.equal(deep.active,assertionHash.slice(1));assert.equal(deep.open,true);assert.match(deep.announced,/Evidence revealed/);assert.ok(deep.articles<=120);assert.equal(deep.transcriptBodies,0);
      await evaluate(`history.replaceState(null,'',location.pathname);document.querySelector('#search').focus()`);await key('Tab','Tab');assert.equal(await evaluate('document.activeElement.id'),'failed');await key('Tab','Tab');assert.equal(await evaluate('document.activeElement.id'),'disagreement');
      await evaluate(`document.querySelector('#failed').click()`);assert.match(await evaluate(`document.querySelector('#count').textContent`),/matching scenarios shown/);
      await evaluate(`document.querySelector('#clear').click()`);assert.equal(await evaluate('document.activeElement.id'),'search');
      await evaluate(`document.querySelector('#more').click()`);assert.equal(await evaluate(`document.activeElement===document.querySelector('#scenarios').children[25].querySelector('h3')`),true);
      await evaluate(`document.querySelector('.run summary').focus()`);await key(' ','Space');assert.equal(await evaluate(`document.querySelector('.run').open`),true);
      const searchMs=await evaluate(`(()=>{const t=performance.now(),s=document.querySelector('#search');s.value='BROWSER-LAZY-SENTINEL';s.dispatchEvent(new Event('input',{bubbles:true}));return performance.now()-t})()`);assert.ok(searchMs<2000,'transcript search took '+searchMs+'ms (budget 2000ms)');assert.match(await evaluate(`document.querySelector('#count').textContent`),/^1 of 1 matching/);
      await evaluate(`document.querySelector('#feedback').value='reviewed';document.querySelector('#save').focus()`);await key(' ','Space');await new Promise(r=>setTimeout(r,100));assert.match(await evaluate(`document.querySelector('#save-status').textContent`),/Saving|saved|downloaded/);
    });
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('static CLI embeds canonical IR and security policy',()=>{const f=fixture();const out=join(f.root,'review.html');try{writeFileSync(join(f.root,'benchmark.json'),JSON.stringify(f.benchmark));const r=spawnSync(process.execPath,['dist/eval-viewer/generate_review.js',f.root,'--benchmark',join(f.root,'benchmark.json'),'--static',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const html=readFileSync(out,'utf8');assert.match(html,/const REVIEW_IR=/);assert.match(html,/required_human_action/);assert.match(html,/Content-Security-Policy/);}finally{rmSync(f.root,{recursive:true,force:true});}});
