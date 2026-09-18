import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SKILL_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),".."),REPO_ROOT=resolve(SKILL_ROOT,"../.."),PREFIX="skills/plugin-creator/";
const TEMPLATES=new Map([
 [PREFIX+"templates/ci/goose-github-actions.yml","100644"],
 [PREFIX+"templates/ci/goose-host-adapter.mjs","100755"],
 [PREFIX+"templates/ci/plugin-creator-ci.json","100644"]
]);
function git(args:string[]){const r=spawnSync("git",args,{cwd:REPO_ROOT,encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout}
function trackedSnapshot(destination:string){
 // Copy precisely the tracked path/mode boundary that `git archive HEAD` will ship
 // once the tested worktree is committed. Untracked files and dev node_modules
 // cannot enter this snapshot.
 const entries=git(["ls-files","--stage","--","plugin.json",PREFIX]).trim().split("\n").filter(Boolean).map(line=>{const m=/^(\d{6}) [0-9a-f]+ \d+\t(.+)$/.exec(line);assert.ok(m,"unexpected git index entry: "+line);return{mode:m[1],path:m[2]}});
 for(const [path,mode] of TEMPLATES){const entry=entries.find(x=>x.path===path);assert.ok(entry,path+" must be tracked");assert.equal(entry.mode,mode,path+" archive mode");assert.ok(existsSync(join(REPO_ROOT,path)),path+" must be present")}
 for(const entry of entries){assert.match(entry.mode,/^100(644|755)$/,"archive contract supports regular tracked files only");const dst=join(destination,entry.path);mkdirSync(dirname(dst),{recursive:true});copyFileSync(join(REPO_ROOT,entry.path),dst);chmodSync(dst,entry.mode==="100755"?0o755:0o644)}
 assert.equal(existsSync(join(destination,PREFIX,"dist/templates")),false,"templates/ci is canonical; dist/templates must not be required");
 assert.equal(existsSync(join(destination,PREFIX,"node_modules")),false,"snapshot must not contain development dependencies");
}
const evidenceWriter=String.raw`
import{mkdirSync,readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{pathToFileURL}from'node:url';
export async function writeEvidence(request){const base=join(request.plugin_path,'skills/plugin-creator/dist/scripts'),{sourceHash}=await import(pathToFileURL(join(base,'package_manifest.js'))),{componentHash}=await import(pathToFileURL(join(base,'verify_plugin_gates.js'))),i=join(request.workspace,'integration'),c=join(request.workspace,'components','skill','plugin-creator');mkdirSync(i,{recursive:true});mkdirSync(c,{recursive:true});writeFileSync(join(c,'receipt.json'),JSON.stringify({schema_version:'1.0',artifact:'skill',name:'plugin-creator',status:'pass',source_sha256:componentHash(join(request.plugin_path,'skills/plugin-creator'))}));writeFileSync(join(i,'benchmark.json'),JSON.stringify({metadata:{evaluated_source_sha256:sourceHash(request.plugin_path)},run_summary:{with_skill:{pass_rate:{mean:1}},without_skill:{pass_rate:{mean:0}}}}));writeFileSync(join(i,'review.html'),'<html><body>offline review evidence</body></html>')}
`;
function runCli(root:string,config:string,env:NodeJS.ProcessEnv){return spawnSync(process.execPath,[join(root,PREFIX,"dist/scripts/cli.js"),"ci-eval","--config",config,"--format","json"],{cwd:root,encoding:"utf8",env})}
function expectPending(run:ReturnType<typeof spawnSync>){assert.equal(run.status,4,run.stderr?.toString()||run.stdout?.toString());const out=JSON.parse(String(run.stdout));assert.equal(out.status,"pending-approval");assert.equal(out.exit_code,4)}

test("tracked CI templates run both documented workflows from an archive-equivalent offline distribution",()=>{
 const root=mkdtempSync(join(tmpdir(),"plugin-creator-archive-"));trackedSnapshot(root);const ciDir=join(root,PREFIX,"templates/ci"),writer=join(root,"write-evidence.mjs");writeFileSync(writer,evidenceWriter);
 const canonical=JSON.parse(readFileSync(join(ciDir,"plugin-creator-ci.json"),"utf8"));assert.deepEqual(canonical.host.environment,["GOOSE_CI_VERIFIED_MODELS","GOOSE_PROVIDER","GOOSE_MODEL"]);

 const fakeHost=join(root,"fake-host.mjs");writeFileSync(fakeHost,`import{readFileSync}from'node:fs';import{writeEvidence}from'./write-evidence.mjs';const phase=process.argv[2],request=JSON.parse(readFileSync(process.argv[4],'utf8'));if(process.env.FORWARDED_SENTINEL!=='yes'||process.env.LEAKED_SENTINEL)process.exit(9);if(phase==='preflight')console.log(JSON.stringify({status:'ready',capabilities:['non-interactive','plugin-evaluation'],models:['offline-model']}));else{await writeEvidence(request);console.log(JSON.stringify({status:'pass'}))}`);
 const neutral=structuredClone(canonical);neutral.host={command:process.execPath,args:[fakeHost],required_credentials:[],required_models:["offline-model"],required_capabilities:["non-interactive","plugin-evaluation"],environment:["FORWARDED_SENTINEL"]};neutral.limits={timeout_ms:5000,max_output_bytes:1048576,total_budget_ms:10000};neutral.cache={enabled:false,resume:false};const neutralPath=join(root,"provider-neutral.json");writeFileSync(neutralPath,JSON.stringify(neutral));expectPending(runCli(root,neutralPath,{PATH:"",HOME:root,FORWARDED_SENTINEL:"yes",LEAKED_SENTINEL:"must-not-pass",HTTP_PROXY:"http://127.0.0.1:1",HTTPS_PROXY:"http://127.0.0.1:1"}));

 const bin=mkdtempSync(join(tmpdir(),"plugin-creator-goose-bin-"));symlinkSync(process.execPath,join(bin,"node"));const goose=join(bin,"goose"),writerUrl=pathToFileURL(writer).href;writeFileSync(goose,`#!/usr/bin/env node\nimport{readFileSync}from'node:fs';import{writeEvidence}from${JSON.stringify(writerUrl)};if(process.argv.includes('--version')){if(process.env.GOOSE_CI_VERIFIED_MODELS!=='evaluation-model'||process.env.GOOSE_PROVIDER!=='fake'||process.env.GOOSE_MODEL!=='evaluation-model'||process.env.PROVIDER_API_KEY!=='offline-secret'||process.env.LEAKED_SENTINEL)process.exit(9);console.log('fake-goose 1.0');process.exit(0)}const prompt=readFileSync(0,'utf8'),m=/Evaluate the plugin at (.+)\. Write all required typed receipts, benchmark\.json, and review\.html under (.+)\. Do not prompt/.exec(prompt);if(!m)process.exit(8);await writeEvidence({plugin_path:m[1],workspace:m[2]});process.exit(0)`,{mode:0o755});chmodSync(goose,0o755);
 const gooseConfig=join(root,"goose.json");copyFileSync(join(ciDir,"plugin-creator-ci.json"),gooseConfig);expectPending(runCli(root,gooseConfig,{PATH:bin,HOME:root,PROVIDER_API_KEY:"offline-secret",GOOSE_CI_VERIFIED_MODELS:"evaluation-model",GOOSE_PROVIDER:"fake",GOOSE_MODEL:"evaluation-model",LEAKED_SENTINEL:"must-not-pass",HTTP_PROXY:"http://127.0.0.1:1",HTTPS_PROXY:"http://127.0.0.1:1"}));
});
