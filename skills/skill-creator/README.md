# Skill Creator

A vendor-neutral fork of Anthropic's `skill-creator`, adapted to the open [Agent Skills](https://agentskills.io) format and the emerging `.agents/skills` interoperability convention used by Goose and other compatible agents.

## What changed

- Skills live in `.agents/skills/` or `~/.agents/skills/` and retain the standard `SKILL.md` format.
- Repository instructions use `AGENTS.md` exclusively; no host-specific instruction or configuration files are created.
- Scope is restricted to skills under `.agents/skills/`; agent definitions and plugins belong to separate creators.
- Trigger evaluation stages the skill in an isolated `.agents/skills/` project.
- Description optimization calls a configurable non-interactive agent CLI. Goose is the default.
- Viewer and report wording is vendor-neutral.

## Requirements

- Node.js 22+ (scripts are TypeScript compiled to `dist/`, with runtime `node_modules` vendored — no network access needed once installed)
- Goose on `PATH` for trigger evaluation and description optimization, unless another adapter is implemented

## Unified CLI

Build once, then use the unified entrypoint for validation, evaluation, aggregation, review, gate verification, and packaging:

```bash
npm install && npm run build
node dist/scripts/cli.js candidate /path/to/conversation --idea "plain-language idea"
node dist/scripts/cli.js validate /path/to/skill
node dist/scripts/cli.js audit /path/to/skill --format json
node dist/scripts/cli.js design-evals /path/to/skill/evals/evals.json --skill-path /path/to/skill --format json
node dist/scripts/cli.js freeze-evals /path/to/elicitation.json --draft -o /path/to/draft.json
node dist/scripts/cli.js freeze-evals /path/to/completed-draft.json -o /path/to/frozen-plan.json
node dist/scripts/cli.js analyze /path/to/workspace --skill-path /path/to/skill --format json
node dist/scripts/cli.js full-eval /path/to/skill --workspace /path/to/workspace --dry-run
node dist/scripts/cli.js full-eval /path/to/skill --workspace /path/to/workspace --execute --model <model>
node dist/scripts/cli.js full-eval /path/to/skill --workspace /path/to/workspace --resume --human-review pass --tests-status pass
node dist/scripts/cli.js trigger-eval --eval-set /path/to/trigger-evals.json --skill-path /path/to/skill
node dist/scripts/cli.js aggregate /path/to/iteration-workspace
node dist/scripts/cli.js review /path/to/iteration-workspace --static review.html
node dist/scripts/cli.js evidence-loop /path/to/iteration-workspace --skill-path /path/to/skill --loop /path/to/separate-ledger
node dist/scripts/cli.js verify /path/to/skill --evaluation benchmark.json --human-review feedback.json
node dist/scripts/cli.js package /path/to/skill ./dist-out
```

Every subcommand accepts `--help`, `--format text|json`, and `--quiet`. Exit codes are `0` for success, `1` for failure, `2` for invalid usage, and `3` when verification or execution is blocked. The former script entrypoints remain supported for compatibility.

`validate` checks Agent Skills format conformance. `audit` checks repository authoring policy. `design-evals` checks scenario realism, discrimination, capabilities, atomic assertions, fixtures, and navigation expectations. `freeze-evals` derives five elicitation shells per material capability and freezes completed scenarios, deterministic assertions, qualitative review questions, execution context, edits, provenance, and a canonical content hash. `analyze` separates completed, unavailable, and blocked evidence, then maps failed assertions and navigation results to authoring patterns. Packaging blocks error-level audit findings and reports warnings.

