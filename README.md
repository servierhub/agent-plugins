[![Servier Powered](https://raw.githubusercontent.com/servierhub/.github/main/badges/powered.svg)](https://servier.com/en/)

# Agent Plugins

Open-format-first creators that help Goose **create, evaluate, validate, and package** Agent Skills, custom agents, hooks, and complete plugins.

## Contents

- [Start here](#start-here)
- [Choose the right creator](#choose-the-right-creator)
- [Usage examples](#usage-examples)
- [Installation options](#installation-options)
- [Formats and compatibility](#formats-and-compatibility)
- [Validation and evaluation](#validation-and-evaluation)
- [Contributing and roadmap](#contributing-and-roadmap)

## Start here

### 1. Check the requirements

You need:

- [Goose](https://block.github.io/goose/) with a configured model provider;
- Node.js 22 or later.

Released archives already contain compiled scripts and runtime dependencies. As an end user, **do not run `npm install`**.

### 2. Install the complete plugin

```bash
goose plugin install --auto-update https://github.com/bioinfornatics/agent-plugins.git
```

Omit `--auto-update` if you want to control upgrades manually:

```bash
goose plugin install https://github.com/bioinfornatics/agent-plugins.git
```

### 3. Ask Goose for one concrete outcome

Choose a creator from the table below, then state the artifact, target path, constraints, and expected result. For example:

> Use `agent-plugins:skill-creator` to create a Skill in `.agents/skills/release-notes` that drafts release notes from a Git diff. Validate and package it when complete.

Start with the common workflow. Read the format and conformance sections only when you need to make a compatibility or release decision.

## Choose the right creator

| I want to… | Use | Primary target |
|---|---|---|
| Create, improve, or evaluate one Agent Skill | `agent-plugins:skill-creator` | `.agents/skills/` |
| Create or evaluate a custom agent | `agent-plugins:agent-creator` | `.agents/agents/` |
| Create or validate a Goose hook | `agent-plugins:hook-creator` | Goose extension data in a plugin |
| Create, migrate, validate, evaluate, or release a complete plugin | `agent-plugins:plugin-creator` | `.agents/plugins/` |

A productive first run follows this order:

1. **Choose one deliverable.** Avoid asking for a Skill, agent, hook, and plugin at once.
2. **Provide a real target.** Name the destination path and the user outcome.
3. **State constraints.** Include supported runtimes, formats, safety requirements, and examples.
4. **Review the proposed files and diagnostics.** Resolve errors rather than bypassing gates.
5. **Evaluate behavior before release.** Static validation alone does not prove that an agent produces useful results.

## Usage examples

### Create a Skill

> Use `agent-plugins:skill-creator` to create `.agents/skills/api-review`. It should review an OpenAPI diff for breaking changes and produce a concise Markdown report. Include realistic evaluations, run the available validation, and tell me what evidence remains blocked.

### Improve an existing custom agent

> Use `agent-plugins:agent-creator` to evaluate `.agents/agents/security-reviewer.md` against its current baseline, improve only evidence-backed weaknesses, and report the benchmark delta.

### Add a Goose hook

> Use `agent-plugins:hook-creator` to add a safe `PostToolUse` hook to `./my-plugin`. The hook must invoke a plugin-relative script and must not write outside plugin data.

A hook belongs to an existing plugin. If the target has no `plugin.json`, create the plugin boundary with `agent-plugins:plugin-creator` first.

### Validate or release a plugin

> Use `agent-plugins:plugin-creator` to validate `./my-plugin` in strict-authoring mode, fix actionable errors, run applicable evaluations, and prepare a release only if every required gate has evidence.

For direct CLI validation, run from the installed `plugin-creator` directory:

```bash
node dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
node dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
```

## Installation options

### Complete plugin — recommended

Install the complete distribution when you want qualified creator names, coordinated routing, and automatic updates:

```bash
goose plugin install --auto-update https://github.com/bioinfornatics/agent-plugins.git
```

### One standalone Skill

Each directory under `skills/` is independently installable:

```bash
mkdir -p ~/.agents/skills
cp -R skills/skill-creator ~/.agents/skills/skill-creator
```

Standalone copies use their plain names, such as `skill-creator`, and never reference runtime files outside their own directory.

## Formats and compatibility

Documentation in this repository uses **Markdown (`.md`)**, GitHub's native and most interoperable choice for READMEs, Agent Skills, and contributor documentation. AsciiDoc would add a second authoring format without improving this project's current workflows. Deep or conditional details live in linked Markdown references so the README remains task-oriented.

### Portable core versus Goose extensions

Published **Agent Plugins 1.0.0** is the only active portable target:

```text
my-plugin/
├── plugin.json                     # required
├── skills/review/SKILL.md          # optional portable Skills
└── mcp.json                        # optional portable MCP configuration
```

`plugin.json` must declare the canonical 1.0.0 schema. `skills/` and root `mcp.json` are the fixed portable component locations. Root `.mcp.json` and inline `plugin.json.mcpServers` are legacy Goose inputs, not portable alternatives.

The vendored Agent Plugins **1.1.0** snapshot is an inactive Working Draft for analysis only. It is not a supported generation or validation target, even though its current schemas resemble 1.0.0.

Hooks are outside the portable core. New Goose hook packages use this distributor-owned, client-specific envelope:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Reusable review workflows",
  "extensions": {
    "io.github.bioinfornatics.agent-plugins.goose": {
      "version": 1,
      "hooks": "extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json"
    }
  }
}
```

The canonical hook document is `extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json`. Root `hooks/hooks.json` is legacy Goose compatibility input. Never ship both. The namespace is this distribution's Goose adapter contract, not an assertion of upstream Goose ratification.

See [portable conformance](skills/plugin-creator/references/portable-conformance.md) and the [Goose format reference](skills/plugin-creator/references/goose-plugin-format.md).

### Creator routing

`plugin-creator` owns the package boundary and routes specialist work:

```text
plugin-creator
  ├─ skill-creator  → bundled Skills under <plugin>/skills/
  ├─ hook-creator   → Goose hook document and command scripts
  └─ agent-creator  → only for a separately supported custom-agent target
```

Current Goose custom agents are discovered from `.agents/agents/`; do not assume a plugin `agents/` directory is portable or installed automatically. Skill frontmatter names remain unqualified; Goose may expose plugin-qualified names after installation.

## Validation and evaluation

### Validation profiles

- **`portable-load`** models Agent Plugins 1.0.0 loading, including permitted manifest exceptions and isolation of invalid or unsupported components.
- **`strict-authoring`** is the default creator policy. It combines schema, semantic, Goose operational, and safety checks and rejects authoring hazards a loader may ignore or isolate.
- **Release** additionally requires applicable tests, behavioral receipts, archive identity, and human review. Portable-load success alone is never release approval.

### Evaluation, not just validation

Static validation checks form; behavioral evaluation checks outcomes:

```text
scenarios → paired isolated runs → grading → benchmark → HTML review → release gates
```

Official evaluations preserve traceable outputs, grading, timing, benchmarks, review artifacts, and receipts. Final states are `pass`, `fail`, `blocked`, and `na`; missing evidence never weakens a release gate. Missing evaluation capabilities are reported as `evaluation: blocked`.

## Contributing and roadmap

This README prioritizes the shortest path to a successful first use. Component-specific details remain beside each creator:

- [Skill Creator](skills/skill-creator/README.md)
- [Agent Creator](skills/agent-creator/README.md)
- [Hook Creator](skills/hook-creator/README.md)
- [Plugin Creator](skills/plugin-creator/README.md)

Track planned work and feature requests in [GitHub Issues](https://github.com/bioinfornatics/agent-plugins/issues) rather than maintaining a duplicate TODO list in this README.

To validate a contribution:

```bash
cd skills/agent-creator && npm install && npm run build && npm test
cd skills/hook-creator && npm install && npm run build && npm test
cd skills/plugin-creator && npm install && npm run build && npm test
cd skills/skill-creator && npm install && npm run build && npm test
```

At repository root, `npm run prepare:offline && npm test && npm run test:offline` verifies the complete offline distribution.

## Project status and sources

- Servier Open Source Hub showcase: <https://github.com/servierhub/agent-plugins>
- Canonical development repository: <https://github.com/bioinfornatics/agent-plugins>
- Agent Skills specification: <https://agentskills.io/specification>
- Goose hooks: <https://goose-docs.ai/docs/guides/context-engineering/hooks>
- Portable plugins: the published Agent Plugins 1.0.0 schemas vendored under `skills/plugin-creator/references/agent-plugins-1.0.0/`
- Distribution version: [`plugin.json`](plugin.json)
- License: [CeCILL-C](LICENSE)
