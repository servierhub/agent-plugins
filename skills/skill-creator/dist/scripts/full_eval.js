#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { validateSkill } from "./quick_validate.js";
import { validateEvaluationReceipt } from "./validate_evaluation_receipt.js";
import { sourceHash, verifySkill } from "./verify_skill_gates.js";
import { auditSkill } from "./audit_skill.js";
import { designEvals } from "./design_evals.js";
import { analyzeEvaluation } from "./analyze_evaluation.js";
function isDir(path) { try {
    return statSync(path).isDirectory();
}
catch {
    return false;
} }
function loadJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function slug(value) { return String(value ?? "eval").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "eval"; }
function runDirs(workspace) { const result = []; if (!isDir(workspace))
    return result; for (const en of readdirSync(workspace).filter(n => n.startsWith("eval-")).sort()) {
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
} return result; }
function rel(root, path) { return path.startsWith(root) ? path.slice(root.length + 1).replaceAll("\\", "/") : path; }
function missingRuns(workspace) { const missing = { outputs: [], gradings: [], timings: [] }; for (const dir of runDirs(workspace)) {
    const outputs = join(dir, "outputs");
    if (!isDir(outputs) || !readdirSync(outputs).some(n => n !== ".keep"))
        missing.outputs.push(rel(workspace, outputs));
    if (!existsSync(join(dir, "grading.json")))
        missing.gradings.push(rel(workspace, join(dir, "grading.json")));
    if (!existsSync(join(dir, "timing.json")))
        missing.timings.push(rel(workspace, join(dir, "timing.json")));
} return missing; }
function execute(entry, args) { const here = dirname(fileURLToPath(import.meta.url)); const child = spawnSync(process.execPath, [join(here, entry), ...args], { encoding: "utf8" }); return { ok: child.status === 0, detail: String(child.stdout || child.stderr || "").trim() }; }
function envelope(options, skill, workspace, evalSet, phases, status, next_actions, extra = {}) { const exit_code = status === "success" || status === "planned" ? 0 : status === "blocked" ? 3 : 1; return { schema_version: "1.0", command: "full-eval", status, exit_code, skill, workspace, eval_set: evalSet, resume: Boolean(options.resume), dry_run: Boolean(options.dryRun), phases, ...extra, next_actions }; }
export function fullEval(options) {
    const skill = resolve(options.skillPath), evalSet = resolve(options.evalSet ?? join(skill, "evals", "evals.json")), workspace = resolve(options.workspace ?? join(dirname(skill), basename(skill) + "-workspace", "iteration-1")), baseline = options.baseline ?? "without_skill";
    const phases = [];
    const [valid, message] = validateSkill(skill);
    phases.push({ name: "validate", status: valid ? "complete" : "failed", artifacts: [join(skill, "SKILL.md")], detail: message });
    if (!valid)
        return envelope(options, skill, workspace, evalSet, phases, "failure", ["Fix skill validation errors, then rerun full-eval --resume."]);
    const audit = auditSkill(skill);
    const auditArtifact = join(workspace, "authoring-audit.json");
    if (!options.dryRun) {
        mkdirSync(workspace, { recursive: true });
        writeFileSync(auditArtifact, JSON.stringify(audit, null, 2) + "\n");
    }
    phases.push({ name: "authoring-audit", status: audit.status === "fail" ? "failed" : options.dryRun ? "planned" : "complete", artifacts: [auditArtifact], detail: audit.status + (audit.summary.warnings ? ` (${audit.summary.warnings} warning(s))` : "") });
    if (audit.status === "fail")
        return envelope(options, skill, workspace, evalSet, phases, "failure", audit.findings.filter(f => f.severity === "error").map(f => `Fix authoring audit [${f.rule}]: ${f.message}`), { audit });
    const design = designEvals(evalSet, skill);
    const designArtifact = join(workspace, "evaluation-design.json");
    if (!options.dryRun) {
        writeFileSync(designArtifact, JSON.stringify(design, null, 2) + "\n");
    }
    phases.push({ name: "evaluation-design", status: design.status === "fail" ? "failed" : options.dryRun ? "planned" : "complete", artifacts: [designArtifact], detail: design.status + (design.summary.warnings ? ` (${design.summary.warnings} warning(s))` : "") });
    if (design.status === "fail")
        return envelope(options, skill, workspace, evalSet, phases, "failure", design.findings.filter(f => f.severity === "error").map(f => `Fix evaluation design [${f.rule}]: ${f.message}`), { audit, design });
    let document;
    try {
        document = loadJson(evalSet);
    }
    catch (error) {
        phases.push({ name: "scaffold", status: "failed", artifacts: [evalSet], detail: error.message });
        return envelope(options, skill, workspace, evalSet, phases, "failure", ["Create a valid eval set at " + evalSet + "."]);
    }
    const evals = Array.isArray(document) ? document : document?.evals;
    if (!Array.isArray(evals) || !evals.length)
        throw new TypeError("eval set must contain a non-empty evals array");
    const artifacts = [];
    for (let i = 0; i < evals.length; i++) {
        const item = evals[i] ?? {}, id = item.id ?? i + 1, ed = join(workspace, "eval-" + id), metadata = join(ed, "eval_metadata.json");
        artifacts.push(metadata);
        for (const config of ["with_skill", baseline])
            artifacts.push(join(ed, config, "run-1", "outputs"));
        if (!options.dryRun) {
            mkdirSync(ed, { recursive: true });
            if (!existsSync(metadata))
                writeFileSync(metadata, JSON.stringify({ eval_id: id, eval_name: item.name ?? slug(item.prompt), subject: item.subject ?? "", language: item.language ?? "", target: item.target ?? {}, preconditions: item.preconditions ?? [], budget: item.budget ?? {}, prompt: item.prompt ?? item.query ?? "", expected_output: item.expected_output ?? "", assertions: item.assertions ?? [], files: item.files ?? [], capabilities: item.capabilities ?? { filesystem: true, agent_runner: true, browser: false, network: false, tools: [] }, coverage_tags: item.coverage_tags ?? [], navigation_expectations: item.navigation_expectations ?? { must_read: [], read_when_relevant: [], must_not_read: [] } }, null, 2) + "\n");
            for (const config of ["with_skill", baseline])
                mkdirSync(join(ed, config, "run-1", "outputs"), { recursive: true });
        }
    }
    phases.push({ name: "scaffold", status: options.dryRun ? "planned" : "complete", artifacts });
    if (options.dryRun) {
        for (const name of ["paired-runs-and-grading", "aggregate", "static-review", "receipt", "post-evaluation-pattern-review", "verify"])
            phases.push({ name, status: "planned", artifacts: [] });
        return envelope(options, skill, workspace, evalSet, phases, "planned", ["Rerun without --dry-run to scaffold and advance until external evidence is required."]);
    }
    const missing = missingRuns(workspace);
    if (missing.outputs.length || missing.gradings.length || missing.timings.length) {
        phases.push({ name: "paired-runs-and-grading", status: "blocked", artifacts: runDirs(workspace), detail: "full-eval does not run or impersonate an LLM" });
        for (const name of ["aggregate", "static-review", "receipt", "post-evaluation-pattern-review", "verify"])
            phases.push({ name, status: "skipped", artifacts: [] });
        const next = [];
        for (const p of missing.outputs)
            next.push("Produce the paired agent output in " + join(workspace, p) + " (LLM or human execution required).");
        for (const p of missing.gradings)
            next.push("Create LLM- or human-produced grading at " + join(workspace, p) + ".");
        for (const p of missing.timings)
            next.push("Record timing data (use null values with an unavailable reason) at " + join(workspace, p) + ".");
        next.push("Rerun full-eval with --resume after preserving those artifacts.");
        return envelope(options, skill, workspace, evalSet, phases, "blocked", next);
    }
    phases.push({ name: "paired-runs-and-grading", status: "complete", artifacts: runDirs(workspace) });
    const agg = execute("aggregate_benchmark.js", [workspace, "--skill-name", basename(skill), "--skill-path", skill]);
    phases.push({ name: "aggregate", status: agg.ok ? "complete" : "failed", artifacts: [join(workspace, "benchmark.json"), join(workspace, "benchmark.md")], detail: agg.detail });
    if (!agg.ok)
        return envelope(options, skill, workspace, evalSet, phases, "failure", ["Fix the reported aggregation error and rerun full-eval --resume."]);
    const bp = join(workspace, "benchmark.json"), benchmark = loadJson(bp);
    benchmark.metadata = { ...(benchmark.metadata ?? {}), source_sha256: sourceHash(skill) };
    writeFileSync(bp, JSON.stringify(benchmark, null, 2) + "\n");
    const review = execute("../eval-viewer/generate_review.js", [workspace, "--skill-name", basename(skill), "--benchmark", bp, "--static", join(workspace, "review.html")]);
    phases.push({ name: "static-review", status: review.ok ? "complete" : "failed", artifacts: [join(workspace, "review.html")], detail: review.detail });
    if (!review.ok)
        return envelope(options, skill, workspace, evalSet, phases, "failure", ["Fix the reported static review error and rerun full-eval --resume."]);
    const receipt = validateEvaluationReceipt(workspace);
    phases.push({ name: "receipt", status: receipt.status === "complete" ? "complete" : "blocked", artifacts: [workspace], detail: receipt.missing.join(", ") || "complete" });
    if (receipt.status !== "complete")
        return envelope(options, skill, workspace, evalSet, phases, "blocked", receipt.missing.map(p => "Provide required evaluation artifact: " + join(workspace, p) + "."), { receipt });
    const patternReviewPath = join(workspace, "post-evaluation-pattern-review.json");
    const analysis = analyzeEvaluation(workspace, skill);
    writeFileSync(patternReviewPath, JSON.stringify(analysis, null, 2) + "\n");
    phases.push({ name: "post-evaluation-pattern-review", status: analysis.status === "blocked" ? "blocked" : "complete", artifacts: [patternReviewPath], detail: analysis.decision + "; " + analysis.failures.length + " failed expectation(s) mapped to patterns" });
    const verification = verifySkill({ skillPath: skill, profile: "evaluation", evaluation: workspace, humanReview: options.humanReview, testsStatus: options.testsStatus, triggeringStatus: options.triggeringStatus, triggeringReason: options.triggeringReason, minPassRate: options.minPassRate, minDelta: options.minDelta });
    const verificationPath = join(workspace, "receipt.json");
    writeFileSync(verificationPath, JSON.stringify(verification, null, 2) + "\n");
    phases.push({ name: "verify", status: verification.status === "pass" ? "complete" : verification.status === "fail" ? "failed" : verification.status === "na" ? "skipped" : "blocked", artifacts: [bp, join(workspace, "review.html"), verificationPath], detail: verification.status });
    const next = [];
    if (!options.humanReview)
        next.push("Review " + join(workspace, "review.html") + ", then rerun full-eval --resume --human-review pass|fail.");
    if (!options.testsStatus)
        next.push("Provide deterministic test evidence with --tests-status pass|fail|blocked.");
    return envelope(options, skill, workspace, evalSet, phases, verification.status === "pass" ? "success" : verification.status, next, { receipt, verification });
}
function main() { try {
    const { positionals, values } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { workspace: { type: "string" }, "eval-set": { type: "string" }, baseline: { type: "string", default: "without_skill" }, "dry-run": { type: "boolean", default: false }, resume: { type: "boolean", default: false }, "human-review": { type: "string" }, "tests-status": { type: "string" }, "triggering-status": { type: "string" }, "triggering-reason": { type: "string" }, "min-pass-rate": { type: "string", default: "0.8" }, "min-delta": { type: "string", default: "0" } } });
    if (!positionals[0])
        throw new TypeError("skill directory is required");
    if (values.baseline !== "old_skill" && values.baseline !== "without_skill")
        throw new TypeError("--baseline must be old_skill or without_skill");
    const result = fullEval({ skillPath: positionals[0], workspace: values.workspace, evalSet: values["eval-set"], baseline: values.baseline, dryRun: values["dry-run"], resume: values.resume, humanReview: values["human-review"], testsStatus: values["tests-status"], triggeringStatus: values["triggering-status"], triggeringReason: values["triggering-reason"], minPassRate: Number(values["min-pass-rate"]), minDelta: Number(values["min-delta"]) });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "success" || result.status === "planned" ? 0 : result.status === "blocked" ? 3 : 1);
}
catch (error) {
    console.error("full_eval: " + error.message);
    process.exit(2);
} }
const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked && fileURLToPath(import.meta.url) === invoked)
    main();
