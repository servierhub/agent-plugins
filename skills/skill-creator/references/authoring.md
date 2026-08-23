# Skill creation checklist

Read this reference when creating a new Skill or materially redesigning one.

## 1. Discovery intent

- What does the Skill do?
- What observable outcome does it produce?
- When should the agent activate it?
- Which user intents, artifacts, or domain terms identify those situations?
- Which neighboring Skills are realistic competitors?
- Which near-miss requests should not trigger it?

Write English, third-person metadata. Keep `description` to one or two concise sentences containing capability and activation context, not implementation steps.

## 2. Abstraction choice

Confirm that reusable procedural knowledge is the right abstraction. Use an agent for a role, a hook for event-driven execution, a plugin for a distribution boundary, and a recipe for runtime workflow configuration.

## 3. Instruction design

- Include only knowledge, constraints, and procedures the model cannot reliably infer.
- Order prerequisites before actions and verification after execution.
- Separate mandatory common steps from conditional branches.
- Match freedom to risk: heuristics for open tasks, parameterized patterns for preferred approaches, exact scripts for fragile operations.
- State why a non-obvious constraint matters.
- Provide one reliable default; add an escape hatch only for a materially different condition.

## 4. Pattern selection

Use the pattern catalog linked directly from SKILL.md. For each potentially relevant pattern, decide whether it applies, why, and where. Select the smallest useful set rather than copying every pattern.

## 5. Domain coverage decision

Ask whether correctness depends on a substantial deterministic rule space: specifications, versions, formats, directions, lifecycle states, constraints, or many classifiable edge cases. If yes, read the rule-rich domain coverage reference linked from SKILL.md and create a compact coverage matrix before implementing. Choose the smallest sufficient coverage, not merely the fewest files or lines. Work breadth-first: create the complete minimal artifact set and durable evals before deepening lower-priority automation. If no, keep the Skill lean and do not invent a matrix.

## 6. Progressive disclosure

Keep metadata for selection, `SKILL.md` for the common workflow and branch decisions, and bundled resources for conditional depth:

- `references/` — domain variants, specifications, long examples, conditional procedures;
- `scripts/` — deterministic, repeated, or fragile operations;
- `assets/` — templates and reusable output materials.

Link each resource directly from the condition that requires it. Keep `SKILL.md` at or below 500 lines and add a Contents section to references over 300 lines.

## 7. Verification-first design

Create at least three representative scenarios before extensive documentation. Include a normal case, a difficult boundary or conditional case, and a failure or missing-capability case. Use the evaluation-design reference linked directly from SKILL.md.

## 8. Ready checklist

- Metadata answers what and when.
- Instructions and metadata are English.
- Required steps, branches, and verification are explicit.
- Pattern choices are evidence-based.
- Rule-rich domains inventory their main rule space and test every in-scope coverage dimension.
- Every linked resource exists and stays inside the Skill.
- Paths use forward slashes.
- Dependencies and tool assumptions are explicit.
- `SKILL.md` is at most 500 lines.
- `skill-creator audit` has no error-level findings.
