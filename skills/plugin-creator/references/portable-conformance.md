# Portable Conformance and Release Policy

Published Agent Plugins **1.0.0** is the sole active portable target. The vendored **1.1.0 Working Draft** is analysis evidence but inactive; schema similarity does not imply compatibility.

## Three decisions

| Decision | Question | Outcome |
|---|---|---|
| `portable-load` | What can a conformant 1.0.0 client load, ignore, or isolate? | `accepted`, `partial`, `rejected`, or `unsupported` with scoped diagnostics |
| `strict-authoring` | Should this creator accept the package for Goose? | success or failure after schema, semantic, operational, safety, and migration checks |
| release | May this exact artifact ship? | pass, fail, or blocked after strict validation, tests, evidence, identity, and review |

Portable-load success is not release approval.

## Portable-load

The portable core is root `plugin.json`, optional `skills/`, and optional root `mcp.json`. Fixed locations cannot be overridden or supplemented inline.

- A missing, unsupported, unreadable, or fatally invalid manifest rejects the plugin.
- Unknown top-level manifest fields are reported and ignored.
- A non-object `extensions` value is reported and ignored.
- Unknown extension namespaces are ignored without validating their contents.
- A wrong-kind or invalid component location disables that component type while independent valid types continue.
- Invalid MCP disables MCP, not valid Skills.
- An unsupported MCP transport skips that server; runtime failure remains scoped to that server.

The portable loader gives no meaning to `.mcp.json`, inline `plugin.json.mcpServers`, root `hooks/`, or custom-agent directories.

```bash
node dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
```

Review component outcomes and warnings; do not reduce the report to an unqualified “valid.”

## Strict authoring

Strict authoring is the default. It rejects hazards portable loading may ignore or isolate, including unknown authoring data, inactive schemas, unsafe paths, malformed Skills, MCP semantic errors or likely packaged secrets, Goose extension errors, and ambiguous canonical/legacy sources.

```bash
node dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
```

The unified command combines canonical schema and Goose operational validation. Use `validate_agent_plugin_schema.js` only for direct document-level schema diagnostics.

## Release

Release builds use strict authoring and may additionally require specialist component validation, executable and offline tests, behavioral receipts, integration benchmarks, archive identity, migration approval, and human review. Missing evidence produces blocked, never a weaker pass.

## Legacy boundary

| Legacy input | Canonical target | Rule |
|---|---|---|
| root `.mcp.json` | root `mcp.json` | Propose only when every server maps safely |
| inline `plugin.json.mcpServers` | root `mcp.json` | Remove inline data after approved migration |
| root `hooks/hooks.json` | `extensions/io.github.block.goose/hooks.json` plus manifest envelope | Validate for the selected Goose target before translating |

When canonical and legacy forms coexist, or multiple legacy MCP forms coexist, fail as ambiguous. Never merge, select precedence, or ship both.

## Goose boundary

`io.github.block.goose` is a repository-defined adapter contract. Agent Plugins 1.0.0 transports its manifest object but assigns no portable semantics. A client that does not implement it may ignore it under portable rules; only the Goose adapter validates or executes it.

New hooks use `plugin.json.extensions["io.github.block.goose"]` pointing to `extensions/io.github.block.goose/hooks.json`. Do not describe hooks as portable core or claim upstream ratification.
