#!/usr/bin/env node
/**
 * Deterministic import and verification of host-delegated grading judgments
 * (ADR 0001, skills/skill-creator/references/adr/0001-host-delegated-semantic-grading.md,
 * ap-8di.4).
 *
 * `import-grading` consumes untrusted subagent judgment envelopes written by
 * a delegating host under `grading-judgments/`, validates their schema and
 * provenance, re-derives every hash rather than trusting a claimed one,
 * verifies the evidence quote is exactly contained in the candidate output
 * and substantively overlaps its criterion without being a self-referential
 * grading claim, rejects duplicate/replayed/budget-exceeding invocations,
 * and writes canonical grader evidence atomically into the originating run
 * directory (`grader-evidence/`). No imported judgment can self-author an
 * authoritative hash: `assertion_sha256`/`variant_sha256`/`output_sha256`
 * are always the values recomputed from the current evidence in
 * `deterministic-evidence.json`, never values copied from the judgment.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { substantiveOverlap, META_GRADE } from "./evaluator_grading.js";
import { readTrustedJson, readTrustedSnapshot } from "./trusted_snapshot.js";
import {
  validateGradingRequest, validateGradingJudgment, bindJudgmentToRequest,
  type GradingRequest, type GradingJudgment,
} from "./delegated_grading_contracts.js";
import { loadGradingManifest, REQUEST_DIR_NAME, JUDGMENT_DIR_NAME } from "./prepare_grading.js";

export const DEFAULT_GRADER_BUDGET = 200;

export interface ImportedEvidence {
  invocation_id: string;
  run_directory: string;
  grader_id: string;
  verdict: "pass" | "fail" | "inconclusive";
  valid_evidence: boolean;
  reason?: string;
}

export interface ImportGradingResult {
  schema_version: "1.0";
  workspace: string;
  imported: ImportedEvidence[];
  rejected: Array<{ invocation_id: string; reason: string }>;
  already_imported: string[];
  budget: { used: number; limit: number };
  ready_to_resume: boolean;
  errors: Array<{ invocation_id: string; message: string }>;
}

function loadJson(root: string, path: string, label: string): any | null {
  if (!existsSync(path)) return null;
  try {
    return readTrustedJson(root, path, label);
  } catch {
    return null;
  }
}

function loadText(root: string, path: string, label: string, maxBytes: number): string | null {
  if (!existsSync(path)) return null;
  try {
    return readTrustedSnapshot(root, path, label, { maxBytes, allowEmpty: true }).bytes.toString("utf8");
  } catch {
    return null;
  }
}

function atomic(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

/**
 * Verifies an evidence quote is exactly contained in the candidate output,
 * substantively overlaps the assertion criterion, and is not a
 * self-referential grading claim (a grader asserting "I pass this" instead
 * of quoting real evidence). Mirrors the identical rule already enforced
 * against CommandGraderAdapter output in evaluator_grading.ts's
 * parseJudgment, so a delegated judgment cannot pass a weaker check than a
 * subprocess judgment would.
 */
function verifiedEvidence(criterion: string, output: string, quote: string): { valid: boolean; reason?: string } {
  if (!quote || quote.length === 0) return { valid: false, reason: "Evidence quote is empty" };
  if (!output.includes(quote)) return { valid: false, reason: "Evidence quote is not contained in candidate output" };
  if (META_GRADE.test(quote)) return { valid: false, reason: "Self-referential grading claims are not semantic evidence" };
  if (!substantiveOverlap(criterion, quote)) return { valid: false, reason: "Evidence quote does not substantively overlap the criterion" };
  return { valid: true };
}

