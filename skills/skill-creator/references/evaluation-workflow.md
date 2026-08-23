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

Launch the current and baseline run for every case in the same turn. Keep inputs and requested outputs identical. Save complete outputs or transcripts in their assigned run directories.

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
