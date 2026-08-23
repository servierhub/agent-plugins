# Evaluation scenario design

Read this reference before creating or changing `evals/evals.json`.

## Canonical scenario format

Use `assertions` in scenario and metadata files. Reserve `expectations` for graded results in `grading.json`.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "name": "conditional-provider-routing",
      "prompt": "Update this deployment Skill so AWS and Azure details load only when relevant.",
      "expected_output": "A valid Skill with a shared workflow and provider-specific references.",
      "files": ["evals/files/deployment-skill/"],
      "capabilities": {
        "filesystem": true,
        "agent_runner": true,
        "browser": false,
        "network": false,
        "tools": ["developer"]
      },
      "assertions": [
        "SKILL.md contains the shared workflow and provider-selection decision",
        "AWS and Azure details are stored in separate directly linked references",
        "Every linked resource exists"
      ],
      "navigation_expectations": {
        "must_read": ["SKILL.md"],
        "read_when_relevant": ["references/aws.md", "references/azure.md"],
        "must_not_read": []
      },
      "coverage_tags": ["provider:aws", "provider:azure", "risk:destructive"]
    }
  ]
}
```

## Scenario quality checklist

### Realistic

- Resembles a request a real user would send.
- Includes only context the user would naturally know.
- Names concrete inputs, constraints, and desired outcomes.
- Does not leak the assertion wording into the prompt.

### Focused

- Tests one coherent capability or risk.
- May have several atomic assertions, but not unrelated goals.
- Uses a descriptive `name` identifying the capability under test.

### Discriminating

- Exposes a gap that the Skill should solve.
- Is difficult enough that current and baseline outputs can differ.
- Includes boundaries, conditional paths, error cases, or domain knowledge rather than trivial compliance.
- Preserves scenarios the baseline handles correctly for non-regression.

### Verifiable

- Assertions describe observable outcomes.
- Each assertion is atomic and can cite specific evidence.
- Deterministic assertions can be checked by a script.
- Subjective quality is assigned to human or blind review.
- Assertions verify outcomes, not private reasoning.

### Domain-coverage-aware

For a rule-rich deterministic Skill, derive scenarios from its coverage matrix before deepening extended automation. Add stable `coverage_tags` such as `format:yaml`, `version:openapi-3`, `direction:response`, `change:enum-expanded`, or `failure:external-reference`. Ensure every required in-scope dimension/value appears in at least one scenario and create the durable eval set before implementing lower-priority extended cells. Do not require coverage tags for simple or subjective Skills.

### Capability-aware

Declare filesystem, runner, browser, network, and tool availability. A scenario requiring execution must not be graded as an execution success when its declared runner is unavailable. Missing capability should instead test honest blocking behavior.

### Navigation-aware

For progressive disclosure, specify which resources must always be read, which should be read only under a condition, and which should remain unloaded. Save actual resource access in run evidence when the runtime exposes it.

## Required scenario mix

For a material Skill change, prefer at least:

1. a normal positive case;
2. a difficult boundary or sibling-routing case;
3. a conditional/progressive-disclosure case;
4. a missing-capability or error case;
5. a non-regression case when improving an existing Skill.

## Assertion guidance

Prefer:

```text
Runs the official deterministic Skill validator and reports its result.
```

over implementation coupling such as:

```text
Uses quick_validate.js.
```

Require a specific command only when it is part of the public contract.

## Validate the design

```bash
node dist/scripts/cli.js design-evals <evals.json> --skill-path <skill-directory> --format json
```

Fix error-level findings before behavioral evaluation. Review warnings for weak discrimination, missing capabilities, non-atomic assertions, missing fixtures, absent navigation expectations, and uncovered declared domain dimensions.
