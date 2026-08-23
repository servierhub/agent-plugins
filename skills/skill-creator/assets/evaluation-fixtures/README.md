# Evaluation fixtures

These immutable examples support `skill-creator` behavioral evaluations. Copy a fixture to an isolated sandbox before modifying or executing it.

| Fixture | Intended property |
|---|---|
| `frontmatter-invalid/` | Fails because `permissionMode` is not valid Agent Skills frontmatter. |
| `frontmatter-name-mismatch/` | Fails because frontmatter `name` does not match the directory. |
| `frontmatter-missing-description/` | Fails because required `description` metadata is absent. |
| `frontmatter-malformed-yaml/` | Fails because the YAML string is not closed. |
| `skill-comparison/baseline/invoice-normalizer/` | Valid but underspecified baseline Skill. |
| `skill-comparison/current/invoice-normalizer/` | Valid improved Skill with activation metadata, progressive disclosure, deterministic validation, and durable evals. |
| `partial-evaluation-workspace/` | Contains completed current evidence but no baseline, benchmark, or viewer; evaluation must remain blocked while preserving evidence. |
| `completed-evaluation-workspace/` | Contains paired outputs, grading, timing, benchmark, and viewer; completion validation must pass. |
