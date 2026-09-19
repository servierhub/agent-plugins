import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const executable=join(root,"bin","plugin-creator"+(process.platform==="win32"?".exe":""));
test("native plugin-creator CLI is standalone",{skip:!existsSync(executable)},()=>{const run=spawnSync(executable,["--help"],{encoding:"utf8",env:{HOME:root,PATH:"",LANG:"C",LC_ALL:"C"}});assert.ifError(run.error);assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/Usage: plugin-creator/);assert.doesNotMatch(run.stdout+run.stderr,/node_modules|\/$bunfs\//)});
