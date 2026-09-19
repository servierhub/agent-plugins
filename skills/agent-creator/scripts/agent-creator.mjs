#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const name="agent-creator";
const major=Number(process.versions.node.split(".")[0]);
if(!Number.isInteger(major)||major<22){console.error(name+": Node.js 22 or newer is required; found "+process.version+" at "+process.execPath);process.exitCode=1;}else{
 const skillRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const manifestPath=resolve(skillRoot,"runtime/runtime-manifest.json");
 let manifest;
 try{manifest=JSON.parse(readFileSync(manifestPath,"utf8"));}catch(error){console.error(name+": runtime manifest is missing or invalid at "+manifestPath+". Regenerate or reinstall this Skill. "+error.message);process.exitCode=1;}
 if(manifest){const mapped=manifest.runtimeEntry;if(manifest.schemaVersion!==1||manifest.logicalName!==name||typeof mapped!=="string"||isAbsolute(mapped)||mapped.split(/[\\/]/).some(part=>!part||part==="."||part==="..")){console.error(name+": runtime manifest has an invalid or unsupported entry mapping at "+manifestPath+". Regenerate or reinstall this Skill.");process.exitCode=1;}else{const entry=resolve(skillRoot,"runtime",...mapped.split("/")),stat=lstatSync(entry,{throwIfNoEntry:false});if(!stat?.isFile()||stat.isSymbolicLink()){console.error(name+": runtime is incomplete; expected a plain emitted CLI at "+entry+". Regenerate or reinstall this Skill.");process.exitCode=1;}else{const child=spawn(process.execPath,[entry,...process.argv.slice(2)],{stdio:"inherit",env:process.env});child.once("error",error=>{console.error(name+": failed to launch contained runtime with "+process.execPath+": "+error.message);process.exitCode=1;});child.once("exit",(code,signal)=>{if(signal){try{process.kill(process.pid,signal);}catch{process.exitCode=1;}}else process.exitCode=code??1;});}}
 }
}