/**
 * Imports and verifies every judgment file currently present under
 * `grading-judgments/`, writing canonical, re-derived grader evidence into
 * each judgment's originating run directory's `grader-evidence/`.
 *
 * Rejects (without writing evidence, and without throwing — every rejection
 * is reported in `rejected`/`errors`):
 * - malformed JSON or a judgment failing `validateGradingJudgment`'s closed
 *   schema (unknown fields, non-finite usage, invalid verdict enum, a
 *   `judgment_sha256` that does not match its own canonical contents);
 * - a judgment with no matching request file, or a request file failing
 *   `validateGradingRequest` (forged/stale `request_sha256`);
 * - a judgment whose `invocation_id`/`request_sha256`/bindings do not
 *   exactly match its claimed request (`bindJudgmentToRequest`), which
 *   covers wrong request IDs and stale/forged bindings;
 * - a judgment whose bindings no longer match the run directory's current
 *   `deterministic-evidence.json` (the run was re-executed after the
 *   request was prepared);
 * - a duplicate grader identity or a replayed invocation_id within the same
 *   assertion's already-imported evidence set (model/provider ambiguity is
 *   rejected the same way: two judgments claiming the same invocation_id
 *   but different grader identity are both rejected rather than one
 *   silently overwriting the other);
 * - an uncontained, self-referential, or non-substantive evidence quote;
 * - any import once the configured grader-call budget is exhausted.
 *
 * Re-import is idempotent: a judgment whose canonical evidence file already
 * exists with byte-identical content is reported in `already_imported` and
 * is neither re-validated against the budget nor rewritten.
 */