`full-eval` uses the fixed phase order `validate → authoring-audit → evaluation-design → scaffold → paired-runs-and-grading → aggregate → static-review → receipt → post-evaluation-pattern-review → verify`. Its result always includes `status`, `phases`, and `next_actions`; `--format json` wraps that result in the unified CLI envelope. `--dry-run` is non-mutating. Normal reruns and `--resume` preserve existing artifacts and continue from the first unmet requirement. Without `--execute`, the orchestrator never invokes an LLM itself: exit code `3` identifies the exact paired output, grading, timing, test, or human-review evidence an agent or person must provide before rerunning. With `--execute`, one invocation advances through paired execution, grading, aggregation, static review, analysis, receipt, and gates. Select `--run-profile fast|standard|release` for exactly 1, 3, or 5 deterministic counterbalanced pairs per scenario; repeated profiles require a sufficient root `aggregate_budget`. When human review is the only decision left, exit code `3` is a non-failing `human-review` checkpoint with ordered `executable_actions`; resume starts at verification without rerunning completed phases. The source-bound `<workspace>/receipt.json` records hashes for the Skill, eval plan, execution evidence, benchmark JSON/Markdown, review, and analysis.

## Idea to candidate

The `candidate` command provides a durable conversational checkpoint from a plain-language idea through routing, bounded elicitation, contract preview, exact-hash contract confirmation, frozen scenario confirmation, and isolated launch. Re-run it with the same workspace in a later session to resume without mutating a read-only view. The default output is a short novice summary, with assumptions and risks always included in the final report; `--mode expert`, `--detail`, and repeatable `--override path=value` expose supported contract controls. Unsupported budget overrides fail explicitly.

Only `--fake` execution is bundled. It writes beneath the realpath-contained conversation workspace, performs no production mutation, reports generation as `simulated`, and reports validation and evaluation as `not-run`. Use it to test the flow, not to approve a candidate.

## Legacy validate and package entrypoints

```bash
node dist/scripts/quick_validate.js /path/to/skill
node dist/scripts/package_skill.js /path/to/skill ./dist-out
```

## Behavioral evaluation

Trigger accuracy answers whether the host selects a Skill; behavioral evaluation
answers whether using it improves the output. For an explicit evaluation request,
the creator builds realistic cases and assertions, runs isolated
`with_skill` and `old_skill`/`without_skill` pairs, grades every run, aggregates
the benchmark, and generates an HTML review artifact. A complete receipt is
required before claiming that the Skill passed or improved.

```text
Load agent-plugins:skill-creator and evaluate /path/to/skill against its previous
version. Create scenarios and assertions, run the paired evaluation, grade and
aggregate it, then generate a static HTML review report.
```

If a required runner, model, grader, or review capability is unavailable, the
result is `evaluation: blocked`, with the missing capability and artifact named.

## Trigger evaluation

```bash
node dist/scripts/run_eval.js \
  --eval-set /path/to/trigger-evals.json \
  --skill-path /path/to/skill \
  --model provider/model-id \
  --verbose
```

The eval set is a JSON array of objects with `query` and `should_trigger` fields.

## Optimize a description

```bash
node dist/scripts/run_loop.js \
  --eval-set /path/to/trigger-evals.json \
  --skill-path /path/to/skill \
  --model provider/model-id \
  --max-iterations 5 \
  --verbose
```

Use `--runner goose` or set `SKILL_CREATOR_RUNNER`. Additional hosts can be added as runner modules; unsupported runners fail explicitly.

## Portable paths and scope

| Asset | Project | User | Managed here? |
|---|---|---|---|
| Skills | `.agents/skills/` | `~/.agents/skills/` | Yes |
| Agents | `.agents/agents/` | `~/.agents/agents/` | No — use an agent creator |
| Plugins | `.agents/plugins/` | `~/.agents/plugins/` | No — use a plugin creator |
| Instructions | `AGENTS.md` | host-dependent | No — repository guidance only |

Only the skill directory and `SKILL.md` contract are covered by the Agent Skills specification. `.agents/skills` is an emerging installation convention. This repository intentionally does not define agent or plugin schemas.

## Attribution and license

This fork derives from Anthropic's skill creator. See `LICENSE.txt` for the upstream license and attribution.