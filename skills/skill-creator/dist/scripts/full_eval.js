#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, writeSync, } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { validateSkill } from "./quick_validate.js";
import { validateEvaluationReceipt } from "./validate_evaluation_receipt.js";
import { sourceHash, verifySkill } from "./verify_skill_gates.js";
import { auditSkill } from "./audit_skill.js";
import { designEvals } from "./design_evals.js";
import { analyzeEvaluation } from "./analyze_evaluation.js";
import { artifactHash, compositeHash, listRunDirs, validateExecutionEvidence, } from "./evaluation_provenance.js";
const SCHEMA_VERSION = "2.0";
const STATE_FILE = ".full-eval-job.json";
const PHASES = [
    "validate", "authoring-audit", "evaluation-design", "scaffold",
    "paired-runs-and-grading", "aggregate", "static-review", "receipt",
    "post-evaluation-pattern-review", "verify",
];
function isDir(path) { try {
    return statSync(path).isDirectory();
}
catch {
    return false;
} }
function loadJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function slug(value) { return String(value ?? "eval").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "eval"; }
function digest(parts) { return compositeHash(parts); }
function fileDigest(path) { return artifactHash(path); }
function atomicWrite(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}`;
    const fd = openSync(temporary, "w", 0o600);
    try {
        writeSync(fd, value);
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    renameSync(temporary, path);
    const dirfd = openSync(dirname(path), "r");
    try {
        fsyncSync(dirfd);
    }
    finally {
        closeSync(dirfd);
    }
}
function atomicJson(path, value) { atomicWrite(path, JSON.stringify(value, null, 2) + "\n"); }
function runDirs(workspace) {
    const result = [];
    if (!isDir(workspace))
        return result;
    for (const en of readdirSync(workspace).filter(n => n.startsWith("eval-")).sort()) {
        const ed = join(workspace, en);
        if (!isDir(ed))
            continue;
        for (const config of readdirSync(ed).sort()) {
            const cd = join(ed, config);
            if (!isDir(cd) || !(config.includes("with_skill") || config.includes("old_skill") || config.includes("without_skill")))
                continue;
            const runs = readdirSync(cd).filter(n => /^run-\d+$/.test(n) && isDir(join(cd, n))).sort();
            result.push(...(runs.length ? runs.map(n => join(cd, n)) : [cd]));
        }
    }
    return result;
}
function rel(root, path) { return relative(root, path).replaceAll("\\", "/"); }
function reconcileScenarioDirs(workspace, evals, evalPlanHash) {
    const active = new Set(evals.map((item, index) => "eval-" + (item?.id ?? index + 1)));
    const archived = [];
    if (!isDir(workspace))
        return archived;
    for (const name of readdirSync(workspace).filter(n => n.startsWith("eval-")).sort()) {
        const source = join(workspace, name);
        if (active.has(name) || !isDir(source))
            continue;
        const archiveRoot = join(workspace, ".full-eval-archive", evalPlanHash);
        mkdirSync(archiveRoot, { recursive: true });
        let destination = join(archiveRoot, name), suffix = 1;
        while (existsSync(destination))
            destination = join(archiveRoot, `${name}-${suffix++}`);
        renameSync(source, destination);
        archived.push(destination);
    }
    return archived;
}
function missingRuns(workspace) {
    const missing = { outputs: [], gradings: [], timings: [] };
    for (const dir of runDirs(workspace)) {
        const outputs = join(dir, "outputs");
        if (!isDir(outputs) || !readdirSync(outputs).some(n => n !== ".keep"))
            missing.outputs.push(rel(workspace, outputs));
        if (!existsSync(join(dir, "grading.json")))
            missing.gradings.push(rel(workspace, join(dir, "grading.json")));
        if (!existsSync(join(dir, "timing.json")))
            missing.timings.push(rel(workspace, join(dir, "timing.json")));
    }
    return missing;
}
function execute(entry, args) { const here = dirname(fileURLToPath(import.meta.url)); const child = spawnSync(process.execPath, [join(here, entry), ...args], { encoding: "utf8" }); return { ok: child.status === 0, detail: String(child.stdout || child.stderr || "").trim() }; }
function dependencies(index) { return index === 0 ? [] : [PHASES[index - 1]]; }
function newJob(skill, workspace, evalSet, baseline) { return { schema_version: SCHEMA_VERSION, job_id: digest([skill, workspace, evalSet, baseline]).slice(0, 24), revision: 0, status: "active", skill, workspace, eval_set: evalSet, baseline, phases: PHASES.map((name, index) => ({ name, depends_on: dependencies(index), status: "pending", attempts: 0, artifacts: [] })) }; }
function loadJob(path, identity) {
    if (!existsSync(path))
        return null;
    try {
        const job = loadJson(path);
        if (job.schema_version !== SCHEMA_VERSION || job.skill !== identity.skill || job.workspace !== identity.workspace || job.eval_set !== identity.eval_set || job.baseline !== identity.baseline)
            return null;
        return job;
    }
    catch {
        return null;
    }
}
function checkpoint(job) { job.revision += 1; atomicJson(join(job.workspace, STATE_FILE), job); }
function publicStatus(status) { return status === "succeeded" ? "complete" : status === "blocked" ? "blocked" : status === "failed" || status === "cancelled" ? "failed" : status === "running" || status === "stale" ? "planned" : "skipped"; }
function publicPhases(job, dryRun = false) { return job.phases.map(p => ({ name: p.name, status: dryRun ? (p.status === "succeeded" ? "complete" : "planned") : publicStatus(p.status), artifacts: p.artifacts, ...(p.detail ? { detail: p.detail } : {}), ...(p.error && !p.detail ? { detail: p.error } : {}) })); }
function envelope(options, job, status, next_actions, extra = {}) { const exit_code = status === "success" || status === "planned" ? 0 : status === "blocked" ? 3 : 1; return { schema_version: "1.0", command: "full-eval", status, exit_code, skill: job.skill, workspace: job.workspace, eval_set: job.eval_set, resume: Boolean(options.resume), dry_run: Boolean(options.dryRun), phases: publicPhases(job, Boolean(options.dryRun)), job: { schema_version: job.schema_version, id: job.job_id, revision: job.revision, status: job.status, state_file: join(job.workspace, STATE_FILE), phases: job.phases }, ...extra, next_actions }; }
function artifactExists(path) { return isDir(path) || existsSync(path); }
function captureArtifactHashes(phase) { phase.artifact_hashes = Object.fromEntries(phase.artifacts.map(path => [path, artifactHash(path)])); }
function artifactsMatch(phase) { return Boolean(phase.artifact_hashes) && phase.artifacts.every(path => artifactExists(path) && phase.artifact_hashes?.[path] === artifactHash(path)); }
function invalidateFrom(job, index) { for (let i = index; i < job.phases.length; i++) {
    const phase = job.phases[i];
    if (phase.status !== "pending") {
        phase.status = "stale";
        delete phase.error;
    }
} }
function planHashes(job) { const source = sourceHash(job.skill, [job.eval_set]), evalPlan = fileDigest(job.eval_set); return { source, evalPlan }; }
function phaseInput(name, job, options) {
    const { source, evalPlan: evalHash } = planHashes(job), prior = (phase) => job.phases.find(p => p.name === phase)?.input_hash ?? "none";
    switch (name) {
        case "validate":
        case "authoring-audit": return digest([name, source]);
        case "evaluation-design": return digest([name, source, evalHash]);
        case "scaffold": return digest([name, source, evalHash, job.baseline]);
        case "paired-runs-and-grading": return digest([name, source, evalHash, job.baseline, prior("scaffold")]);
        case "aggregate": {
            const evidence = validateExecutionEvidence(job.workspace, { skill_source_sha256: source, eval_plan_sha256: evalHash });
            return digest([name, prior("paired-runs-and-grading"), source, evalHash, evidence.evidence_sha256]);
        }
        case "static-review": return digest([name, fileDigest(join(job.workspace, "benchmark.json"))]);
        case "receipt": return digest([name, fileDigest(join(job.workspace, "benchmark.json")), fileDigest(join(job.workspace, "review.html")), prior("paired-runs-and-grading")]);
        case "post-evaluation-pattern-review": return digest([name, source, fileDigest(join(job.workspace, "benchmark.json")), fileDigest(join(job.workspace, "review.html"))]);
        case "verify": return digest([name, source, fileDigest(join(job.workspace, "benchmark.json")), fileDigest(join(job.workspace, "review.html")), String(options.humanReview), String(options.testsStatus), String(options.triggeringStatus), String(options.triggeringReason), String(options.minPassRate ?? 0.8), String(options.minDelta ?? 0)]);
    }
}
export function fullEval(options) {
    const skill = resolve(options.skillPath), evalSet = resolve(options.evalSet ?? join(skill, "evals", "evals.json")), workspace = resolve(options.workspace ?? join(dirname(skill), basename(skill) + "-workspace", "iteration-1")), baseline = options.baseline ?? "without_skill";
    const identity = { skill, workspace, eval_set: evalSet, baseline };
    const statePath = join(workspace, STATE_FILE);
    let job = loadJob(statePath, identity) ?? newJob(skill, workspace, evalSet, baseline);
    if (options.dryRun) {
        const planned = newJob(skill, workspace, evalSet, baseline);
        const [valid, message] = validateSkill(skill);
        planned.phases[0].status = valid ? "succeeded" : "failed";
        planned.phases[0].artifacts = [join(skill, "SKILL.md")];
        planned.phases[0].detail = message;
        return envelope(options, planned, valid ? "planned" : "failure", valid ? ["Rerun without --dry-run to scaffold and advance until external evidence is required."] : ["Fix skill validation errors, then rerun full-eval --resume."]);
    }
    mkdirSync(workspace, { recursive: true });
    if (options.cancel) {
        job.status = "cancelled";
        const active = job.phases.find(p => p.status === "running" || p.status === "pending" || p.status === "blocked" || p.status === "stale");
        if (active) {
            active.status = "cancelled";
            active.detail = "cancelled by request";
        }
        checkpoint(job);
        return envelope(options, job, "cancelled", ["Rerun with --resume to continue this durable job."]);
    }
    if (job.status === "cancelled" && !options.resume)
        return envelope(options, job, "cancelled", ["The job is cancelled. Rerun with --resume to continue it."]);
    if (job.status === "cancelled" && options.resume) {
        const cancelled = job.phases.findIndex(p => p.status === "cancelled");
        if (cancelled >= 0)
            invalidateFrom(job, cancelled);
        job.status = "active";
        checkpoint(job);
    }
    let document;
    try {
        document = loadJson(evalSet);
    }
    catch {
        document = null;
    }
    const evals = Array.isArray(document) ? document : document?.evals;
    const next = [];
    let receipt;
    let verification;
    for (let index = 0; index < job.phases.length; index++) {
        const phase = job.phases[index], input = phaseInput(phase.name, job, options);
        const reusable = phase.status === "succeeded" && phase.input_hash === input && artifactsMatch(phase);
        if (reusable)
            continue;
        if (phase.input_hash && phase.input_hash !== input)
            invalidateFrom(job, index);
        if (phase.status === "failed" && !options.resume && !options.retry) {
            job.status = "failed";
            return envelope(options, job, "failure", ["Rerun full-eval --resume or --retry after fixing the reported error."]);
        }
        phase.status = "running";
        phase.attempts += 1;
        phase.input_hash = input;
        delete phase.error;
        checkpoint(job);
        try {
            if (phase.name === "validate") {
                const [valid, message] = validateSkill(skill);
                phase.artifacts = [join(skill, "SKILL.md")];
                phase.detail = message;
                if (!valid)
                    throw new Error(message);
            }
            else if (phase.name === "authoring-audit") {
                const audit = auditSkill(skill), path = join(workspace, "authoring-audit.json");
                atomicJson(path, audit);
                phase.artifacts = [path];
                phase.detail = audit.status + (audit.summary.warnings ? ` (${audit.summary.warnings} warning(s))` : "");
                if (audit.status === "fail")
                    throw new Error(audit.findings.filter(f => f.severity === "error").map(f => `[${f.rule}] ${f.message}`).join("; "));
            }
            else if (phase.name === "evaluation-design") {
                const design = designEvals(evalSet, skill), path = join(workspace, "evaluation-design.json");
                atomicJson(path, design);
                phase.artifacts = [path];
                phase.detail = design.status + (design.summary.warnings ? ` (${design.summary.warnings} warning(s))` : "");
                if (design.status === "fail")
                    throw new Error(design.findings.filter(f => f.severity === "error").map(f => `[${f.rule}] ${f.message}`).join("; "));
            }
            else if (phase.name === "scaffold") {
                if (!Array.isArray(evals) || !evals.length)
                    throw new Error("eval set must contain a non-empty evals array");
                const artifacts = [];
                const { source, evalPlan } = planHashes(job);
                const archived = reconcileScenarioDirs(workspace, evals, evalPlan);
                for (let i = 0; i < evals.length; i++) {
                    const item = evals[i] ?? {}, id = item.id ?? i + 1, ed = join(workspace, "eval-" + id), metadata = join(ed, "eval_metadata.json");
                    const scenario = { eval_id: id, eval_name: item.name ?? slug(item.prompt), subject: item.subject ?? "", language: item.language ?? "", target: item.target ?? {}, preconditions: item.preconditions ?? [], budget: item.budget ?? {}, prompt: item.prompt ?? item.query ?? "", expected_output: item.expected_output ?? "", assertions: item.assertions ?? [], files: item.files ?? [], capabilities: item.capabilities ?? { filesystem: true, agent_runner: true, browser: false, network: false, tools: [] }, coverage_tags: item.coverage_tags ?? [], navigation_expectations: item.navigation_expectations ?? { must_read: [], read_when_relevant: [], must_not_read: [] } };
                    const normalized = { ...scenario, execution_binding: { skill_source_sha256: source, eval_plan_sha256: evalPlan, scenario_sha256: digest([JSON.stringify(scenario)]) } };
                    artifacts.push(metadata);
                    atomicJson(metadata, normalized);
                    for (const config of ["with_skill", baseline])
                        mkdirSync(join(ed, config, "run-1", "outputs"), { recursive: true });
                }
                phase.artifacts = artifacts;
                phase.detail = archived.length ? `archived ${archived.length} scenario workspace(s) not present in the current eval plan` : undefined;
            }
            else if (phase.name === "paired-runs-and-grading") {
                const missing = missingRuns(workspace), { source, evalPlan } = planHashes(job);
                phase.artifacts = listRunDirs(workspace);
                const binding = validateExecutionEvidence(workspace, { skill_source_sha256: source, eval_plan_sha256: evalPlan });
                if (missing.outputs.length || missing.gradings.length || missing.timings.length || binding.status !== "complete") {
                    phase.status = "blocked";
                    phase.detail = "full-eval does not run or impersonate an LLM";
                    for (const p of missing.outputs)
                        next.push("Produce the paired agent output in " + join(workspace, p) + " (LLM or human execution required).");
                    for (const p of missing.gradings)
                        next.push("Create LLM- or human-produced grading at " + join(workspace, p) + ".");
                    for (const p of missing.timings)
                        next.push("Record timing data (use null values with an unavailable reason) at " + join(workspace, p) + ".");
                    for (const error of binding.errors)
                        next.push("Regenerate bound execution evidence: " + error + ".");
                    next.push("Each execution-evidence.json must bind current skill/eval/scenario hashes, configuration, run index, and artifact content hashes.");
                    next.push("Rerun full-eval with --resume after preserving those artifacts.");
                    job.status = "blocked";
                    checkpoint(job);
                    return envelope(options, job, "blocked", next);
                }
            }
            else if (phase.name === "aggregate") {
                const agg = execute("aggregate_benchmark.js", [workspace, "--skill-name", basename(skill), "--skill-path", skill]);
                phase.artifacts = [join(workspace, "benchmark.json"), join(workspace, "benchmark.md")];
                phase.detail = agg.detail;
                if (!agg.ok)
                    throw new Error(agg.detail || "aggregation failed");
                const bp = join(workspace, "benchmark.json"), benchmark = loadJson(bp), { source, evalPlan } = planHashes(job), evidence = validateExecutionEvidence(workspace, { skill_source_sha256: source, eval_plan_sha256: evalPlan });
                if (evidence.status !== "complete")
                    throw new Error(evidence.errors.join("; "));
                benchmark.metadata = { ...(benchmark.metadata ?? {}), source_sha256: source, eval_plan_sha256: evalPlan, execution_evidence_sha256: evidence.evidence_sha256 };
                atomicJson(bp, benchmark);
            }
            else if (phase.name === "static-review") {
                const bp = join(workspace, "benchmark.json"), path = join(workspace, "review.html"), review = execute("../eval-viewer/generate_review.js", [workspace, "--skill-name", basename(skill), "--benchmark", bp, "--static", path]);
                phase.artifacts = [path];
                phase.detail = review.detail;
                if (!review.ok)
                    throw new Error(review.detail || "static review failed");
            }
            else if (phase.name === "receipt") {
                receipt = validateEvaluationReceipt(workspace);
                phase.artifacts = [join(workspace, "benchmark.json"), join(workspace, "benchmark.md"), join(workspace, "review.html"), ...listRunDirs(workspace)];
                phase.detail = receipt.missing.join(", ") || "complete";
                if (receipt.status !== "complete") {
                    phase.status = "blocked";
                    job.status = "blocked";
                    checkpoint(job);
                    return envelope(options, job, "blocked", receipt.missing.map((p) => "Provide required evaluation artifact: " + join(workspace, p) + "."), { receipt });
                }
            }
            else if (phase.name === "post-evaluation-pattern-review") {
                const path = join(workspace, "post-evaluation-pattern-review.json"), analysis = analyzeEvaluation(workspace, skill);
                atomicJson(path, analysis);
                phase.artifacts = [path];
                phase.detail = analysis.decision + "; " + analysis.failures.length + " failed expectation(s) mapped to patterns";
                if (analysis.status === "blocked") {
                    phase.status = "blocked";
                    job.status = "blocked";
                    checkpoint(job);
                    return envelope(options, job, "blocked", ["Complete evaluation evidence, then rerun full-eval --resume."], { receipt });
                }
            }
            else if (phase.name === "verify") {
                verification = verifySkill({ skillPath: skill, profile: "evaluation", evaluation: workspace, humanReview: options.humanReview, testsStatus: options.testsStatus, triggeringStatus: options.triggeringStatus, triggeringReason: options.triggeringReason, minPassRate: options.minPassRate, minDelta: options.minDelta });
                const path = join(workspace, "receipt.json");
                atomicJson(path, verification);
                phase.artifacts = [join(workspace, "benchmark.json"), join(workspace, "review.html"), path];
                phase.detail = verification.status;
                if (verification.status !== "pass") {
                    phase.status = verification.status === "fail" ? "failed" : "blocked";
                    job.status = verification.status === "fail" ? "failed" : "blocked";
                    checkpoint(job);
                    if (!options.humanReview)
                        next.push("Review " + join(workspace, "review.html") + ", then rerun full-eval --resume --human-review pass|fail.");
                    if (!options.testsStatus)
                        next.push("Provide deterministic test evidence with --tests-status pass|fail|blocked.");
                    return envelope(options, job, verification.status, next, { receipt: receipt ?? validateEvaluationReceipt(workspace), verification });
                }
            }
            phase.status = "succeeded";
            captureArtifactHashes(phase);
            checkpoint(job);
        }
        catch (error) {
            phase.status = "failed";
            phase.error = error.message;
            job.status = "failed";
            checkpoint(job);
            return envelope(options, job, "failure", ["Fix the reported error and rerun full-eval --resume or --retry."]);
        }
    }
    if (job.status !== "succeeded") {
        job.status = "succeeded";
        checkpoint(job);
    }
    receipt = receipt ?? validateEvaluationReceipt(workspace);
    verification = verification ?? (existsSync(join(workspace, "receipt.json")) ? loadJson(join(workspace, "receipt.json")) : undefined);
    return envelope(options, job, "success", [], { receipt, verification });
}
function main() { try {
    const { positionals, values } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { workspace: { type: "string" }, "eval-set": { type: "string" }, baseline: { type: "string", default: "without_skill" }, "dry-run": { type: "boolean", default: false }, resume: { type: "boolean", default: false }, retry: { type: "boolean", default: false }, cancel: { type: "boolean", default: false }, "human-review": { type: "string" }, "tests-status": { type: "string" }, "triggering-status": { type: "string" }, "triggering-reason": { type: "string" }, "min-pass-rate": { type: "string", default: "0.8" }, "min-delta": { type: "string", default: "0" } } });
    if (!positionals[0])
        throw new TypeError("skill directory is required");
    if (values.baseline !== "old_skill" && values.baseline !== "without_skill")
        throw new TypeError("--baseline must be old_skill or without_skill");
    const result = fullEval({ skillPath: positionals[0], workspace: values.workspace, evalSet: values["eval-set"], baseline: values.baseline, dryRun: values["dry-run"], resume: values.resume, retry: values.retry, cancel: values.cancel, humanReview: values["human-review"], testsStatus: values["tests-status"], triggeringStatus: values["triggering-status"], triggeringReason: values["triggering-reason"], minPassRate: Number(values["min-pass-rate"]), minDelta: Number(values["min-delta"]) });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.exit_code);
}
catch (error) {
    console.error("full_eval: " + error.message);
    process.exit(2);
} }
const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked && fileURLToPath(import.meta.url) === invoked)
    main();
