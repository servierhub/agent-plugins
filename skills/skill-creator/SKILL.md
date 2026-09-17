---
name: skill-creator
description: Authors and manages one isolated Agent Skill or SKILL.md. Use for Skill creation, validation, audit, frontmatter, progressive disclosure, evaluation design, trigger tuning, behavioral comparison, improvement, migration, or standalone .agents/skills packaging. Do not use for whole plugins, hooks, or custom agents.
---

# Skill Creator

Create and improve portable Agent Skills for AI agents. Keep the entrypoint as an intent router and load detailed guidance only for the current responsibility.

## Offline runtime

Released distributions include compiled scripts and production dependencies under `vendor/node_modules`. Run scripts from `dist/`; consumer machines need Node.js.

## Scope

Use this creator for one standalone or bundled Skill. Route whole-plugin work to `agent-plugins:plugin-creator`, hooks to `agent-plugins:hook-creator`, and custom agents to `agent-plugins:agent-creator`. A bundled Skill may be authored here, but plugin architecture, integration, packaging, and installation remain plugin-creator responsibilities.

Write all Agent Skill metadata and instructions in English. Use `AGENTS.md` exclusively for repository instructions.

## Intent routing

Read only the references required by the current request:

| User intent | Required guidance |
|---|---|
| Turn an early idea into a reviewable candidate | [Idea-to-candidate conversation](references/idea-to-candidate.md), then load authoring and evaluation guidance only after confirmation |
| Create or materially redesign a Skill | [Creation checklist](references/authoring.md), [pattern catalog](references/skill-authoring-best-practices.md), and [prompt engineering](references/prompt-engineering.md); also read [rule-rich domain coverage](references/domain-coverage.md) when correctness depends on many deterministic rules |
| Audit quality without changing behavior | [Audit checklist](references/audit.md) |
| Design or review evaluation scenarios | [Evaluation design](references/evaluation-design.md) and [schemas](references/schemas.md) |
| Evaluate behavioral quality or compare versions | [Behavioral evaluation](references/evaluation-workflow.md) |
| Test or optimize activation | [Trigger evaluation](references/trigger-evaluation.md) and [description optimization](references/description-optimization.md) |
| Improve after evaluation or real usage | [Evidence-driven improvement](references/improvement.md) and [pattern catalog](references/skill-authoring-best-practices.md) |
| Package or assess release readiness | [Packaging and release](references/packaging-and-release.md) and [verification gates](references/verification-gates.md) |

Use [schemas](references/schemas.md) whenever reading or writing evaluation artifacts.

## Common invariants

### Discovery metadata

Before writing a description, answer:

1. What does the Skill do?
2. When should the agent activate it?

Write one or two concise, third-person English sentences. Include distinctive user intent and domain terms. Keep procedures, translations, and exhaustive exclusions out of metadata.

### Instruction design

Before writing the body, answer:

1. What instructions must the Skill give?
2. In what order must they run?
3. Are all instructions mandatory?
4. Which instructions are conditional?
5. Does the domain have a substantial deterministic rule space that needs explicit coverage?
6. Does `SKILL.md` exceed or approach 500 lines?

Order prerequisites, actions, and verification. Match instruction freedom to task risk. Explain non-obvious constraints without teaching generic concepts the model already knows.

### Progressive disclosure

Use three levels:

1. metadata for selection;
2. `SKILL.md` for the common workflow, mandatory rules, and branch decisions;
3. bundled `references/`, `scripts/`, and `assets/` loaded or executed only when their condition applies.

Link references directly from `SKILL.md`, name them descriptively, avoid deep chains, and add a Contents section above 300 lines. Keep `SKILL.md` at or below 500 lines.

### Pattern review

At creation and after evaluation, use the [pattern catalog](references/skill-authoring-best-practices.md) to ask for each potentially relevant pattern:

- Is it relevant here?
- Why?
- Where should it be applied?

Choose the smallest structural correction. For rule-rich deterministic domains, choose the smallest sufficient domain coverage rather than the smallest artifact, and deliver breadth-first so evals and final validation exist before extended automation. Do not copy patterns mechanically or overfit an evaluation prompt.

## Idea-to-candidate quick path

For an early idea, start with a plain-language, summary-first conversation. Ask no more than three questions in one turn, preview the full contract, freeze and confirm scenarios, then launch only inside the durable conversation workspace. Novices see no JSON or internal creator names; their final report always names assumptions and risks. Experts may inspect fields and use supported overrides; reject unsupported budgets rather than implying they took effect. The bundled fake adapter reports generation as simulated and validation/evaluation as not run. Every mutation remains isolated and production promotion is a separate decision. See [the detailed flow](references/idea-to-candidate.md).

    node dist/scripts/cli.js candidate <conversation-workspace> --idea "plain-language idea"
    node dist/scripts/cli.js candidate <conversation-workspace>  # resume later

## Commands

```bash
# Agent Skills format conformance
node dist/scripts/cli.js validate <skill-directory>

# Authoring quality and pattern relevance
node dist/scripts/cli.js audit <skill-directory> --format json

# Scenario quality and normalized eval set
node dist/scripts/cli.js design-evals <evals.json> --skill-path <skill-directory> --format json

# Derive elicitation shells, then freeze a provenance-bound scenario plan
node dist/scripts/cli.js freeze-evals <elicitation.json> --draft -o <draft.json>
node dist/scripts/cli.js freeze-evals <completed-draft.json> -o <frozen-plan.json>

# Trigger-description evaluation
node dist/scripts/cli.js trigger-eval --eval-set <trigger-eval.json> --skill-path <skill-directory>

# Resumable paired behavioral evaluation
node dist/scripts/cli.js full-eval <skill-directory> --workspace <iteration-directory> --format json

# Map evaluation failures to authoring patterns
node dist/scripts/cli.js analyze <iteration-directory> --skill-path <skill-directory> --format json

# Release gates and packaging
node dist/scripts/cli.js verify <skill-directory> [options]
node dist/scripts/cli.js package <skill-directory> [output-directory]
```

Use `--help` for command details. JSON automation uses stable envelopes. Exit codes are 0 success, 1 failure, 2 invalid usage, and 3 blocked execution.

## Evaluation execution priority

When the user asks to evaluate, test, benchmark, compare, or prove improvement, execute the evaluation rather than stopping at a plan. Freeze the eval set and baseline, launch equivalent paired runs, grade every run, aggregate, generate the viewer, validate completeness, analyze failures, and run gates.

The current run must have filesystem access to references required by progressive disclosure. Record unavailable capabilities with reasons; never fabricate evidence. A complete receipt is not necessarily a passing result.

Before claiming completion:

```bash
node dist/scripts/validate_evaluation_receipt.js <iteration-workspace>
node dist/scripts/cli.js analyze <iteration-workspace> --skill-path <skill-directory> --format json
node dist/scripts/cli.js verify <skill-directory> --evaluation <iteration-workspace> [options]
```

Report `pass`, `fail`, `blocked`, `complete`, and `na` without weakening them. Human review is never self-approved.

## Runtime fallbacks

If isolated agents are unavailable, run cases sequentially and disclose reduced independence. If no browser is available, generate static review HTML. Unsupported runners fail explicitly. Preserve completed artifacts and resume at the first incomplete phase.
