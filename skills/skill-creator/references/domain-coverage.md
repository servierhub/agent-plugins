# Rule-rich domain coverage

Read this reference when a Skill handles a domain with many deterministic rules, versions, formats, directional semantics, states, or edge cases. Do not apply it to simple or primarily subjective Skills.

## Detect a rule-rich domain

Treat the domain as rule-rich when several of these are true:

- correctness depends on a specification, protocol, policy, schema, or compatibility table;
- the same concept behaves differently by direction, lifecycle state, format, or version;
- many cases are objectively classifiable;
- missing one rule can produce a false safety or compatibility claim;
- users expect repeatable automation rather than a heuristic review;
- the task has a meaningful set of edge cases and unsupported constructs.

Examples include API compatibility, database migrations, security policy, package manifests, document formats, compliance rules, and protocol conversion.

## Coverage before compression

For a rule-rich domain, optimize for the smallest **sufficient coverage**, not the smallest artifact. Before drafting scripts or instructions, inventory the main rule space:

| Dimension | Questions |
|---|---|
| Entities and operations | What objects and operations can change? |
| Direction | Does request/response, input/output, producer/consumer, or source/target change the rule? |
| Format and version | Which formats and versions are in scope? Which are explicitly unsupported? |
| State and lifecycle | Which states or transitions affect correctness? |
| Constraints | Which additions, removals, tightenings, or relaxations matter? |
| Risk | Which cases must fail closed or require approval? |
| Failure modes | What can be missing, malformed, ambiguous, stale, or unavailable? |

Record the inventory as a compact matrix. Mark each cell as:

- `automated` — handled deterministically;
- `semantic` — requires contextual agent or human judgment;
- `unsupported` — deliberately out of scope and reported explicitly;
- `not-applicable` — irrelevant for this Skill.

## Breadth-first delivery under an action budget

A coverage matrix must not cause the agent to exhaust its action budget before producing a usable Skill. Build breadth-first:

1. declare scope, unsupported areas, and the coverage matrix;
2. create the minimal complete artifact set: `SKILL.md`, directly required references, script entrypoints, and durable eval scenarios;
3. make one representative end-to-end path executable and verified;
4. implement the highest-risk or highest-frequency rule cells;
5. expand lower-priority cells only while enough budget remains to rerun validation and leave every artifact coherent.

Prioritize **complete and honest** over broad but unfinished. If the full in-scope matrix cannot be implemented in the current task, mark remaining cells `semantic` or `unsupported`, preserve working artifacts, and report the exact follow-up. Never omit the eval set or final validation in order to add another low-priority rule.

Use a two-tier scope:

- **required coverage:** cells needed for the Skill's central claim and safety;
- **extended coverage:** valuable variants that may be deferred without making the central claim false.

## Automation boundary

Automate a rule when its inputs and verdict can be defined reliably. Keep a semantic residual only for genuinely contextual decisions.

For every deterministic rule, define:

- canonical inputs;
- direction and preconditions;
- verdict or classification;
- concrete evidence;
- remediation or next action;
- failure behavior;
- at least one positive and one boundary test.

Do not use a broad “semantic review” step as a substitute for deterministic rules that can be encoded safely.

## Architecture

Keep the common selection and workflow in `SKILL.md`. Put the rule matrix and interpretation guidance in direct references. Bundle scripts when rules are repeated, deterministic, or safety-sensitive. Keep unsupported and semantic cases explicit in the report contract.

A useful shape is:

```text
rule-rich-skill/
├── SKILL.md
├── references/
│   ├── rule-matrix.md
│   └── report-contract.md
├── scripts/
│   └── analyze.py
└── evals/
    └── evals.json
```

Do not create these files when the domain does not justify them.

## Evaluation matrix

Map every in-scope dimension/value to at least one scenario through `coverage_tags`. Include:

- a normal case;
- a boundary in each important direction;
- supported format/version variants;
- a mixed-change or interaction case;
- malformed or unavailable input;
- unsupported constructs and honest limitation reporting;
- non-regression cases for behavior already handled correctly.

A scenario can cover several tags, but assertions remain atomic.

## Sufficiency review

Before calling the Skill complete, ask:

1. Does automation cover the main deterministic rule space rather than one illustrative case?
2. Are format, version, direction, state, and failure variations represented where relevant?
3. Is every omitted category explicitly semantic, unsupported, or out of scope?
4. Do evaluations exercise each in-scope coverage tag?
5. Is the semantic pass limited to ambiguity that cannot be deterministically resolved?
6. Were the durable eval set and final validation completed before extended low-priority rules?
7. Does the implementation remain proportionate to expected use, risk, and the available action budget?

Stop expanding when all important cells have evidence and additional rules would be speculative, low-value, or outside the declared scope.
