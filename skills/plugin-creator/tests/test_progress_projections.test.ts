import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { protectedArtifactRef, type ExecutionEvent } from "../dist/scripts/execution_event_stream.js";
import { projectExecutionProgress, renderCiProgress, renderHistoricalReview, renderMachineJsonl, renderTerminalProgress } from "../dist/scripts/progress_projections.js";

const run="run-1",baseTime=Date.parse("2026-09-17T20:00:00.000Z"),stateRef=protectedArtifactRef("/private/state");
function events(final:"running"|"blocked"|"cancelled"|"failed"|"completed"):ExecutionEvent[]{const out:ExecutionEvent[]=[];const add=(event_type:string,job_id:string|null,data:Record<string,unknown>)=>{const prior=out.at(-1);out.push({schema_version:"1.0",event_id:randomUUID(),event_type,run_id:run,job_id,sequence:out.length+1,timestamp:new Date(baseTime+out.length).toISOString(),causal_event_id:prior?.event_id??null,data})};add("evaluation-created",null,{status:"planned",graph_hash:"g",plugin:protectedArtifactRef("/private/plugin"),workspace:protectedArtifactRef("/private/workspace"),job_count:2,budget:{consumed_ms:0,total_ms:1000,remaining_ms:1000}});add("job-transition","job-1",{phase:"validation",status:"running"});add("phase-transition","job-1",{phase:"validation",status:"running"});if(final==="running")return out;if(final==="blocked"){add("job-transition","job-1",{phase:"validation",status:"blocked"});add("phase-transition","job-1",{phase:"validation",status:"blocked"});add("checkpoint",null,{revision:1,status:"blocked",state:stateRef,jobs:[{id:"job-1",phase:"validation",status:"blocked",attempts:1},{id:"job-2",phase:"review",status:"planned",attempts:0}],budget:{consumed_ms:250,total_ms:1000,remaining_ms:750}});return out}if(final==="cancelled"){add("job-transition","job-1",{phase:"validation",status:"cancelled"});add("phase-transition","job-1",{phase:"validation",status:"cancelled"});add("cancellation",null,{status:"cancelled"});return out}if(final==="failed"){add("job-transition","job-1",{phase:"validation",status:"failed"});add("phase-transition","job-1",{phase:"validation",status:"failed"});add("failure","job-1",{phase:"validation",status:"failed"});add("failure",null,{status:"failure"});return out}add("job-transition","job-1",{phase:"validation",status:"succeeded",outputs:[protectedArtifactRef("/private/report","a".repeat(64))]});add("phase-transition","job-1",{phase:"validation",status:"succeeded"});add("checkpoint",null,{revision:2,status:"running",state:stateRef,jobs:[{id:"job-1",phase:"validation",status:"succeeded",attempts:1},{id:"job-2",phase:"review",status:"succeeded",attempts:1}],budget:{consumed_ms:900,total_ms:1000,remaining_ms:100}});add("completion",null,{status:"success",archive:protectedArtifactRef("/private/archive","b".repeat(64))});return out}

