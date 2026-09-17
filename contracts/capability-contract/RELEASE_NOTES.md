# Release notes — compatibility policy 1.0.0

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
