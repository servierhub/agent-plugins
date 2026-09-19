import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(join(fileURLToPath(new URL(".",import.meta.url)),".."));
const AGGREGATE=join(ROOT,"dist","scripts","aggregate_benchmark.js");
function grading(dir:string,time:number,tokens:number){mkdirSync(dir,{recursive:true});writeFileSync(join(dir,"grading.json"),JSON.stringify({summary:{pass_rate:1,passed:1,failed:0,total:1},timing:{total_duration_seconds:time}}));writeFileSync(join(dir,"timing.json"),JSON.stringify({total_tokens:tokens}));}

test("Skill aggregate producer emits observed p50/p95 and explicit sample counts",()=>{
 const root=mkdtempSync(join(tmpdir(),"skill-aggregate-percentiles-"));
 try{
  for(const [config,times] of [["with_skill",[1,2,10]],["without_skill",[1,1,2]]] as const)for(const [i,time] of times.entries())grading(join(root,"eval-1",config,`run-${i+1}`),time,(i+1)*10);
  execFileSync(process.execPath,[AGGREGATE,root,"--skill-name","demo","--skill-path","/demo"]);
  const benchmark=JSON.parse(readFileSync(join(root,"benchmark.json"),"utf8"));
  assert.deepEqual({p50:benchmark.run_summary.with_skill.time_seconds.p50,p95:benchmark.run_summary.with_skill.time_seconds.p95,sample_count:benchmark.run_summary.with_skill.time_seconds.sample_count},{p50:2,p95:9.2,sample_count:3});
  assert.deepEqual({p50:benchmark.run_summary.without_skill.time_seconds.p50,p95:benchmark.run_summary.without_skill.time_seconds.p95,sample_count:benchmark.run_summary.without_skill.time_seconds.sample_count},{p50:1,p95:1.9,sample_count:3});
  assert.deepEqual({p50:benchmark.run_summary.delta.paired.time_seconds.p50,p95:benchmark.run_summary.delta.paired.time_seconds.p95,sample_count:benchmark.run_summary.delta.paired.time_seconds.sample_count},{p50:1,p95:7.3,sample_count:3});
 }finally{rmSync(root,{recursive:true,force:true})}
});

test("a single observed Skill duration has equal explicit p50 and p95",()=>{
 const root=mkdtempSync(join(tmpdir(),"skill-aggregate-single-"));
 try{grading(join(root,"eval-1","with_skill","run-1"),3.25,10);grading(join(root,"eval-1","without_skill","run-1"),2,8);execFileSync(process.execPath,[AGGREGATE,root]);const stats=JSON.parse(readFileSync(join(root,"benchmark.json"),"utf8")).run_summary.with_skill.time_seconds;assert.equal(stats.p50,3.25);assert.equal(stats.p95,3.25);assert.equal(stats.sample_count,1)}finally{rmSync(root,{recursive:true,force:true})}
});
