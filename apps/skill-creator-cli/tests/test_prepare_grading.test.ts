import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { counterbalancedPairSeed, pairedOrderFromSeed, sha256 } from "../dist/scripts/evaluation_provenance.js";
import { prepareGrading, gradingStatus } from "../dist/scripts/prepare_grading.js";
import { validateGradingJudgment, buildGradingJudgment } from "../dist/scripts/delegated_grading_contracts.js";

function fixtureWorkspace(options: { assertions?: unknown[]; requestedPairs?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prepare-grading-"));
  const evalDir = join(root, "eval-one");
  const requestedPairs = options.requestedPairs ?? 1;
  const binding = { skill_source_sha256: "a".repeat(64), eval_plan_sha256: "b".repeat(64), scenario_sha256: "c".repeat(64) };
  const schedule = Array.from({ length: requestedPairs }, (_, i) => {
    const seed = counterbalancedPairSeed(binding, i + 1);
    return { pair_index: i + 1, seed, order: pairedOrderFromSeed(seed) };
  });
  const assertions = options.assertions ?? [{ id: "a1", version: 1, classification: "semantic", criterion: "Cites verified sources" }];
  const metadata = {
    eval_id: "one", run_profile: "fast", requested_pairs: requestedPairs, decision_policy: "fixed",
    execution_schedule: schedule, execution_binding: binding, baseline_configuration: "without_skill",
    prompt: "Prepare a report", model: "test-model", assertions,
  };
  mkdirSync(evalDir, { recursive: true });
  writeFileSync(join(evalDir, "eval_metadata.json"), JSON.stringify(metadata));
  for (const config of ["with_skill", "without_skill"]) {
    for (let i = 1; i <= requestedPairs; i++) {
      const runDir = join(evalDir, config, "run-" + i);
      mkdirSync(join(runDir, "outputs"), { recursive: true });
    }
  }
  return { root, evalDir, requestedPairs };
}

function writeRunEvidence(evalDir: string, config: string, index: number, output: string) {
  const runDir = join(evalDir, config, "run-" + index);
  writeFileSync(join(runDir, "outputs", "result.txt"), output);
  writeFileSync(join(runDir, "deterministic-evidence.json"), JSON.stringify({
    schema_version: 1,
    variant_sha256: sha256(JSON.stringify({ configuration: config, run: index })),
    output_sha256: sha256(output),
    assertions: [],
  }));
}

test("prepareGrading emits nothing when no run has produced candidate/deterministic evidence yet", () => {
  const { root } = fixtureWorkspace();
  try {
    const result = prepareGrading(root);
    assert.equal(result.prepared, 0);
    assert.equal(result.pending_units.length, 0);
    assert.deepEqual(result.errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepareGrading emits requests once evidence exists, and is idempotent on re-run", () => {
  const { root, evalDir } = fixtureWorkspace();
  try {
    writeRunEvidence(evalDir, "with_skill", 1, "The report cites verified sources.");
    writeRunEvidence(evalDir, "without_skill", 1, "The report has no citations.");
    const first = prepareGrading(root);
    assert.equal(first.prepared, 4); // 2 runs * 2 required grader slots
    assert.equal(first.already_prepared, 0);
    assert.equal(first.pending_units.length, 2);

    const second = prepareGrading(root);
    assert.equal(second.prepared, 0);
    assert.equal(second.already_prepared, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepareGrading never leaks environment/credential data into a request file (pure deterministic scan)", () => {
  const { root, evalDir } = fixtureWorkspace();
  try {
    writeRunEvidence(evalDir, "with_skill", 1, "The report cites verified sources.");
    writeRunEvidence(evalDir, "without_skill", 1, "The report has no citations.");
    const before = process.env.GOOSE_TEST_SENTINEL;
    process.env.GOOSE_TEST_SENTINEL = "must-not-be-read";
    try {
      const result = prepareGrading(root);
      assert.ok(result.prepared > 0);
      const files = readdirSync(join(root, "grading-requests"));
      for (const name of files) {
        const content = readFileSync(join(root, "grading-requests", name), "utf8");
        assert.ok(!content.includes("must-not-be-read"));
      }
    } finally {
      if (before === undefined) delete process.env.GOOSE_TEST_SENTINEL; else process.env.GOOSE_TEST_SENTINEL = before;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepareGrading skips scenarios with only deterministic assertions", () => {
  const { root, evalDir } = fixtureWorkspace({ assertions: [{ id: "d1", version: 1, classification: "deterministic", checker: { kind: "contains", value: "x" }, criterion: "contains x" }] });
  try {
    writeRunEvidence(evalDir, "with_skill", 1, "output x here");
    writeRunEvidence(evalDir, "without_skill", 1, "output x here");
    const result = prepareGrading(root);
    assert.equal(result.prepared, 0);
    assert.equal(result.skipped_no_semantic_assertions, 2); // one per scheduled run directory (with_skill, without_skill)
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gradingStatus reports pending, then completed after a judgment is written, and recommends resume", () => {
  const { root, evalDir } = fixtureWorkspace();
  try {
    writeRunEvidence(evalDir, "with_skill", 1, "The report cites verified sources.");
    writeRunEvidence(evalDir, "without_skill", 1, "The report has no citations.");
    prepareGrading(root);
    const pendingStatus = gradingStatus(root);
    assert.equal(pendingStatus.pending, 4);
    assert.equal(pendingStatus.completed, 0);
    assert.equal(pendingStatus.ready_to_resume, false);
    assert.match(pendingStatus.next_actions.join(" "), /Delegate 4 pending/);

    const requestFiles = readdirSync(join(root, "grading-requests"));
    const requestName = requestFiles[0];
    const request = JSON.parse(readFileSync(join(root, "grading-requests", requestName), "utf8"));
    const judgment = buildGradingJudgment({
      invocationId: request.invocation_id,
      requestSha256: request.request_sha256,
      bindings: request.bindings,
      grader: { id: "grader-a", model: "test-model", provider: "unspecified" },
      verdict: "pass",
      evidenceQuote: "cites verified sources",
      rationale: "supported",
    });
    assert.deepEqual(validateGradingJudgment(judgment), judgment);
    mkdirSync(join(root, "grading-judgments"), { recursive: true });
    writeFileSync(join(root, "grading-judgments", requestName), JSON.stringify(judgment));

    const afterOne = gradingStatus(root);
    assert.equal(afterOne.completed, 1);
    assert.equal(afterOne.pending, 3);
    assert.equal(afterOne.ready_to_resume, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepareGrading refuses a symlinked eval_metadata.json (no-follow trusted read)", () => {
  const { root, evalDir } = fixtureWorkspace();
  try {
    const outsideDir = mkdtempSync(join(tmpdir(), "prepare-grading-outside-"));
    const outsideMetadata = join(outsideDir, "eval_metadata.json");
    writeFileSync(outsideMetadata, JSON.stringify({ eval_id: "forged", run_profile: "fast", requested_pairs: 1, assertions: [] }));
    const metadataPath = join(evalDir, "eval_metadata.json");
    rmSync(metadataPath, { force: true });
    symlinkSync(outsideMetadata, metadataPath);
    const result = prepareGrading(root);
    assert.ok(result.errors.some((e) => /unreadable|invalid-evaluation-plan|symbolic/i.test(e.message)) || result.prepared === 0);
    rmSync(outsideDir, { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
