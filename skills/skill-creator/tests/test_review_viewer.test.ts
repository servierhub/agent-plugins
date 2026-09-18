import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {buildReviewIR,generateHtml} from "../dist/eval-viewer/generate_review.js";

type Passes = Record<string,{candidate:boolean;baseline:boolean}>;
function fixture(hostile=false,count=1,passes:Passes={works:{candidate:true,baseline:false}}){
  const root=mkdtempSync(join(tmpdir(),"review-ir-"));
  for(let i=0;i<count;i++)for(const cfg of ["with_skill","old_skill"]){
    const run=join(root,"eval-"+i,cfg,"run-1");mkdirSync(join(run,"outputs"),{recursive:true});
    writeFileSync(join(root,"eval-"+i,"eval_metadata.json"),JSON.stringify({eval_id:"case-"+i,prompt:hostile?'Prompt </script><img src=x onerror=alert(1)>':'Prompt '+i}));
    writeFileSync(join(run,"outputs","result.txt"),hostile?'<script>globalThis.pwned=true</script>':'ok');
    const expectations=Object.entries(passes).map(([text,value])=>({text:hostile?'<img onerror=alert(1)>':text,passed:cfg==='with_skill'?value.candidate:value.baseline,evidence:'evidence'}));
    const failed=expectations.filter(x=>!x.passed).length;
    writeFileSync(join(run,"grading.json"),JSON.stringify({expectations,summary:{passed:expectations.length-failed,failed,total:expectations.length,pass_rate:(expectations.length-failed)/expectations.length}}));
    writeFileSync(join(run,"timing.json"),JSON.stringify({total_duration_seconds:cfg==='with_skill'?2:1,total_tokens:cfg==='with_skill'?20:10}));
  }
  const benchmark={run_summary:{with_skill:{pass_rate:{mean:1},time_seconds:{mean:2},tokens:{mean:20}},old_skill:{pass_rate:{mean:0},time_seconds:{mean:1},tokens:{mean:10}},delta:{pass_rate:'+1.00',paired:{pass_rate:{mean:1,stddev:0,confidence_interval_95:{lower:.8,upper:1}}}}}};
  return{root,benchmark};
}

test('shared IR is decision-oriented and inconclusive is not pass',()=>{const f=fixture();try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.candidate_id,'with_skill');assert.equal(ir.baseline_id,'old_skill');assert.equal(ir.decision.verdict,'pass');assert.equal(ir.metrics.find(x=>x.id==='time_seconds')?.delta,1);assert.match(ir.decision.evidence_href,/^#/);assert.ok(ir.metrics.every(x=>x.evidence_href.startsWith('#')));const weak=buildReviewIR(f.root,'demo',{run_summary:{with_skill:{pass_rate:{mean:1}},old_skill:{pass_rate:{mean:0}},delta:{pass_rate:'+1'}}});assert.equal(weak.decision.verdict,'inconclusive');assert.notEqual(weak.decision.verdict,'pass');}finally{rmSync(f.root,{recursive:true,force:true});}});

test('500 baseline-fail/candidate-pass scenarios are not candidate failures but are disagreements and baseline weaknesses',()=>{const f=fixture(false,500);try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.scenarios.length,500);assert.equal(ir.scenarios.filter(x=>x.failed).length,0);assert.equal(ir.scenarios.filter(x=>x.baseline_weakness).length,500);assert.equal(ir.scenarios.filter(x=>x.disagreement).length,500);}finally{rmSync(f.root,{recursive:true,force:true});}});

test('candidate-vs-baseline disagreements and regressions link to exact assertion evidence',()=>{const f=fixture(false,1,{regressed:{candidate:false,baseline:true},shared:{candidate:true,baseline:true}});try{const ir=buildReviewIR(f.root,'demo',f.benchmark);assert.equal(ir.scenarios[0].failed,true);assert.equal(ir.scenarios[0].disagreement,true);assert.equal(ir.decision.critical_regressions.length,1);assert.match(ir.decision.critical_regressions[0].href,/^#run-.*-assertion-/);const html=generateHtml(ir);assert.ok(html.includes(`id="${ir.decision.critical_regressions[0].href.slice(1)}"`)||html.includes("li.id='run-'"));assert.match(html,/Candidate failure/);assert.match(html,/Baseline weakness/);}finally{rmSync(f.root,{recursive:true,force:true});}});

test('hostile and large reports produce offline accessible DOM',()=>{const f=fixture(true,220);try{const html=generateHtml(buildReviewIR(f.root,'</script><script>bad()</script>',f.benchmark));assert.doesNotMatch(html,/https?:\/\//);assert.doesNotMatch(html,/<script>globalThis\.pwned/);assert.match(html,/\\u003c\/script>/);assert.match(html,/aria-live="polite"/);assert.match(html,/Failed scenarios only/);assert.match(html,/Candidate\/baseline or run disagreement only/);assert.match(html,/<details/);assert.ok(html.length>100000);}finally{rmSync(f.root,{recursive:true,force:true});}});

test('static CLI embeds exactly the canonical IR shape used by live rendering',()=>{const f=fixture();const out=join(f.root,'review.html');try{writeFileSync(join(f.root,'benchmark.json'),JSON.stringify(f.benchmark));const r=spawnSync(process.execPath,['dist/eval-viewer/generate_review.js',f.root,'--benchmark',join(f.root,'benchmark.json'),'--static',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const html=readFileSync(out,'utf8');assert.match(html,/const REVIEW_IR=/);assert.match(html,/required_human_action/);assert.match(html,/evidence_href/);assert.match(html,/Content-Security-Policy/);}finally{rmSync(f.root,{recursive:true,force:true});}});
