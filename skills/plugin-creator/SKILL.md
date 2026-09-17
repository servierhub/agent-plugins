---
name: plugin-creator
description: Orchestrates complete Open Plugin packages. Use when plugin.json or the whole plugin is the target for creation, validation, migration, evaluation, packaging, or release.
---

# Plugin Creator

Create production-ready Agent Plugins for Goose. Own package architecture, root `plugin.json`, portable MCP declarations, Goose extension integration, whole-package validation, installation, and packaging. Route component content to its specialist.

## Offline runtime

Released distributions include compiled scripts and production dependencies under `vendor/node_modules`. Run utilities from `dist/`; consumers need Node.js but must not run `npm install` or require network access. Report a missing vendored dependency as a packaging defect.

## Format baseline

Read [goose-plugin-format.md](references/goose-plugin-format.md) and [portable-conformance.md](references/portable-conformance.md) before changing a package contract.

- Target published **Agent Plugins 1.0.0**: root `plugin.json`, optional `skills/`, and optional root `mcp.json`.
- Emit canonical 1.0.0 schema identifiers in `plugin.json` and `mcp.json`.
- Treat vendored **1.1.0 as an inactive Working Draft**. Do not generate or validate it as supported based on schema similarity.
- Put new Goose hooks under `plugin.json.extensions["io.github.bioinfornatics.agent-plugins.goose"]`, pointing to `extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json`.
- Treat root `hooks/hooks.json`, root `.mcp.json`, and inline `plugin.json.mcpServers` as legacy Goose inputs. Migrate explicitly; never emit legacy and canonical forms together.

## Specialist routing

| Specialist | Invoke when | Required result |
|---|---|---|
| `agent-plugins:skill-creator` (fallback `skill-creator`) | Any bundled Skill is new or modified | Valid frontmatter, name/path consistency, focused instructions, and requested evaluation evidence |
| `agent-plugins:hook-creator` (fallback `hook-creator`) | Any Goose hook rule or command changes | Hook validation, executable checks, and blocking-behavior review |
| `agent-plugins:agent-creator` (fallback `agent-creator`) | Only for an explicit, separately supported custom-agent target | Valid agent and confirmed project/user installation path |

Current Goose custom agents live under `.agents/agents/`; do not claim a plugin `agents/` directory is portable or auto-installed. Load specialist instructions in the current context when possible. Delegate only disjoint files. If a specialist is unavailable, state the limitation and follow its recorded source rather than inventing a schema.

## Request modes

- **Portable-load audit:** report what a conformant 1.0.0 loader accepts, ignores, or isolates. This is not authoring approval.
- **Strict authoring:** apply schema, semantic, Goose operational, safety, and migration checks. This is the default.
- **Package-only:** run strict validation, create the archive, and verify identity; do not force behavioral evaluation.
- **Whole-plugin evaluation:** evaluate changed components and integration behavior, then aggregate, review, and gate release.
- **Release:** require strict authoring plus applicable tests, receipts, archive checks, and human review.

## Workflow

1. Derive behavior from concrete inputs, outputs, side effects, tools, credentials, and target hosts. Do not repeat questions answered by context.
2. Classify the package as skills-only, MCP, Goose-extension, hybrid, or ported.
3. Inventory portable components separately from Goose-specific and legacy inputs.
4. Route each changed Skill or hook to its specialist before authoring it. For evaluation, do not stop after describing that route: execute or consume the specialist's complete paired evidence and receipt before declaring the plugin evaluation complete.
5. For a new package run:

   ```bash
   node dist/scripts/cli.js init <plugin-directory>
   ```

6. Keep only required resources: root `plugin.json`; `skills/<name>/SKILL.md`; root `mcp.json`; and, only when needed, `extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json` plus command scripts.
7. Document runtime prerequisites and credentials, but never package secrets.
8. For ports, classify each item as `portable`, `adapt`, `replace`, or `unsupported`. Preserve behavior before deleting source metadata.
9. Run both profiles:

   ```bash
   node dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
   node dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
   ```

