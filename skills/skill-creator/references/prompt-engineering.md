# Prompt and context engineering for Agent Skills

Read this reference when authoring or revising instructions for AI agents.

## Skills are context engineering

A Skill has three jobs:

1. **selection:** metadata helps the model decide to load it;
2. **execution:** instructions and resources guide task completion;
3. **verification:** observable checks prevent unsupported success claims.

Optimize all three rather than treating the Skill as one large prompt.

## Useful techniques

### Intent-oriented metadata

Describe the user outcome and activation context. Keep procedures in the body.

### Instruction hierarchy

Order content as objective, conditions, prerequisites, common workflow, branches, constraints, verification, and output contract.

### Imperative, grounded instructions

Use direct verbs and name the source of truth. Prefer “Validate the mapping before modifying the document” over passive suggestions.

### Appropriate degree of freedom

Use heuristics for open work, parameterized patterns for preferred approaches, and exact scripts for fragile operations.

### Conditional prompting

State the branch condition before its instructions. Move substantial branches to directly linked references.

### Coverage before compression

For rule-rich deterministic domains, first map the main rule space across entities, directions, formats, versions, states, constraints, and failure modes. Then compress the instructions through scripts and references. Build breadth-first so the minimal complete Skill, eval set, and validation exist before deep automation. Do not optimize prompt length by silently omitting automatable rules, and do not chase exhaustive implementation until required deliverables are complete. Minimality means no unnecessary context, not incomplete domain behavior.

### Templates and schemas

Use strict templates for machine-consumed outputs and flexible defaults for human reports. Do not impose structure without a consumer need.

### Few-shot examples

Use concrete input/output pairs when format, tone, or edge-case behavior is difficult to describe. Avoid redundant examples and move collections into references.

### Contrastive boundaries

Briefly distinguish the closest competing capability, for example: “Use for one Skill; use plugin-creator for a complete plugin.” Avoid exhaustive negative lists.

### Plan-validate-execute

For batch, destructive, or high-stakes work, externalize a structured plan, validate it, execute only after success, then verify the result.

### Feedback loops

Use `execute → validate → inspect errors → correct → repeat`. Put cheap validation close to the action that can fail.

### Tool affordance

State which tool or script to use, when, with which input, expected output, and failure behavior. Distinguish reading a script from executing it.

### Verifiable reasoning artifacts

Do not request private chain-of-thought. Request plans, mappings, checklists, diffs, validation reports, citations, and evidence that can be inspected.

### Fail-closed claims

Do not report success unless required validators and evidence complete. Missing capability yields `blocked`, not an invented pass.

### Idempotence and resume

Preserve completed artifacts, resume at the first incomplete phase, avoid repeating expensive model calls, and return exact next actions.

## Review checklist

- Every instruction contributes to selection, execution, or verification.
- Rule-rich domains cover their important deterministic dimensions before prompt compression.
- The model is not taught generic concepts it already knows.
- Important constraints are prominent and justified.
- Branches have explicit conditions.
- Outputs are grounded in artifacts and tools.
- No instruction asks for hidden reasoning.
- Repeated deterministic work is delegated to scripts.
- Success claims are tied to evidence.