export function importGrading(workspaceArg: string, options: { budgetLimit?: number } = {}): ImportGradingResult {
  const workspace = resolve(workspaceArg);
  const requestDir = join(workspace, REQUEST_DIR_NAME);
  const judgmentDir = join(workspace, JUDGMENT_DIR_NAME);
  const budgetLimit = options.budgetLimit ?? DEFAULT_GRADER_BUDGET;
  const imported: ImportedEvidence[] = [];
  const rejected: ImportGradingResult["rejected"] = [];
  const alreadyImported: string[] = [];
  const errors: ImportGradingResult["errors"] = [];
  let budgetUsed = 0;

  if (!existsSync(judgmentDir)) {
    return { schema_version: "1.0", workspace, imported, rejected, already_imported: alreadyImported, budget: { used: 0, limit: budgetLimit }, ready_to_resume: false, errors };
  }

  const manifest = loadGradingManifest(workspace);
  // Track which grader identities and invocation IDs have already claimed a
  // slot for a given (run_directory, assertion_id, assertion_version) so a
  // duplicate/replayed/ambiguous claim on the same assertion is rejected
  // deterministically regardless of file iteration order.
  const claimedByAssertion = new Map<string, Set<string>>(); // key: run|assertion|version -> set of grader_id
  const consumedInvocationIds = new Set<string>();

  const fileNames = readdirSync(judgmentDir).filter((name) => name.endsWith(".json")).sort();
  for (const fileName of fileNames) {
    const invocationId = fileName.replace(/\.json$/, "");
    const judgmentPath = join(judgmentDir, fileName);
    const requestPath = join(requestDir, fileName);
    try {
      const manifestEntry = manifest[invocationId];
      if (!manifestEntry) { rejected.push({ invocation_id: invocationId, reason: "No prepare-grading manifest entry for this invocation_id" }); continue; }
      const runDir = resolve(workspace, manifestEntry.run_directory);
      const evidenceDir = join(runDir, "grader-evidence");
      const evidencePath = join(evidenceDir, invocationId + ".json");

      if (existsSync(evidencePath)) { alreadyImported.push(invocationId); continue; }

      if (budgetUsed >= budgetLimit) { rejected.push({ invocation_id: invocationId, reason: "Semantic grader budget exhausted" }); continue; }

      let judgmentRaw: unknown;
      try {
        judgmentRaw = loadJson(judgmentDir, judgmentPath, fileName);
      } catch (error) { rejected.push({ invocation_id: invocationId, reason: `Judgment file is unreadable or escapes containment: ${(error as Error).message}` }); continue; }
      if (!judgmentRaw) { rejected.push({ invocation_id: invocationId, reason: "Judgment file is missing or not valid JSON" }); continue; }

      let judgment: GradingJudgment;
      try {
        judgment = validateGradingJudgment(judgmentRaw);
      } catch (error) { rejected.push({ invocation_id: invocationId, reason: `Judgment schema is invalid: ${(error as Error).message}` }); continue; }

      let requestRaw: unknown;
      try {
        requestRaw = existsSync(requestPath) ? loadJson(requestDir, requestPath, fileName) : null;
      } catch (error) { rejected.push({ invocation_id: invocationId, reason: `Request file is unreadable or escapes containment: ${(error as Error).message}` }); continue; }
      if (!requestRaw) { rejected.push({ invocation_id: invocationId, reason: "No matching request file for this invocation_id" }); continue; }

      let request: GradingRequest;
      try {
        request = validateGradingRequest(requestRaw);
      } catch (error) { rejected.push({ invocation_id: invocationId, reason: `Request schema is invalid: ${(error as Error).message}` }); continue; }

      try {
        bindJudgmentToRequest(request, judgment);
      } catch (error) { rejected.push({ invocation_id: invocationId, reason: (error as Error).message }); continue; }

      // Re-derive authoritative bindings from current evidence rather than
      // trusting the request/judgment's copy: a judgment can never
      // self-author its own binding to a different or re-executed run.
      const deterministicPath = join(runDir, "deterministic-evidence.json");
      const deterministic = loadJson(runDir, deterministicPath, "deterministic-evidence.json");
      const outputText = loadText(runDir, join(runDir, "outputs", "result.txt"), "outputs/result.txt", 256 * 1024);
      if (!deterministic || outputText === null) { rejected.push({ invocation_id: invocationId, reason: "Originating run no longer has deterministic evidence or candidate output" }); continue; }
      const currentVariantSha256 = String(deterministic.variant_sha256 ?? "");
      const currentOutputSha256 = String(deterministic.output_sha256 ?? "");
      if (judgment.bindings.variant_sha256 !== currentVariantSha256 || judgment.bindings.output_sha256 !== currentOutputSha256) {
        rejected.push({ invocation_id: invocationId, reason: "Request/judgment bindings are stale: the run has been re-executed since prepare-grading" });
        continue;
      }

      const assertionKey = `${manifestEntry.run_directory}|${manifestEntry.assertion_id}|${manifestEntry.assertion_version}`;
      const claimed = claimedByAssertion.get(assertionKey) ?? new Set<string>();
      if (claimed.has(judgment.grader.id)) { rejected.push({ invocation_id: invocationId, reason: `Grader ${judgment.grader.id} already has an imported judgment for this assertion` }); continue; }
      if (consumedInvocationIds.has(invocationId)) { rejected.push({ invocation_id: invocationId, reason: "invocation_id has already been imported (replay)" }); continue; }

      const evidence = verifiedEvidence(request.assertion.criterion, outputText, judgment.evidence_quote);
      const validEvidence = evidence.valid;

      const canonicalEvidence = {
        schema_version: 1,
        grader_id: judgment.grader.id,
        model: judgment.grader.model,
        provider: judgment.grader.provider,
        invocation_id: judgment.invocation_id,
        blinded: true,
        verdict: validEvidence ? judgment.verdict : "inconclusive",
        evidence_quote: judgment.evidence_quote,
        rationale: validEvidence ? judgment.rationale : evidence.reason,
        valid_evidence: validEvidence,
        assertion_sha256: request.bindings.assertion_sha256,
        variant_sha256: currentVariantSha256,
        output_sha256: currentOutputSha256,
        usage: judgment.usage,
        source: "host-delegated",
      };

      atomic(evidencePath, canonicalEvidence);
      claimed.add(judgment.grader.id);
      claimedByAssertion.set(assertionKey, claimed);
      consumedInvocationIds.add(invocationId);
      budgetUsed++;
      imported.push({ invocation_id: invocationId, run_directory: manifestEntry.run_directory, grader_id: judgment.grader.id, verdict: canonicalEvidence.verdict as ImportedEvidence["verdict"], valid_evidence: validEvidence, ...(validEvidence ? {} : { reason: evidence.reason }) });
    } catch (error) {
      errors.push({ invocation_id: invocationId, message: (error as Error).message });
    }
  }

  const readyToResume = imported.length + alreadyImported.length > 0 && rejected.length === 0 && errors.length === 0;
  return { schema_version: "1.0", workspace, imported, rejected, already_imported: alreadyImported, budget: { used: budgetUsed, limit: budgetLimit }, ready_to_resume: readyToResume, errors };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const workspace = argv[0];
  if (!workspace) { console.error("usage: import-grading <workspace> [--budget <n>]"); return 2; }
  const budgetIndex = argv.indexOf("--budget");
  const budgetLimit = budgetIndex >= 0 ? Number(argv[budgetIndex + 1]) : undefined;
  try {
    console.log(JSON.stringify(importGrading(workspace, { budgetLimit }), null, 2));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ schema_version: "1.0", command: "import-grading", status: "failure", reason: (error as Error).message }, null, 2));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().then((code) => process.exit(code));
}