const SNAPSHOTS={
 running:"full-eval progress: state=running lifecycle=live phase=validation phase_state=running jobs=0/2 running=1 blocked=0 failed=0 budget=0/1000ms (0%)",
 blocked:"full-eval progress: state=blocked lifecycle=live phase=validation phase_state=blocked jobs=1/2 running=0 blocked=1 failed=0 budget=250/1000ms (25%)\nresume: Resolve the reported condition, then run plugin-creator full-eval with --resume.",
 cancelled:"full-eval progress: state=cancelled lifecycle=completed phase=validation phase_state=cancelled jobs=1/2 running=0 blocked=0 failed=0 budget=0/1000ms (0%)\nresume: Resolve the reported condition, then run plugin-creator full-eval with --resume.",
 failed:"full-eval progress: state=failed lifecycle=completed phase=validation phase_state=failed jobs=1/2 running=0 blocked=0 failed=1 budget=0/1000ms (0%)\nfailure: phase=validation job=job-1\nresume: Resolve the reported condition, then run plugin-creator full-eval with --resume.",
 completed:"full-eval progress: state=completed lifecycle=completed phase=validation phase_state=succeeded jobs=2/2 running=0 blocked=0 failed=0 budget=900/1000ms (90%)"
};
for(const state of Object.keys(SNAPSHOTS) as Array<keyof typeof SNAPSHOTS>)test(`terminal snapshot: ${state}`,()=>{const rendered=renderTerminalProgress(events(state),"normal");assert.equal(rendered.output,SNAPSHOTS[state]);assert.equal(rendered.snapshot.counts.planned,state==="running"?1:state==="blocked"?1:state==="cancelled"?1:state==="failed"?1:0);assert.doesNotMatch(rendered.output,/\u001b\[/);assert.equal(renderTerminalProgress(events(state),"quiet").output,"");assert.ok(renderTerminalProgress(events(state),"verbose").output.includes("event 1: evaluation-created"))});

test("every surface has the exact same canonical state, phase, counts, and budget",()=>{for(const state of Object.keys(SNAPSHOTS) as Array<keyof typeof SNAPSHOTS>){const stream=events(state),canonical=projectExecutionProgress(stream),surfaces=[renderTerminalProgress(stream),renderMachineJsonl(stream),renderCiProgress(stream),renderHistoricalReview(stream)];for(const surface of surfaces){assert.deepEqual(surface.snapshot.phase,canonical.phase);assert.deepEqual(surface.snapshot.counts,canonical.counts);assert.deepEqual(surface.snapshot.budget,canonical.budget);assert.equal(surface.snapshot.state,canonical.state)}}});

test("machine JSONL contains JSON records only and no ANSI",()=>{const result=renderMachineJsonl(events("failed"));for(const line of result.output.trim().split("\n")){const value=JSON.parse(line);assert.equal(value.kind,"full-eval-progress");assert.equal(typeof value.state,"string")}assert.doesNotMatch(result.output,/full-eval progress:|\u001b\[/)});

test("CI groups failures, artifact links, and resume guidance",()=>{const failed=renderCiProgress(events("failed")).output;assert.match(failed,/::group::full-eval failures/);assert.match(failed,/::group::full-eval resume/);const completed=renderCiProgress(events("completed")).output;assert.match(completed,/::group::full-eval artifacts/);assert.match(completed,/artifact:\/\/[a-f0-9]{64}/);assert.doesNotMatch(completed,/\/private\//)});

test("job failure remains live until the run-level failure event",()=>{const stream=events("failed");assert.equal(projectExecutionProgress(stream.slice(0,-1)).lifecycle,"live");assert.equal(projectExecutionProgress(stream).lifecycle,"completed")});

test("historical review is accessible and distinguishes live from completed replay",()=>{const live=renderHistoricalReview(events("running")).output,complete=renderHistoricalReview(events("completed")).output;assert.match(live,/aria-labelledby="full-eval-progress-title"/);assert.match(live,/aria-live="off"/);assert.match(live,/data-lifecycle="live"/);assert.match(complete,/data-lifecycle="completed"/);assert.match(complete,/<ol>/);assert.doesNotMatch(live+complete,/\u001b\[/)});

test("budget preserves explicit zero, rejects coercion, and clamps boundaries",()=>{
 const stream=events("running"),last=stream.at(-1)!;
 last.data.budget={consumed_ms:150,total_ms:100,remaining_ms:0};
 assert.deepEqual(projectExecutionProgress(stream).budget,{consumed_ms:150,total_ms:100,remaining_ms:0,percent:100});
 last.data.budget={consumed_ms:"25",total_ms:null,remaining_ms:undefined};
 assert.deepEqual(projectExecutionProgress(stream).budget,{consumed_ms:0,total_ms:1000,remaining_ms:1000,percent:0});
 last.data.budget={consumed_ms:25,total_ms:100,remaining_ms:999};
 assert.deepEqual(projectExecutionProgress(stream).budget,{consumed_ms:25,total_ms:100,remaining_ms:100,percent:25});
});

test("hostile display text is safe on terminal, CI, HTML, and remains readable",()=>{
 const stream=events("failed"),hostile='\u001b[31m<script>alert(1)</script>\n::error title=pwn::owned%0A';
 for(const event of stream)if(event.data.phase==="validation")event.data.phase=hostile;
 stream.find(event=>event.job_id==="job-1")!.job_id='job\r\n::warning::pwn';
 const terminal=renderTerminalProgress(stream).output,ci=renderCiProgress(stream).output,html=renderHistoricalReview(stream).output;
 assert.doesNotMatch(terminal+ci+html,/\u001b|\u0007/);
 assert.doesNotMatch(terminal,/\n::error|\n::warning/);
 assert.doesNotMatch(ci,/\n::(?:error|warning|notice|set-output|add-mask)::/);
 assert.match(ci,/%3A%3Aerror/);assert.match(ci,/%25/);
 assert.doesNotMatch(html,/<script>|<\/script>/);assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(terminal,/alert\(1\)/);assert.match(html,/aria-labelledby=/);
});

test("cross-surface hostile snapshots keep canonical semantics",()=>{
 const stream=events("blocked");for(const event of stream)if(event.data.phase==="validation")event.data.phase="check\nnext\u001b[2J";
 const outputs=[renderTerminalProgress(stream).output,renderCiProgress(stream).output,renderHistoricalReview(stream).output];
 assert.deepEqual(outputs.map(x=>x.includes("check next")),[true,true,true]);
 assert.deepEqual(outputs.map(x=>/\u001b|\r/.test(x)),[false,false,false]);
});
