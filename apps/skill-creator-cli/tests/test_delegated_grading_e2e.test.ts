import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildGradingJudgment } from "../dist/scripts/delegated_grading_contracts.js";
import { loadGradingManifest } from "../dist/scripts/prepare_grading.js";

/**
 * End-to-end coverage for ap-8di.6: full-eval's optional delegated grading
 * mode, exercised entirely through the real built CLI (not internal
 * function calls), using the fake-goose fixture as the candidate/baseline
 * executor (delegated grading never spawns a grader subprocess, so no fake
 * grader process is needed at all).
 */

const cli = resolve("dist/scripts/cli.js");
const fake = resolve("tests/fixtures/fake-goose.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "delegated-e2e-"));
  const skill = join(root, "demo");
  const workspace = join(root, "workspace");
  mkdirSync(join(skill, "evals"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: demo\ndescription: Evaluates demo workflows. Use when testing delegated grading end to end.\n---\n# Demo\n");
  writeFileSync(join(skill, "evals", "evals.json"), JSON.stringify({
    skill_name: "demo", aggregate_budget: { max_runs: 6, max_turns: 72, timeout_seconds: 3600 },
    evals: [{
      id: 1, name: "delegated-demo", subject: "behavioral-evaluation", language: "en",
      target: { kind: "existing-skill", execution: "execute", path: "." },
      preconditions: ["Use isolated staging"], budget: { max_turns: 12, timeout_seconds: 600 },
      prompt: "Complete the task.", expected_output: "A deterministic output.", files: [],
      capabilities: { filesystem: true, agent_runner: true, browser: false, network: false, tools: [] },
      assertions: ["The output cites verified sources"], coverage_tags: ["language:en"],
      navigation_expectations: { must_read: ["SKILL.md"], read_when_relevant: [], must_not_read: [] },
    }],
  }));
  return { root, skill, workspace };
}

function fakeEnv() {
  return {
    ...process.env,
    SKILL_CREATOR_GOOSE_COMMAND: process.execPath + " " + fake,
    FAKE_GOOSE_CANDIDATE_OUTPUT: "The report cites verified sources thoroughly.",
    FAKE_GOOSE_BASELINE_OUTPUT: "The report cites verified sources thoroughly.",
    FAKE_GOOSE_VARIANT_OUTPUTS: "1",
  };
}

function fullEval(skill: string, workspace: string, extra: string[]) {
  const run = spawnSync(process.execPath, [cli, "full-eval", skill, "--workspace", workspace, "--run-profile", "fast", "--execute", "--grading-mode", "delegated", "--grader", "grader-a=gpt-5.6-sol", "--grader", "grader-b=claude-sonnet-5", ...extra, "--format", "json", "--progress", "none"], { encoding: "utf8", env: fakeEnv() });
  return JSON.parse(run.stdout);
}

function prepareGradingCli(workspace: string) {
  const run = spawnSync(process.execPath, [cli, "prepare-grading", workspace], { encoding: "utf8" });
  return JSON.parse(run.stdout);
}

function importGradingCli(workspace: string) {
  const run = spawnSync(process.execPath, [cli, "import-grading", workspace], { encoding: "utf8" });
  return JSON.parse(run.stdout);
}

function delegateAllPending(workspace: string) {
  const dir = join(workspace, "grading-requests");
  const manifest = loadGradingManifest(workspace) as Record<string, { grader_id: string; grader_model: string; grader_provider: string }>;
  mkdirSync(join(workspace, "grading-judgments"), { recursive: true });
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "manifest.json")) {
    const request = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const entry = manifest[request.invocation_id];
    const judgment = buildGradingJudgment({
      invocationId: request.invocation_id, requestSha256: request.request_sha256, bindings: request.bindings,
      grader: { id: entry.grader_id, model: entry.grader_model, provider: entry.grader_provider },
      verdict: "pass", evidenceQuote: "cites verified sources thoroughly", rationale: "supported",
    });
    writeFileSync(join(workspace, "grading-judgments", name), JSON.stringify(judgment));
  }
}

