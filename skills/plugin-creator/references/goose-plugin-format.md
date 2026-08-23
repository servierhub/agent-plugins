# Goose Plugin Format Reference

Use this reference when creating, porting, auditing, or packaging an Agent Plugin for Goose.

## Contract status

| Contract | Status | Meaning |
|---|---|---|
| Agent Plugins 1.0.0 | Published; active | The only portable generation and validation target |
| Agent Plugins 1.1.0 snapshot | Working Draft; inactive | Analysis only; its schema identifiers are unsupported |
| `io.github.block.goose` | Repository-defined Goose adapter | Client behavior transported by 1.0.0 extensions; not portable semantics or claimed upstream ratification |

Never infer 1.1.0 support from schema similarity or semantic-version proximity.

## Published portable core

```text
my-plugin/
├── plugin.json                    # required
├── skills/review/SKILL.md         # optional
└── mcp.json                       # optional
```

Agent Plugins 1.0.0 defines no portable hooks, agents, commands, recipes, or alternate MCP locations. The manifest cannot redirect fixed discovery or contain inline components.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Reusable workflows"
}
```

The schema requires `$schema` and `name`; strict authoring also expects useful release metadata.

## Skills

Discover only immediate children of `skills/` containing a regular file named exactly `SKILL.md`. Do not recursively discover deeper descendants. Keep references and scripts inside that Skill directory. Frontmatter names remain unqualified even when Goose exposes a plugin-qualified load name.

## Portable MCP

Portable MCP exists only at root `mcp.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "database": {
      "type": "stdio",
      "command": "node",
      "args": ["server.js"],
      "cwd": "./data"
    },
    "remote": {
      "type": "streamable-http",
      "url": "https://example.test/mcp"
    }
  }
}
```

Manifest and MCP schema versions must match. An empty `mcpServers` object is valid. Entries use an explicit closed `stdio`, `streamable-http`, or legacy HTTP+SSE `sse` variant. Do not package credentials in `env` or `headers`; keep paths contained. A declaration does not sandbox a process.

Root `.mcp.json` and inline `plugin.json.mcpServers` are legacy Goose inputs. Migrate to `mcp.json` only when every server maps safely, and require approval. If portable and legacy forms coexist, or both legacy forms coexist, fail as ambiguous; never merge or choose precedence.

## Goose hooks

Hooks are host-specific and outside portable core. New Goose output uses:

```text
my-plugin/
├── plugin.json
├── skills/review/SKILL.md
├── extensions/
│   └── io.github.block.goose/
│       └── hooks.json
└── scripts/hook-command.sh
```

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "extensions": {
    "io.github.block.goose": {
      "version": 1,
      "hooks": "extensions/io.github.block.goose/hooks.json"
    }
  }
}
```

Agent Plugins permits client-specific objects under `extensions` but assigns no semantics to their children. This repository's Goose adapter defines `version: 1` and `hooks`. Other hosts must not execute or claim validation of them.

Root `hooks/hooks.json` is legacy Goose compatibility input. An importer may translate it after host validation. New output uses the namespaced form. If both exist, fail rather than merge or risk double execution. Hook commands are executable code; use `${PLUGIN_ROOT}` for package-relative paths and review blocking behavior. See [goose-hooks.md](goose-hooks.md).

## Runtime dependencies

Document required Goose capabilities, MCP support, external CLIs, APIs, and environment variables separately from package contents. Never encode secrets or imply portable metadata installs host capabilities.

## Validation

Run the unified CLI from the installed `plugin-creator` directory:

```bash
node dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
node dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
```

`portable-load` models normative 1.0.0 loading and isolation. `strict-authoring` is the default and combines schema with Goose operational and authoring-policy checks. See [portable-conformance.md](portable-conformance.md).

For direct document-level schema diagnostics only:

```bash
node dist/scripts/validate_agent_plugin_schema.js <file-or-directory> \
  --type auto --mode strict-authoring --format json
```

This lower-level validator discovers only `plugin.json` and portable `mcp.json`; it does not treat legacy MCP forms as portable. Prefer unified validation for normal authoring.

## Installation and scope

```bash
goose plugin install https://github.com/example/my-goose-plugin.git
goose plugin install --auto-update https://github.com/example/my-goose-plugin.git
goose plugin update my-plugin
```

Installed plugins live under `~/.agents/plugins/<name>/`; project-local plugins may live under `<project>/.agents/plugins/<name>/`. Standalone Skills in `.agents/skills/` and custom agents in `.agents/agents/` are separate surfaces. A bundled `agents/` directory is not portable or assumed auto-installed.

## Porting map

| Source | Target |
|---|---|
| Agent Skill | `skills/<name>/SKILL.md` |
| portable MCP | root `mcp.json` with explicit transport |
| `.mcp.json` or inline MCP | reviewed migration to `mcp.json` |
| Goose hook | namespaced manifest envelope and canonical hook path |
| root `hooks/hooks.json` | legacy input; validate and migrate, never co-ship |
| custom agent | separate Goose custom-agent installation when requested |
| source-specific UI/tool | adapt or replace; do not claim portability |

Always distinguish portable file compatibility from target-host runtime compatibility.
