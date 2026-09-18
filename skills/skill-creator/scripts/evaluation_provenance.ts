import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export interface ExecutionBinding {
  schema_version: "1.0";
  skill_source_sha256: string;
  eval_plan_sha256: string;
  scenario_sha256: string;
  configuration: string;
  run_index: number;
  pair_index?: number;
  seed?: number;
  order?: string[];
  order_position?: number;
  pair_equivalence?: { model: unknown; tools: unknown; fixture_sha256: unknown; timeout_seconds: unknown; max_turns: unknown };
  artifact_sha256: Record<string, string>;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function compositeHash(parts: Array<string | Buffer>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export type PairedOrder = ["with_skill" | "baseline", "with_skill" | "baseline"];

type ScheduleBinding = { skill_source_sha256: string; eval_plan_sha256: string; scenario_sha256: string };

function rawPairSeed(binding: ScheduleBinding, pairIndex: number): number {
  return Number.parseInt(compositeHash([binding.skill_source_sha256, binding.eval_plan_sha256, binding.scenario_sha256, String(pairIndex)]).slice(0, 8), 16) >>> 0;
}

/** Derive a pair's execution order solely from its recorded unsigned 32-bit seed. */
export function pairedOrderFromSeed(seed: number): PairedOrder {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("pair seed must be an unsigned 32-bit integer");
  return seed % 2 === 0 ? ["with_skill", "baseline"] : ["baseline", "with_skill"];
}

/** Derive reproducible seeds whose parity alternates, preserving counterbalance. */
export function counterbalancedPairSeed(binding: ScheduleBinding, pairIndex: number): number {
  if (!Number.isInteger(pairIndex) || pairIndex <= 0) throw new TypeError("pair index must be a positive integer");
  const startingParity = rawPairSeed(binding, 1) & 1;
  const requiredParity = startingParity ^ ((pairIndex - 1) & 1);
  return ((rawPairSeed(binding, pairIndex) & 0xfffffffe) | requiredParity) >>> 0;
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function filesBelow(root: string, current = root): string[] {
  if (!isDirectory(current)) return existsSync(current) ? [current] : [];
  const files: string[] = [];
  for (const name of readdirSync(current).sort()) files.push(...filesBelow(root, join(current, name)));
  return files;
}

/** A stable content hash that includes relative names and bytes for directories. */
export function artifactHash(path: string): string {
  if (!existsSync(path)) return "missing";
  if (!isDirectory(path)) return sha256(readFileSync(path));
  return compositeHash(filesBelow(path).sort().flatMap(file => [relative(path, file).replaceAll("\\", "/"), readFileSync(file)]));
}

export class ExecutionPlanError extends Error {
  readonly code: "invalid-evaluation-plan" | "incomplete-paired-runs";
  constructor(code: "invalid-evaluation-plan" | "incomplete-paired-runs", message: string) { super(message); this.name = "ExecutionPlanError"; this.code = code; }
}
export function expectedRunDirs(workspace: string): string[] {
  const absolute = resolve(workspace); if (!isDirectory(absolute)) return [];
  const result: string[] = [], ids = new Set<string>();
  for (const evalName of readdirSync(absolute).filter(name => name.startsWith("eval-")).sort()) {
    const evalDir = join(absolute, evalName); if (!isDirectory(evalDir)) continue;
    const metadata = loadJson(join(evalDir, "eval_metadata.json"));
    if (!metadata || !["fast", "standard", "release"].includes(metadata.run_profile)) throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" has invalid or missing run_profile");
    const profilePairs:Record<string,number>={fast:1,standard:3,release:5};
    if (!Number.isInteger(metadata.requested_pairs) || metadata.requested_pairs !== profilePairs[metadata.run_profile]) throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" requested_pairs must exactly match run_profile");
    const id = String(metadata.eval_id ?? ""); if (!id || ids.has(id)) throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" has missing or duplicate eval_id "+id); ids.add(id);
    const schedules = metadata.execution_schedule;
    if (!Array.isArray(schedules) || schedules.length !== metadata.requested_pairs) throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" execution_schedule must contain exactly requested_pairs entries");
    const binding=metadata.execution_binding;
    if (!binding || typeof binding!=="object") throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" execution_binding is missing");
    const expectedConfigs = ["with_skill", metadata.baseline_configuration ?? (isDirectory(join(evalDir,"old_skill")) ? "old_skill" : "without_skill")];
    for (let index=1; index<=metadata.requested_pairs; index++) {
      const scheduled=schedules[index-1];
      const scheduleBinding={skill_source_sha256:String(binding.skill_source_sha256),eval_plan_sha256:String(binding.eval_plan_sha256),scenario_sha256:String(binding.scenario_sha256)};
      const expectedSeed=counterbalancedPairSeed(scheduleBinding,index);
      const expectedOrder=pairedOrderFromSeed(expectedSeed);
      if (!scheduled || scheduled.pair_index!==index || scheduled.seed!==expectedSeed || JSON.stringify(scheduled.order)!==JSON.stringify(expectedOrder)) throw new ExecutionPlanError("invalid-evaluation-plan", evalName+" execution_schedule is not a strict total deterministic schedule at pair "+index);
      for (const config of expectedConfigs) result.push(join(evalDir,config,"run-"+index));
    }
  }
  return result;
}

