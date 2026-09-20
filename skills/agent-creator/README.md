# Agent Creator

A dedicated creator for Goose custom-agent definitions stored under
`.agents/agents/`.

The source of truth is Goose's
`guides/context-engineering/custom-agents` documentation, vendored in
`references/custom-agents.md` for reproducible authoring and validation.

## Scope

| Asset | Location | Managed here? |
|---|---|---|
| Custom agents | `.agents/agents/`, `~/.agents/agents/` | Yes |
| Skills | `.agents/skills/`, `~/.agents/skills/` | No — use `skill-creator` |
| Plugins | `.agents/plugins/`, `~/.agents/plugins/` | No — use `plugin-creator` |
| Recipes | Goose recipe locations | No — use recipe tooling |

## Agent format

```markdown
---
name: code-reviewer
description: Reviews code for correctness, maintainability, and risk
model: gpt-5.5
---

You are a senior code reviewer...
```

Only `name` is required. `description` and `model` are optional. The
instruction body must be non-empty. These and the creator's name/body checks are
strict authoring policy; Goose runtime parsing can be more permissive.

## MCP boundary

Do not put `mcpServers`, `mcp`, or `extensions` in agent frontmatter, and do not
place `mcp.json` or `.mcp.json` under an agent directory. A custom agent may use
MCP extensions already enabled in its Goose session, but it cannot declare their
transport, command, environment, or credentials. Route MCP declaration,
transport, environment, packaging, and migration to
`agent-plugins:plugin-creator` (or standalone `plugin-creator`). Use recipe
tooling for a repeatable workflow that selects a known extension set. Never
silently manufacture plugin configuration from an Agent Creator request.

For the audited Goose revision, plugin `agents/` is a format marker only; custom
agents inside it are not installed or auto-discovered. Install custom agents in
a documented project, user, or compatibility agent path instead.

## Unified CLI

The package exposes the stable **agent-creator** executable with init, validate, evaluate, grade, aggregate, install, and privacy commands. Legacy internal-script entrypoints are not part of the released interface.

    agent-creator --help
    agent-creator init code-reviewer --path /tmp/agents
    agent-creator validate /tmp/agents/code-reviewer.md --format json
    agent-creator install /tmp/agents/code-reviewer.md --project /path/to/project --quiet

All commands accept --format text|json, --quiet, and --help. Exit codes are 0 for success, 1 for failure, 2 for invalid usage, and 3 when an operation is blocked (for example, a refused overwrite).

## Create

```bash
agent-creator init code-reviewer \
  --path /tmp/agents \
  --description "Reviews code for correctness and risk" \
  --role "You are a senior code reviewer. Prioritize correctness, security, and tests."
```

## Validate

```bash
agent-creator validate /tmp/agents/code-reviewer.md \
  --require-filename-match
```

## Install

Project scope:

```bash
agent-creator install /tmp/agents/code-reviewer.md \
  --project /path/to/project
```

User scope:

```bash
agent-creator install /tmp/agents/code-reviewer.md --global
```

Existing files are not overwritten unless `--force` is supplied.

## Use

Start a new Goose session where the agent is discoverable, then invoke it by
name:

```text
@code-reviewer review the current diff
```

You may also load its instructions into the current context or delegate an
isolated task to it.

## Evaluate

Create an eval set with realistic delegated tasks and objective assertions. For
example:

```json
{
  "evals": [
    {
      "id": "typescript-auth-review",
      "prompt": "Review the authentication changes in the supplied diff.",
      "assertions": [
        "Identifies the token validation risk",
        "Proposes a concrete regression test"
      ]
    }
  ]
}
```

Then run the specialized agent and a neutral delegated baseline on exactly the
same tasks:

```bash
agent-creator evaluate \
  --agent /path/to/code-reviewer.md \
  --eval-set /path/to/evals.json \
  --workspace /tmp/code-reviewer-workspace/iteration-1

agent-creator grade \
  /tmp/code-reviewer-workspace/iteration-1 \
  --llm-grader \
  --grader reviewer-a=model-a \
  --grader reviewer-b=model-b \
  --max-grader-calls 24

agent-creator aggregate \
  /tmp/code-reviewer-workspace/iteration-1 \
  --agent-name code-reviewer \
  --agent-path /path/to/code-reviewer.md

skill-creator review \
  /tmp/code-reviewer-workspace/iteration-1 \
  --agent-name code-reviewer \
  --benchmark /tmp/code-reviewer-workspace/iteration-1/benchmark.json
```

For an existing agent, use `--baseline-agent old-agent.md` to compare the new
instructions against the previous version. The evaluation preserves the custom
agent model: tasks run through isolated delegation rather than by converting the
agent into a skill or recipe.

