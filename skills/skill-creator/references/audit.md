# Skill audit checklist

Read this reference when reviewing an existing Skill without necessarily changing its behavior.

## Conformance

- `SKILL.md` exists and has valid YAML.
- `name` matches the directory and respects the Agent Skills format.
- `description` is non-empty and within the hard limit.
- Every linked local resource exists and stays inside the Skill directory.
- Paths use portable forward slashes.

Run:

```bash
node dist/scripts/cli.js validate <skill-directory>
node dist/scripts/cli.js audit <skill-directory> --format json
```

## Discovery metadata

- English and third person.
- States what the Skill does.
- States when it activates.
- Uses distinctive intent and domain terms.
- Avoids procedures, translated keyword lists, and exhaustive exclusions.
- Distinguishes only realistic neighboring capabilities.

## Instruction architecture

- The common path is easy to locate.
- Prerequisites, actions, and verification are ordered.
- Mandatory steps and conditional branches are distinguishable.
- Instruction freedom matches task risk.
- Terminology is consistent.
- One default approach is preferred over equivalent choices.
- Current behavior is separated from necessary legacy guidance.

## Progressive disclosure

- `SKILL.md` is at most 500 lines.
- Conditional and domain-specific detail is externalized.
- References are directly linked from `SKILL.md`.
- Long references have a table of contents.
- Frequently needed content is not hidden too deeply.
- Ignored or redundant resources are removed or better signaled.

## Scripts and runtime

- Scripts handle expected errors and justify constants.
- Instructions say whether to run or read each script.
- Inputs, outputs, dependencies, and verification are documented.
- External CLIs, packages, MCP servers, and credentials are checked rather than assumed.

## Evidence classification

Report separately:

- **completed:** validated facts and existing artifacts;
- **unavailable:** evidence the environment cannot produce, with reasons;
- **blocked:** required evidence or decisions preventing completion;
- **warnings:** non-blocking authoring risks;
- **errors:** issues that must prevent packaging or release.