export function listRunDirs(workspace: string): string[] {
  const result: string[] = [];
  const absolute = resolve(workspace);
  // Archives retain the original eval-* layout for auditability, but are never
  // active evaluation inputs even when a caller points discovery at one.
  if (absolute.split(sep).includes(".full-eval-archive") || !isDirectory(absolute)) return result;
  workspace = absolute;
  for (const evalName of readdirSync(workspace).filter(name => name.startsWith("eval-")).sort()) {
    const evalDir = join(workspace, evalName);
    if (!isDirectory(evalDir)) continue;
    for (const configuration of readdirSync(evalDir).sort()) {
      const configDir = join(evalDir, configuration);
      if (!isDirectory(configDir) || !(configuration.includes("with_skill") || configuration.includes("old_skill") || configuration.includes("without_skill"))) continue;
      const runs = readdirSync(configDir).filter(name => /^run-\d+$/.test(name) && isDirectory(join(configDir, name))).sort();
      result.push(...(runs.length ? runs.map(name => join(configDir, name)) : [configDir]));
    }
  }
  return result;
}

export function runCoordinates(runDir: string): { configuration: string; run_index: number } {
  const runName = basename(runDir);
  if (/^run-\d+$/.test(runName)) return { configuration: basename(dirname(runDir)), run_index: Number(runName.slice(4)) };
  return { configuration: basename(runDir), run_index: 1 };
}

export function evidenceArtifactHashes(runDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ["outputs", "grading.json", "timing.json", "navigation.json", "transcript.json"]) {
    const path = join(runDir, name);
    if (existsSync(path) && (name !== "outputs" || isDirectory(path))) result[name] = artifactHash(path);
  }
  return result;
}

