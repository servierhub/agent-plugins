# Behavioral evaluation workflow

Read this reference only when the user asks to evaluate, test, benchmark, compare, or prove improvement of a Skill.

## Completion contract

A complete evaluation contains:

- an eval set and one `eval_metadata.json` per case;
- paired `with_skill` and `old_skill` or `without_skill` runs;
- saved outputs or transcripts for every run;
- `timing.json` for every run, using null values with a reason when metrics are unavailable;
- `grading.json` for every run, with exactly `text`, `passed`, and `evidence` in each expectation;
- `benchmark.json` and `benchmark.md` produced by `aggregate_benchmark.js`;
- a review artifact produced by `eval-viewer/generate_review.js`;
- analyst findings and an accept, revise, or blocked decision.

Trigger-description evaluation (`run_eval.js` or `run_loop.js`) does not replace behavioral evaluation.

## Execution order

### 1. Freeze cases and baseline

Create realistic cases in `evals/evals.json`. For an improved Skill, snapshot the old Skill before editing. For a new Skill, use a no-Skill baseline.

For each case create:

```text
<workspace>/iteration-N/eval-<id>/
├── eval_metadata.json
├── with_skill/
│   └── outputs/
└── old_skill/ or without_skill/
    └── outputs/
```

Metadata format:

```json
{
  "eval_id": 1,
  "eval_name": "descriptive-name",
  "prompt": "realistic user request",
  "assertions": []
}
```

### 2. Launch paired runs together

Launch the current and baseline run for every case in the same turn. Keep inputs and requested outputs identical. Save complete outputs and transcripts in their assigned run directories.

The Goose reference adapter can execute scaffolded pairs directly:

```bash
node dist/scripts/cli.js full-eval <skill-directory> --workspace <workspace> \
  --execute --model <model> [--baseline old_skill --baseline-skill <snapshot>]
```

A successful one-command run intentionally stops review-ready when no human decision was supplied; that blocked checkpoint is not an evaluation failure. Machine output includes ordered executable recovery commands, and `--resume` begins at the first incomplete phase.

Each run uses `goose run --no-session` in a fresh temporary workspace. The adapter enforces the scenario model, declared tools, timeout, and `budget.max_turns` (default 40 when omitted). It records the host version, exit reason, duration, reported tokens or an explicit unavailability reason, transcript, output, grading, and bound execution evidence. A missing or failing host returns a typed blocked/failure receipt; omit `--execute` to preserve the manual evidence workflow.

### 3. Define assertions while runs execute

Use objective, discriminating assertions. Prefer programmatic checks for deterministic outputs and qualitative review for subjective quality. Update both the eval set and metadata.

### 4. Capture timing

Record reported duration and token data immediately. If the backend does not expose a metric, write null plus an `unavailable_reason`; never invent it.

### 5. Grade every run

Read `../agents/grader.md`. Evaluate each assertion against the actual outputs and write:

```json
{
  "expectations": [
    {"text": "...", "passed": true, "evidence": "..."}
  ],
  "summary": {"pass_rate": 1}
}
```

### 6. Aggregate and analyze

```bash
node dist/scripts/aggregate_benchmark.js <workspace>/iteration-N --skill-name <name>
```

Read `../agents/analyzer.md` and identify weak assertions, variance, regressions, and time/token tradeoffs.

### 7. Generate the review artifact

Interactive:

```bash
node dist/eval-viewer/generate_review.js <workspace>/iteration-N \
  --skill-name <name> \
  --benchmark <workspace>/iteration-N/benchmark.json
```

Headless:

```bash
node dist/eval-viewer/generate_review.js <workspace>/iteration-N \
  --skill-name <name> \
  --benchmark <workspace>/iteration-N/benchmark.json \
  --static <workspace>/iteration-N/review.html
```

For later iterations, add `--previous-workspace`.

### 8. Validate and verify

```bash
node dist/scripts/validate_evaluation_receipt.js <workspace>/iteration-N
node dist/scripts/cli.js verify <skill-directory> --evaluation <workspace>/iteration-N [options]
```

A complete receipt is not necessarily a passing gate. Report `pass`, `fail`, `blocked`, and `na` exactly.

## Iteration

After human review, read `feedback.json`, improve the Skill, rerun all paired cases in a new iteration, and compare against the previous workspace. Stop when the user accepts the result, feedback is empty, or further iterations produce no meaningful improvement.

For rigorous A/B comparison, read `../agents/comparator.md` and keep variant identity hidden from the judge.

### Repeated counterbalanced pairs

`full-eval --run-profile fast|standard|release` requests exactly 1, 3, or 5 paired repetitions per scenario. Standard and release plans must declare a validated root `aggregate_budget` with positive `max_runs`, `max_turns`, and `timeout_seconds` large enough for every current/baseline run. An insufficient budget fails before run scaffolding; an interrupted or failed schedule returns typed `incomplete-paired-runs` data rather than silently aggregating a prefix.

Each scenario receives deterministic per-pair seeds and alternating current-first/baseline-first order. Both members retain pair index, seed, order, order position, model, ordered tools, fixture snapshot hash, timeout, turns, and source provenance. Change any evaluation input or profile to invalidate and regenerate the schedule.

Aggregation reports sample count and mean for available observations. Sample standard deviation and a 95% Student-t confidence interval are emitted only for two or more observations; a single observation uses null inferential fields. Stable improvement requires the paired-difference confidence interval to be wholly above zero. Release evidence must never describe one stochastic pair as stable improvement.
