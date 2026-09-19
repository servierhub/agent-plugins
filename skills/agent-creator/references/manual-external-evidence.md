# Manual and external evaluation evidence

`evidence_exchange.js` moves an agent evaluation to a host-neutral runner and
imports its result into the existing `eval-<id>/<configuration>` workspace
layout. It does not execute Goose, grade results, or attest CI execution.

## Export a self-contained job

The released `agent-creator` executable does not expose this source-only exchange API. Integrators that need it must use the TypeScript module from a source checkout; do not invoke compiled `dist/` files as a public CLI.

The output contains `job.json`, snapshots of `agent.md` and `evals.json`, copied
files under `fixtures/`, the canonical `run.schema.json`, and
`run.example.json`. Every reference has a SHA-256
checksum. `job_id` is derived from the canonical job inputs, excluding the
creation timestamp, so the same inputs identify the same job.

A runner can be a person, a local script, or an external service. It reads
`job.json`, executes exactly one listed eval/configuration, and returns the
canonical `agent-creator.evidence-run/v1` JSON represented by
`run.example.json`. Paths and JSON fields are host-neutral; no Goose-specific
transcript is required.

## Provenance and trust

A run must state:

- `provenance.source`: `manual` or `external`;
- `producer` and ISO `captured_at`, plus optional `host` and `notes`;
- `trust.level`: `unverified`, `human-reviewed`, or
  `independently-verified`, with a reason;
- `reviewed_by` for either reviewed level.

Trust is a declared evidence-handling state, not proof of origin. In particular,
none of these levels, the bundle checksum, or a successful import is a CI
attestation. The importer deliberately does not accept a `ci` provenance source.

## Import

Import is likewise a source-only integration API rather than a released command. After an integrator imports the result, continue with `agent-creator grade /tmp/reviewer-evaluation` and `agent-creator aggregate /tmp/reviewer-evaluation`.

Import validates bundle checksums, recomputes `job_id` from canonical manifest identity fields, applies the exported closed schema (including nested unknown-field rejection and strict RFC3339 timestamps), validates the response checksum, provenance, trust, eval ID, and configuration. Eval IDs are bounded printable strings or integers; their destination segment is percent-encoded and checked for workspace containment. It writes `response.md`, `timing.json`, a synthetic
import transcript carrying provenance/trust, and canonical `evidence.json` in
the normal evaluation layout. Reimporting byte-equivalent canonical evidence is
a no-op with status `duplicate`.

Diagnostics are machine-readable codes: `WRONG_JOB` means the run names a job,
eval, or configuration outside the manifest; `STALE_JOB` means the workspace is
pinned to another job; `STALE_EVAL` means existing eval metadata no longer
matches; `STALE_BUNDLE` means a referenced snapshot is missing or changed; and
`DUPLICATE_CONFLICT` means that slot already contains different evidence.