10. Run specialist validation for changed Skills and hooks. Check paths, environment declarations, `${PLUGIN_ROOT}` references, and executable scripts.
11. Package when requested:

   ```bash
   node dist/scripts/cli.js package <plugin-directory> [output.zip]
   ```

12. Deliver the artifact, architecture, prerequisites, both validation results, migration notes, and install command.

## Portable MCP rules

Use only root `mcp.json`, with canonical 1.0.0 MCP schema and an `mcpServers` object. Servers use explicit closed variants such as `stdio`, `streamable-http`, or legacy HTTP+SSE `sse`. Keep paths contained and do not package credentials in `env` or `headers`.

When `.mcp.json` or inline `plugin.json.mcpServers` exists:

1. identify it as legacy and nonportable;
2. block when multiple MCP sources coexist because precedence is undefined;
3. propose migration only when it maps safely to closed portable variants;
4. require approval before replacing it with `mcp.json`.

## Goose hook rules

Hooks are client behavior, not portable core. New output uses:

```json
{
  "extensions": {
    "io.github.bioinfornatics.agent-plugins.goose": {
      "version": 1,
      "hooks": "extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json"
    }
  }
}
```

This namespace is the distribution's Goose adapter contract, not an upstream-ratified identifier. Validate hooks against the selected Goose source. Use `${PLUGIN_ROOT}` in package-relative command paths. Treat commands as executable code; review blocking events and fail closed on unsupported semantics. Root `hooks/hooks.json` is an input-only migration alias. If both forms exist, stop as ambiguous.

## Behavioral Evaluation Contract

When asked to evaluate, test, benchmark, compare, or prove improvement, execute the official workflow. Freeze baseline provenance and fixtures. Require a complete evaluation receipt for each behaviorally changed Skill and plugin-level integration scenarios. Aggregate the resulting evidence into a combined benchmark and generate a review viewer. Require:

1. paired `with_skill` and `old_skill`/`without_skill` outputs;
2. `grading.json` with `text`, `passed`, and `evidence` for every run;
3. `timing.json`, using null plus a reason when unavailable;
4. typed Skill, agent, hook, and MCP receipts with applicability, current component hashes, and explicit per-component aggregation (see [Typed Component Evidence](references/component-evidence.md));
5. plugin integration scenarios with complete component coverage and evidenced cross-component handoffs;
6. official `benchmark.json` and `benchmark.md`;
7. live or static review output;
8. a final receipt with artifact hashes and human-review status.

Never grade hidden deliverables; add criteria to the next iteration and rerun both variants. If a capability is missing, preserve artifacts and report `evaluation: blocked`. Never substitute an ad-hoc two-agent comparison.

Start with:

```bash
node dist/scripts/cli.js full-eval <plugin-directory> --workspace <plugin-directory>/evaluations/full-eval --dry-run --format json
```

Follow returned commands and receipt paths, then rerun with `--resume`. Before a release claim, run `node dist/scripts/cli.js verify ...` with workflow-provided arguments. Ordered `next_actions` in a blocked result are authoritative.

## Quality bar

A deliverable is ready only when the 1.0.0 manifest is valid; portable components use fixed locations; Skills are useful and valid; referenced files exist and remain contained; Goose behavior is namespaced and host-validated; legacy conflicts are resolved; prerequisites are documented; no secrets are packaged; strict validation succeeds; and requested evaluation, packaging, and release gates pass.

## Utilities

- `dist/scripts/cli.js`: unified `init`, `validate`, `verify`, `package`, and `full-eval` interface.
- `references/goose-plugin-format.md`: layouts, schemas, Goose namespace, and migrations.
- `references/portable-conformance.md`: load, authoring, and release semantics.
- `references/goose-hooks.md`: recorded Goose hook behavior.
- `evals/evals.json` and `assets/evaluation-fixtures/`: official scenarios and fixtures.
