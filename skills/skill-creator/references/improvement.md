# Evidence-driven Skill improvement

Read this reference after behavioral evaluation, trigger evaluation, human review, or observed real usage.

## 1. Validate evidence first

Confirm that paired runs used equivalent models, tools, inputs, budgets, and capabilities. Ensure current runs could load conditional references. Distinguish Skill failures from scenario, runner, or grader defects.

## 2. Classify each failure

| Symptom | Pattern or component to inspect |
|---|---|
| Missed trigger | Description intent and activation terms |
| False trigger | Sibling boundary and description precision |
| Missing step | Sequential workflow or checklist |
| Wrong branch | Conditional workflow |
| Required reference ignored | Link wording and progressive disclosure |
| Irrelevant references loaded | Domain organization and branch conditions |
| Error found too late | Feedback loop |
| Unsafe or incorrect mutation | Plan-validate-execute |
| Repeated generated helper code | Utility script |
| Layout or rendering defect | Visual analysis |
| Unstable output structure | Template or examples |
| Confusion among tools | Default plus conditional escape hatch |
| Missing runtime capability | Dependencies, compatibility, or MCP guidance |

Run:

```bash
node dist/scripts/cli.js analyze <evaluation-workspace> \
  --skill-path <skill-directory> \
  --format json
```

## 3. Choose the smallest correction

- Change metadata only for selection failures.
- Reorder or foreground existing content before adding prose.
- Move conditional depth into a direct reference.
- Add a script for deterministic repeated work.
- Add validation when a failure is mechanically detectable.
- Tighten freedom only where risk requires it.
- Improve the scenario when the assertion is weak or coupled to an implementation detail.

## 4. Avoid overfitting

Generalize from the failure category, not the exact prompt. Preserve useful behavior, add a regression case for the discovered risk, and do not copy grader language into the Skill.

## 5. Rerun

- Create a new iteration workspace.
- Keep the frozen baseline appropriate to the claim.
- Rerun the original scenarios plus the new regression case.
- Compare behavior, trigger metrics, navigation, time, and tokens.
- Generate a new viewer with the previous iteration attached.
- Require human review before release.
