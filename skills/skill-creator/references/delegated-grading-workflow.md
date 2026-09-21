# Delegated semantic grading workflow (optional path)

This is an **optional** grading path, not the default. The default path is the subprocess grader (`--grader id=model`, `CommandGraderAdapter`) documented in [evaluation-workflow.md](evaluation-workflow.md); it spawns its own `goose run` invocation per grader call with an explicit `--model`, exactly like candidate execution already does, and needs no interactive session. Use this delegation-based path instead when a Goose session is already running `full-eval` interactively and you would rather avoid spawning a second `goose run` process per grader call for a task (grading a fixed text) that needs no tools, filesystem, or isolated cwd — only a model call.

Read this reference when a `full-eval` run reports `awaiting-grading` (see [ADR 0001](adr/0001-host-delegated-semantic-grading.md)) and you have chosen to grade the pending requests via delegation rather than the subprocess grader.

## What this path avoids, and what it does not avoid

This workflow requires **no ACP transport** and **no MCP sampling capability** — Skill Creator's CLI is a plain process with no sampling capability of its own, so it cannot borrow a parent session's model implicitly; the delegation call is made explicitly by the session, not by the CLI. It also avoids spawning a **second** `goose run` subprocess for grading, reusing the parent session's own model invocation instead.

It does **not** avoid subprocess invocation of Goose in general: candidate execution already spawns `goose run` per paired run today, and that is unaffected by this document. The subprocess grader is not "nested" in any deeper sense than candidate execution already is — nesting depth is not the reason to prefer this path. Prefer it only when you want to avoid a second parallel model-invocation mechanism for a tool-free judgment task, or when the session's own budget/cost accounting should include grading calls directly instead of capturing them from a subprocess's usage report.

## The loop

### 1. Prepare pending requests (deterministic, no model access)

```bash
skill-creator prepare-grading <workspace>
```

This reads the workspace's already-produced candidate outputs and deterministic evidence, and writes one blinded `GradingRequest` per grader declared in each scenario's `grading_plan` (from `--grader id=model` at plan time) into `<workspace>/grading-requests/`. It never invents a grader identity and never substitutes the candidate's own model — each request already carries the exact `grader.model` and `grader.provider` a human declared at plan time.

### 2. Check status

```bash
skill-creator grading-status <workspace>
```

Reports `pending`, `completed`, and `stale` counts and the exact next command. If `pending` is 0 and `completed` > 0, skip to step 4.

### 3. Delegate every pending request to an isolated subagent

For each file in `<workspace>/grading-requests/*.json` that has no matching file yet in `<workspace>/grading-judgments/<same-name>.json`:

1. Read the request JSON. It contains `prompt`, `candidate.alias`/`candidate.output`, `assertion.criterion`, `instructions`, and `grader.model`/`grader.provider` — never another variant's output, another grader's identity, or a prior verdict.
2. Delegate the request to an independent subagent, passing **the request's own `grader.model`** as the subagent's model (never the parent session's active model, never a value not present in the request). Give the subagent only the request's `prompt`, `candidate.output`, `assertion.criterion`, and `instructions` as its task — nothing else from the workspace.
3. Instruct the subagent to return **only** a JSON object shaped `{"verdict": "pass"|"fail"|"inconclusive", "evidence_quote": "<exact substring of candidate.output>", "rationale": "<short text>"}`. No file writes, no tool calls beyond returning this JSON.
4. Take the subagent's raw JSON response and build a judgment file at `<workspace>/grading-judgments/<same-name-as-request>.json` with this exact shape:

```json
{
  "schema_version": "1.0",
  "kind": "skill-creator-delegated-grading-judgment",
  "invocation_id": "<copy from the request>",
  "request_sha256": "<copy request_sha256 from the request>",
  "bindings": { "<copy bindings verbatim from the request>": "..." },
  "grader": { "id": "<copy grader id from prepare-grading's manifest — see below>", "model": "<copy grader.model from the request>", "provider": "<copy grader.provider from the request>" },
  "verdict": "pass",
  "evidence_quote": "<subagent's evidence_quote>",
  "rationale": "<subagent's rationale>",
  "usage": null
}
```

The grader `id` is not in the request file itself (the request is blinded to avoid leaking grader identity into the candidate-facing prompt); read it from `<workspace>/grading-requests/manifest.json`, keyed by the request's own filename (`invocation_id`), field `grader_id`. Copying any other value than the manifest's `grader_id`/`grader_model`/`grader_provider` for that exact `invocation_id` will be rejected on import — a subagent's judgment must match the identity `prepare-grading` planned for that slot, not any other grader's identity.

Bound parallel delegation: delegate no more than a small fixed number of pending requests at once (a handful, not the entire backlog in one burst) to keep cost and failure blast-radius bounded. If a delegated subagent fails, times out, or returns malformed JSON, leave that invocation_id's judgment file unwritten — it remains `pending` in `grading-status` with no fabricated verdict, and can be retried independently on the next pass.

### 4. Import and verify (deterministic, no model access)

```bash
skill-creator import-grading <workspace>
```

Every judgment is re-validated end to end: schema, request binding, planned-grader-identity match, exact-quote containment, substantive overlap with the criterion, anti-self-reference, and re-derivation of the current output/variant hash (a judgment answering stale evidence from a re-executed run is rejected, not silently accepted). A judgment file being present is never itself sufficient — only `import-grading`'s own re-validation determines what becomes trusted evidence.

### 5. Resume

```bash
skill-creator full-eval <skill-directory> --workspace <workspace> --resume
```

Once `import-grading` reports `ready_to_resume: true`, `--resume` continues aggregation, static review, receipt, pattern review, and verification exactly as it would after any other phase completes.

## Grader plan shapes

- **Development** (fast iteration): a single grader (e.g. `--grader dev=<model>`). `aggregateJudgments` resolves a lone grader's evidence to `inconclusive` rather than a trusted pass/fail — this is expected for iteration, not release evidence.
- **Standard/release** (independent evidence): two or more graders with distinct `id`s and, ideally, distinct models/providers so their judgments are not correlated by shared model failure modes (e.g. one grader on `gpt-5.6-sol`, one on `claude-sonnet-5`, both reachable through a single configured Model-as-a-Service provider such as Azure AI Foundry — a shared provider across distinct models is expected and does not weaken independence; what matters is distinct model identity and separate, blinded invocation).

## No delegation tool available

If the current host has no subagent delegation capability (a non-interactive CI runner, for example), use the documented subprocess compatibility fallback instead of this workflow — see [evaluation-workflow.md](evaluation-workflow.md) and the `--grader-command` fallback flag. That path is explicit, opt-in, and never the default for a Goose session capable of delegation.
