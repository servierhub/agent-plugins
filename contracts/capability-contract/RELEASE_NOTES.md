# Release notes — compatibility policy 1.0.0

## Contract/scenario challenge API 1.0.0

- Adds a versioned pure API for isolated domain, UX, safety, and evaluation challenge findings, each citing a contract field or declared scenario.
- Consolidates only true duplicates while preserving contradictions and cross-role disagreement; low-risk unresolved findings are advisory, while high-risk unresolved findings become explicit unknowns and blockers.
- Accepted changes create the next immutable contract revision and invalidate the prior scenario hash. Strict hostile-input validation, deterministic hashing, bounded roles/findings, schemas, fixtures, tests, and package exports are included.

## Adaptive bounded elicitation API 1.0.0

- Adds a strict, versioned known/assumed/unknown/contradictory field and evidence model built on the unchanged Artifact Recommendation API.
- Selects at most three deterministic questions by architecture, safety, and evaluation decision value; deduplicates answered and previously asked context.
- Makes optional unanswered fields preview-ready through explicit reversible defaults and consequences, while destructive, security, production, and untestable ambiguity always requires confirmation.
- Adds public exports, result schema, specification, scenario fixtures, and novice/expert/sparse/contradictory/safety tests.

## Artifact recommendation API 1.0.0

- Adds an independently versioned, deterministic six-type recommendation API and schema for Skill, agent, hook, MCP server, recipe, and plugin outcomes.
- The existing four-type CapabilityContractV1 enum is unchanged. Recommendations are side-effect-free, strictly validated, explicit about ambiguity and override disposition, and conservative about portability.
- Compatibility inventory now classifies the recommendation wire contract and schema as supported serialized surfaces, and the `recommendArtifact` function as a TypeScript-only public API.

## Skill full-eval envelope 1.1

- Registers the additive Skill full-eval 1.1 envelope with `checkpoint` and ordered `executable_actions`, while retaining 1.0 read compatibility.
- Refreshes source evidence for the full-eval and verification producers, including benchmark Markdown, evaluation analysis, and review artifacts.

## Breaking

- Migration preview inputs now require `entryType: "regular-file" | "directory" | "symlink"`. Directories and symlinks are rejected; symlink targets are never followed.
- Migration paths outside the exact legacy evaluation layout or corresponding root target are rejected, including raw dot segments, absolute/drive/backslash/control/NUL paths, secret-like names/extensions, and likely secret bytes.
- Former aggregate host registry rows are replaced by one-to-one schema and protocol-message rows for capability reporting, negotiation request/result, run request, event family, cancellation request/response, resume request, and artifact request/exchange.

## Non-breaking

- Existing safe legacy `runs/eval-N/...` evidence remains readable and receives the same deterministic copy-only root-layout preview.
- The inventory now includes creator `evals.json` forms, evaluation metadata, grading, timing, review/feedback, agent transcript/run summary, and Skill trigger/run-loop outputs.
- Owner and source-evidence corrections do not alter producer payload bytes. Result/exit semantics still delegate to the Result Contract.
- Every public row has an executable golden outcome or explicit contract-only outcome, and all compatibility/migration fixtures are SHA-256 frozen.

## Deprecation windows and replacements

- Every `legacy-readable` surface remains readable through compatibility policy `1.x` and at least **2027-09-30**. Removal requires a `2.0` release and prior release-note notice.
- Each legacy row names its replacement. Where no versioned producer exists yet, the replacement is explicitly future-versioned; maintainers must introduce and document that replacement before removal.
- `workspace.skill-eval.legacy-runs.v0` is replaced by `workspace.skill-eval.current.v1` using dry-run migration `workspace.skill-eval.runs-to-root.v1`.
- `plugin.manifest.draft-v1.1` was never activated and remains diagnostic-only; use `plugin.manifest.v1`.

- Compatibility hardening now binds semantic producer/consumer sites with addition/removal-sensitive evidence, closes recursive validator shapes, enforces exact golden substitution aliases, and rejects encoded or serialized secret material with constant redacted diagnostics.

## Evaluation plan 1.1.0
- Added a backward-compatible role-aware multi-model matrix with deterministic pre-execution job expansion, concrete/alias/documented-default identity resolution, ordered fallback, identity receipts, collision-free matrix-entry/run job IDs, opaque host aliases with unknown identity confidence, and strict complete budget bounds.
- Kept evaluation plan 1.0.0 and its single-model adapter unchanged.