function loadJson(path: string): any | null {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function expectedExecutionBinding(runDir: string): Omit<ExecutionBinding, "schema_version" | "artifact_sha256"> | null {
  const evalDir = dirname(dirname(runDir));
  const metadata = loadJson(join(evalDir, "eval_metadata.json"));
  const context = metadata?.execution_binding;
  if (!context || typeof context !== "object") return null;
  const coordinates = runCoordinates(runDir);
  return {
    skill_source_sha256: String(context.skill_source_sha256 ?? ""),
    eval_plan_sha256: String(context.eval_plan_sha256 ?? ""),
    scenario_sha256: String(context.scenario_sha256 ?? ""),
    ...coordinates,
    ...(Array.isArray(metadata?.execution_schedule) ? (() => { const scheduled=metadata.execution_schedule.find((item:any)=>item.pair_index===coordinates.run_index); if(!scheduled)return {}; const baseline=coordinates.configuration.includes("old_skill")||coordinates.configuration.includes("without_skill"); const role=baseline?"baseline":"with_skill"; return {pair_index:scheduled.pair_index,seed:scheduled.seed,order:scheduled.order,order_position:scheduled.order.indexOf(role)+1}; })() : {}),
  };
}

export function validateExecutionEvidence(
  workspace: string,
  expected?: { skill_source_sha256?: string; eval_plan_sha256?: string },
): { status: "complete" | "blocked"; errors: string[]; evidence_sha256: string; bindings: ExecutionBinding[] } {
  const errors: string[] = [];
  const bindings: ExecutionBinding[] = [];
  const digestParts: Array<string | Buffer> = [];
  let planned: string[];
  try { planned = expectedRunDirs(workspace); } catch (error) { errors.push((error as Error).message); return { status: "blocked", errors, evidence_sha256: compositeHash([]), bindings }; }
  for (const runDir of planned) {
    if (!isDirectory(runDir)) { errors.push(relative(workspace,runDir).replaceAll("\\","/")+" missing planned run directory"); continue; }
    const label = relative(workspace, runDir).replaceAll("\\", "/");
    const manifestPath = join(runDir, "execution-evidence.json");
    const manifest = loadJson(manifestPath) as ExecutionBinding | null;
    const wanted = expectedExecutionBinding(runDir);
    if (!manifest) { errors.push(`${label}/execution-evidence.json missing or invalid`); continue; }
    if (!wanted) { errors.push(`${label} generated eval metadata has no execution binding`); continue; }
    const fields: Array<keyof typeof wanted> = ["skill_source_sha256", "eval_plan_sha256", "scenario_sha256", "configuration", "run_index", "pair_index", "seed", "order", "order_position"];
    for (const field of fields) if (JSON.stringify(manifest[field]) !== JSON.stringify(wanted[field])) errors.push(`${label} execution evidence ${field} does not match the current plan`);
    if (manifest.schema_version !== "1.0") errors.push(`${label} execution evidence schema_version must be 1.0`);
    if (expected?.skill_source_sha256 && manifest.skill_source_sha256 !== expected.skill_source_sha256) errors.push(`${label} execution evidence is from a different skill source`);
    if (expected?.eval_plan_sha256 && manifest.eval_plan_sha256 !== expected.eval_plan_sha256) errors.push(`${label} execution evidence is from a different eval plan`);
    const actual = evidenceArtifactHashes(runDir);
    for (const required of ["outputs", "grading.json", "timing.json"]) if (!actual[required]) errors.push(`${label}/${required} missing`);
    if (!manifest.artifact_sha256 || typeof manifest.artifact_sha256 !== "object") errors.push(`${label} execution evidence artifact hashes missing`);
    else {
      const keys = [...new Set([...Object.keys(actual), ...Object.keys(manifest.artifact_sha256)])].sort();
      for (const key of keys) if (manifest.artifact_sha256[key] !== actual[key]) errors.push(`${label}/${key} content hash mismatch`);
    }
    bindings.push(manifest);
    digestParts.push(label, readFileSync(manifestPath));
    for (const [name, hash] of Object.entries(actual).sort(([a], [b]) => a.localeCompare(b))) digestParts.push(`${label}/${name}`, hash);
  }
  const byPair = new Map<string, ExecutionBinding[]>();
  for (const binding of bindings) { const key=String(binding.scenario_sha256)+":"+String(binding.pair_index); const group=byPair.get(key)??[]; group.push(binding); byPair.set(key,group); }
  for (const [key,pair] of byPair) {
    if (pair.length!==2) { errors.push(key+" expected exactly two paired executions"); continue; }
    const [a,b]=pair, ae=(a as any).pair_equivalence, be=(b as any).pair_equivalence;
    for (const field of ["model","tools","fixture_sha256","timeout_seconds","max_turns"]) if (JSON.stringify(ae?.[field])!==JSON.stringify(be?.[field])) errors.push(key+" pair equivalence mismatch for "+field);
  }
  return { status: errors.length ? "blocked" : "complete", errors, evidence_sha256: compositeHash(digestParts), bindings };
}