Assertions may be legacy strings, but new suites should use versioned objects with `id`, `version`, `classification`, `criterion`, and (for deterministic assertions) a `checker` (`contains`, `not-contains`, or `regex`). Deterministic results record the response SHA-256 and exact match span. Semantic grading requires at least two independently identified graders, blinds variant identity, withholds other grades and any unpublished criteria, validates every evidence quote against the candidate output, and retains every judgment. Only unanimous, evidence-valid semantic verdicts resolve; disagreement or missing evidence is `inconclusive` and requires human review. The assertion hash binds the assertion versions and both agent variants; changing either invalidates existing grades and requires both variants to rerun. `--max-grader-calls` enforces the semantic grading budget.

## Manual or external evidence

For host-neutral evaluation handoff, canonical manifest verification, the closed run schema, safe eval-ID encoding, provenance, and trust semantics, see [`references/manual-external-evidence.md`](references/manual-external-evidence.md).

## Cautious ETA estimation

The source module `apps/agent-creator-cli/scripts/execution_eta.ts` exposes a pure incremental reducer for long-running work. Feed snapshots plus comparable completed jobs with phase history, observed concurrency, and retries. It withholds numeric dates until the configurable minimum (five by default), returning explicit `unavailable` or `calculating` reasons instead. Available estimates keep current-phase and total completion separate and include timestamp, last source update, sample basis, a rounded likely value, an earliest/latest range, and conservative confidence. Snapshot updates recalculate after a phase, retry, or concurrency change; completion records actual-versus-estimated error and range coverage for later evaluation.

`estimateExecutionEta(state, job, timestamp)` and `updateEtaEstimator(state, event)` read no wall clock and perform no I/O. Persist returned state in the host if cross-process learning is required. ETA precision is intentionally rounded (seconds, tens of seconds, or five minutes according to scale); the range is the contract, not an exact deadline. Snapshot chronology is validated before estimation: phase plans and records must be unique and ordered, completed phases must be bounded by their job, active timestamps cannot exceed the snapshot, and the current phase must be the single non-completed running phase in the plan. Invalid or contradictory snapshots return stable `unavailable` components with reason `invalid_input`, never a misleading numeric ETA. Invalid completed evidence is rejected. An already-generated estimate may optionally be attached as `snapshot.eta` and will then appear in heartbeat data. Heartbeats never invent an ETA or maintain hidden history.

## Privacy and retention

The versioned privacy policy classifies metadata, content, and protected artifacts; centralizes credential/private-path redaction; supports content-addressed protected references, expiry, deletion tombstones, and unavailable dependent claims; and separates transcript retention from aggregate evidence. See [`references/privacy-retention.md`](references/privacy-retention.md) for the CLI and local/CI access and expiry guidance.

## Execution heartbeats

Long-running evaluators can consume executor snapshots through the source module `apps/agent-creator-cli/scripts/execution_heartbeat.ts`. The API emits the stable `agent-creator.execution-heartbeat/v1` event envelope every 30 seconds by default, marks a snapshot stale after two intervals without an update, and stops before emitting when a terminal snapshot is observed. Counts, actual active workers/models, elapsed time, a privacy-safe checkpoint, and per-unit budget consumption and limits are included. Top-level primitive checkpoints are always redacted; use a structured artifact reference for a publishable checkpoint.

```ts
import { createExecutionHeartbeat } from "./apps/agent-creator-cli/scripts/execution_heartbeat.ts";

const heartbeat = createExecutionHeartbeat(
  () => executor.snapshot(),
  event => eventBus.emit(event.type, event),
  { intervalMs: 15_000 } // optional; default is 30 seconds
);
// heartbeat.stop() for an externally cancelled execution.
```

The evaluation runner enables this by default and appends non-terminal event envelopes to `<workspace>/execution_heartbeats.jsonl`. Each event reports runs, turns, and token consumption (with limits where available), and those counters advance as delayed Goose runs complete. Checkpoints use the central privacy redactor. Configure it with `--heartbeat-interval <seconds>`, or disable it with `--no-heartbeat`.

The scheduler accepts an injectable clock for deterministic tests. Heartbeat construction is benchmarked in the test suite against an agreed average overhead ceiling of 0.25 ms for a representative 20-task snapshot.

### Repeated paired runs

Use `--run-profile fast|standard|release` to collect exactly 1, 3, or 5 current/baseline pairs per evaluation. Pair order and seeds are deterministic and counterbalanced; each pair records the shared model, declared tools, fixture hash, timeout, and turn budget. Repeated runs are stored under each configuration as `run-N`. Grade every scheduled run before aggregation. Benchmark output includes paired 95% confidence intervals for quality, latency, actual turns, tokens, and cost. The one-pair `fast` profile is diagnostic only and can never establish stable improvement.

### Resource telemetry

Agent evaluation timing artifacts use nullable metrics with explicit availability reasons and metric sources. Missing or malformed duration, token, turn, and cost observations remain `null`; output character counts are never treated as tokens. Benchmark summaries report per-metric sample counts and coverage, and block efficiency/cost conclusions below `--minimum-coverage` (default `0.8`). Legacy timing artifacts remain readable and are normalized locally by agent-creator.