test("delegated grading mode: full-eval reports awaiting-grading, never spawns a grader subprocess, and --resume completes after prepare/delegate/import", () => {
  const f = fixture();
  try {
    const first = fullEval(f.skill, f.workspace, []);
    assert.equal(first.status, "awaiting-grading");
    assert.equal(first.exit_code, 3);
    const phase = first.phases.find((p: any) => p.name === "paired-runs-and-grading");
    assert.equal(phase.status, "blocked");
    assert.match(phase.detail, /awaiting delegated semantic grading/);
    assert.ok(first.next_actions.some((a: string) => a.includes("prepare-grading")));
    assert.ok(first.next_actions.some((a: string) => a.includes("import-grading")));
    assert.ok(first.next_actions.some((a: string) => a.includes("--resume")));

    const prepared = prepareGradingCli(f.workspace);
    assert.ok(prepared.prepared > 0);
    // Every request must carry the exact declared grader model, never a
    // subprocess/CommandGraderAdapter identity or the candidate's model.
    const requestDir = join(f.workspace, "grading-requests");
    for (const name of readdirsyncFiles(requestDir)) {
      const request = JSON.parse(readFileSync(join(requestDir, name), "utf8"));
      assert.ok(["gpt-5.6-sol", "claude-sonnet-5"].includes(request.grader.model));
    }

    delegateAllPending(f.workspace);
    const imported = importGradingCli(f.workspace);
    assert.ok(imported.imported.length > 0);
    assert.equal(imported.rejected.length, 0);
    assert.equal(imported.ready_to_resume, true);

    const resumed = fullEval(f.skill, f.workspace, ["--resume", "--human-review", "pass", "--tests-status", "pass"]);
    assert.equal(resumed.status, "success");
    assert.equal(resumed.exit_code, 0);
    for (const name of ["validate", "authoring-audit", "evaluation-design", "scaffold", "paired-runs-and-grading", "aggregate", "static-review", "receipt", "post-evaluation-pattern-review", "verify"]) {
      const p = resumed.phases.find((x: any) => x.name === name);
      assert.equal(p.status, "complete", `phase ${name} expected complete, got ${p.status}`);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("delegated grading mode: a partial import (one grader still pending) keeps full-eval in awaiting-grading and is safely re-resumable", () => {
  const f = fixture();
  try {
    fullEval(f.skill, f.workspace, []);
    prepareGradingCli(f.workspace);
    const dir = join(f.workspace, "grading-requests");
    const manifest = loadGradingManifest(f.workspace) as Record<string, { grader_id: string; grader_model: string; grader_provider: string }>;
    const files = readdirsyncFiles(dir);
    mkdirSync(join(f.workspace, "grading-judgments"), { recursive: true });
    // Only judge the first pending request; leave the rest unanswered.
    const name = files[0];
    const request = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const entry = manifest[request.invocation_id];
    const judgment = buildGradingJudgment({
      invocationId: request.invocation_id, requestSha256: request.request_sha256, bindings: request.bindings,
      grader: { id: entry.grader_id, model: entry.grader_model, provider: entry.grader_provider },
      verdict: "pass", evidenceQuote: "cites verified sources thoroughly", rationale: "supported",
    });
    writeFileSync(join(f.workspace, "grading-judgments", name), JSON.stringify(judgment));

    const partialImport = importGradingCli(f.workspace);
    assert.equal(partialImport.imported.length, 1);
    assert.equal(partialImport.ready_to_resume, true); // no rejections/errors yet, just incomplete

    const resumeAttempt = fullEval(f.skill, f.workspace, ["--resume", "--human-review", "pass", "--tests-status", "pass"]);
    assert.equal(resumeAttempt.status, "awaiting-grading", "full-eval must not advance past a run whose grading is not yet fully finalized");
    const phase = resumeAttempt.phases.find((p: any) => p.name === "paired-runs-and-grading");
    assert.equal(phase.status, "blocked");

    // Now complete the remaining judgments and confirm the same workspace
    // resumes to success without re-executing already-completed candidates.
    delegateAllPending(f.workspace);
    const finalImport = importGradingCli(f.workspace);
    assert.equal(finalImport.ready_to_resume, true);
    const finalResume = fullEval(f.skill, f.workspace, ["--resume", "--human-review", "pass", "--tests-status", "pass"]);
    assert.equal(finalResume.status, "success");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("delegated grading mode: default (subprocess) full-eval behavior is completely unaffected by the presence of --grading-mode support", () => {
  const f = fixture();
  try {
    const run = spawnSync(process.execPath, [cli, "full-eval", f.skill, "--workspace", f.workspace, "--run-profile", "fast", "--execute", "--grader", "grader-a=gpt-5.6-sol", "--grader", "grader-b=claude-sonnet-5", "--human-review", "pass", "--tests-status", "pass", "--format", "json", "--progress", "none"], { encoding: "utf8", env: fakeEnv() });
    const result = JSON.parse(run.stdout);
    assert.equal(result.status, "success");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

function readdirsyncFiles(dir: string): string[] {
  return readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "manifest.json");
}
