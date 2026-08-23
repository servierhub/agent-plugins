# Agent Plugins

Open-format-first creators that help Goose **create, evaluate, validate, and package** Agent Skills, custom agents, hooks, and complete plugins.

## Quick start

```bash
goose plugin install https://github.com/bioinfornatics/agent-plugins.git
```

Requirements: Goose, Node.js 22+, and a configured model provider. Released archives contain compiled scripts and runtime dependencies; consumers do not run `npm install`. Missing evaluation capabilities are reported as `evaluation: blocked`.

| Goal | Creator | Primary target |
|---|---|---|
| Create or evaluate one Skill | `agent-plugins:skill-creator` | `.agents/skills/` |
| Create or evaluate a custom agent | `agent-plugins:agent-creator` | `.agents/agents/` |
| Create or validate a Goose hook | `agent-plugins:hook-creator` | Goose extension data in a plugin |
| Create, validate, or release a complete plugin | `agent-plugins:plugin-creator` | `.agents/plugins/` |

## Portable core versus Goose extensions

Published **Agent Plugins 1.0.0** is the only active portable target:

```text
my-plugin/
├── plugin.json                     # required
├── skills/review/SKILL.md          # optional portable Skills
└── mcp.json                        # optional portable MCP configuration
```

`plugin.json` must declare the canonical 1.0.0 schema. `skills/` and root `mcp.json` are the fixed portable component locations. Root `.mcp.json` and inline `plugin.json.mcpServers` are legacy Goose inputs, not portable alternatives.

The vendored Agent Plugins **1.1.0** snapshot is an inactive Working Draft for analysis only. It is not a supported generation or validation target, even though its current schemas resemble 1.0.0.

Hooks are outside the portable core. New Goose hook packages use this repository-defined, client-specific envelope:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Reusable review workflows",
  "extensions": {
    "io.github.block.goose": {
      "version": 1,
      "hooks": "extensions/io.github.block.goose/hooks.json"
    }
  }
}
```

The canonical hook document is `extensions/io.github.block.goose/hooks.json`. Root `hooks/hooks.json` is legacy Goose compatibility input. Never ship both. The namespace is this repository's Goose adapter contract, not an assertion of upstream Goose ratification.

See [portable conformance](skills/plugin-creator/references/portable-conformance.md) and the [Goose format reference](skills/plugin-creator/references/goose-plugin-format.md).

## Validation profiles

Run from the installed `plugin-creator` directory:

```bash
node dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
node dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
```

- **`portable-load`** models Agent Plugins 1.0.0 loading, including permitted manifest exceptions and isolation of invalid or unsupported components.
- **`strict-authoring`** is the default creator policy. It combines schema and Goose operational checks and rejects authoring hazards a loader may ignore or isolate.
- **Release** additionally requires applicable tests, behavioral receipts, archive identity, and human review. Portable-load success alone is never release approval.

## Evaluation, not just validation

Static validation checks form; behavioral evaluation checks outcomes:

```text
scenarios → paired isolated runs → grading → benchmark → HTML review → release gates
```

Official evaluations preserve traceable outputs, grading, timing, benchmarks, review artifacts, and receipts. Final states are `pass`, `fail`, `blocked`, and `na`; missing evidence never weakens a release gate.

## Creator routing

`plugin-creator` owns the package boundary and routes specialist work:

```text
plugin-creator
  ├─ skill-creator  → bundled Skills under <plugin>/skills/
  ├─ hook-creator   → Goose hook document and command scripts
  └─ agent-creator  → only for a separately supported custom-agent target
```

Current Goose custom agents are discovered from `.agents/agents/`; do not assume a plugin `agents/` directory is portable or installed automatically. Skill frontmatter names remain unqualified; Goose may expose plugin-qualified names after installation.

## Installation options

```bash
goose plugin install --auto-update https://github.com/bioinfornatics/agent-plugins.git
```

Each directory under `skills/` is independently installable:

```bash
mkdir -p ~/.agents/skills
cp -R skills/skill-creator ~/.agents/skills/skill-creator
```

Standalone copies use their plain names and never reference runtime files outside their own directory.

## Contributor guide

```bash
cd skills/agent-creator && npm install && npm run build && npm test
cd skills/hook-creator && npm install && npm run build && npm test
cd skills/plugin-creator && npm install && npm run build && npm test
cd skills/skill-creator && npm install && npm run build && npm test
```

At repository root, `npm run prepare:offline && npm test && npm run test:offline` verifies the complete offline distribution.

## Sources and status

- Agent Skills: <https://agentskills.io/specification>
- Goose hooks: <https://goose-docs.ai/docs/guides/context-engineering/hooks>
- Portable plugins: the published Agent Plugins 1.0.0 schemas vendored under `skills/plugin-creator/references/agent-plugins-1.0.0/`
- Distribution version: [`plugin.json`](plugin.json)
- License: [CeCILL-C](LICENSE)
