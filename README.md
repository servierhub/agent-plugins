[![Servier Powered](https://raw.githubusercontent.com/servierhub/.github/main/badges/powered.svg)](https://servier.com/en/)

# Agent Plugins

Build, improve, validate, evaluate, and package agent capabilities without tying their portable core to one runtime.

This distribution provides four guided creators for [Agent Skills](https://agentskills.io/specification), custom agents, hooks, and complete [Agent Plugins](https://agent-plugins.org/). Portable artifacts follow open specifications and are **runtime-agnostic**. Runtime-specific behavior is isolated and identified explicitly. [Goose](https://block.github.io/goose/) is the tested reference runtime—not a required proprietary format or the only possible host.

| Status | Value |
|---|---|
| Distribution | `0.5.0` |
| Portable plugin target | Agent Plugins `1.0.0` |
| Portable skill target | Agent Skills |
| Tested reference runtime | Goose `1.47.0` |
| Creator runtime | Node.js `22+` |
| License | [CeCILL-C](LICENSE) |

## Contents

- [Quick start](#quick-start)
- [Choose your path](#choose-your-path)
- [Choose the right creator](#choose-the-right-creator)
- [How-to guides](#how-to-guides)
- [Installation and updates](#installation-and-updates)
- [Validation and evaluation](#validation-and-evaluation)
- [Troubleshooting](#troubleshooting)
- [Formats, portability, and security](#formats-portability-and-security)
- [Component reference](#component-reference)
- [Contributing](#contributing)
- [Project information](#project-information)

## Quick start

### 1. Check the requirements

You need a compatible agent host and Node.js 22 or later. The creators are distributed with compiled scripts and vendored runtime dependencies; consumers must not run `npm install` inside an installed release.

Any host implementing the open Agent Skills or Agent Plugins formats can consume the corresponding portable artifacts. Host discovery and installation commands differ. The commands below use Goose because this repository tests that integration end to end.

### 2. Install with the tested Goose adapter

```bash
goose plugin install --auto-update https://github.com/bioinfornatics/agent-plugins.git
```

Omit `--auto-update` if you want to approve updates manually.

### 3. Verify discovery without creating files

Start a new Goose session and ask:

> Use `agent-plugins:skill-creator` to explain, without modifying files, what you need from me to create an Agent Skill.

Success means Goose resolves the qualified creator and asks for or explains the target behavior, activation conditions, workflow, and evaluation needs. If it cannot resolve the creator, see [Troubleshooting](#troubleshooting).

### 4. Create a first portable Skill

> Use `agent-plugins:skill-creator` to create `.agents/skills/markdown-summary`. It should summarize one Markdown file into key decisions and open questions. Keep the Skill portable, validate it, and show me the files created and any evidence still required.

A successful run creates at least `.agents/skills/markdown-summary/SKILL.md`, validates its format, and reports either completed evaluation evidence or an explicit `evaluation: blocked` state. Additional references, scripts, or evaluations are created only when the behavior needs them.

## Choose your path

- **Use all four creators:** install the complete plugin with a compatible host; the Goose command above is the tested path.
- **Create one portable Skill:** use `skill-creator`; the resulting `SKILL.md` follows the open Agent Skills format.
- **Maintain or migrate a plugin:** use `plugin-creator` for manifest, MCP, packaging, and whole-plugin decisions.
- **Create Goose-specific behavior:** use `agent-creator` or `hook-creator`; these outputs are explicitly host-specific.
- **Contribute to this repository:** follow [Contributing](#contributing).

## Choose the right creator

| I want to… | Creator | Output portability |
|---|---|---|
| Create, improve, or evaluate one Agent Skill | `agent-plugins:skill-creator` | Open Agent Skills format |
| Create or evaluate a custom agent | `agent-plugins:agent-creator` | Goose custom-agent format |
| Create or validate a lifecycle hook | `agent-plugins:hook-creator` | Goose extension in a plugin |
| Create, migrate, validate, evaluate, or release a plugin | `agent-plugins:plugin-creator` | Portable core plus explicit host adapters |

Use the unqualified names—such as `skill-creator`—when a creator is installed standalone. A productive request names one deliverable, its destination, user outcome, constraints, and success criteria.

## How-to guides

Each guide identifies the request and the evidence of success. Exact supporting files depend on the requested behavior.

### How to create a portable Skill

**Use when:** you want repeatable instructions that compatible agents can discover through the Agent Skills format.

**Prompt:**

> Use `agent-plugins:skill-creator` to create `.agents/skills/api-review`. It should review an OpenAPI diff for breaking changes and produce a concise Markdown report. Include realistic evaluations, validate the result, and report any blocked evidence.

**Success:** `SKILL.md` has valid frontmatter and focused instructions; its directory name matches the Skill name; any referenced files exist; validation passes; behavioral evidence is reported separately.

### How to improve an existing custom agent

**Use when:** a Goose custom agent already exists under `.agents/agents/` and needs evidence-backed improvement.

**Prompt:**

> Use `agent-plugins:agent-creator` to evaluate `.agents/agents/security-reviewer.md` against its current baseline, improve only evidence-backed weaknesses, and report the benchmark delta.

**Success:** the custom-agent definition validates, paired evidence remains traceable, and the report distinguishes measured improvement from unavailable or blocked evidence.

### How to add a safe Goose hook

**Use when:** a plugin needs Goose lifecycle behavior. Hooks execute commands and are not part of the portable core.

**Prompt:**

> Use `agent-plugins:hook-creator` to add a safe `PostToolUse` hook to `./my-plugin`. Invoke a plugin-relative script, keep persistent writes inside plugin data, validate the hook, and explain its side effects.

**Success:** the plugin already has a valid `plugin.json`; the hook uses the canonical namespaced extension; referenced scripts exist and remain inside the plugin; executable behavior has been reviewed.

### How to validate or release a plugin

**Use when:** you need a conformance decision, migration, package, or release—not just one component.

**Prompt:**

> Use `agent-plugins:plugin-creator` to validate `./my-plugin` in strict-authoring mode, fix actionable errors, run applicable evaluations, and prepare a release only if every required gate has evidence.

**Success:** portable and host-specific resources are classified separately; strict validation passes; requested behavioral evidence and archive checks exist; missing evidence blocks rather than weakens a release gate.

From a source checkout of this repository, direct validation is also available:

```bash
node skills/plugin-creator/dist/scripts/cli.js validate <plugin-directory> --mode portable-load --format json
node skills/plugin-creator/dist/scripts/cli.js validate <plugin-directory> --mode strict-authoring --format json
```

## Installation and updates

### Complete plugin in Goose—tested reference path

```bash
goose plugin install --auto-update https://github.com/bioinfornatics/agent-plugins.git
```

For an installation without automatic updates:

```bash
goose plugin install https://github.com/bioinfornatics/agent-plugins.git
goose plugin update agent-plugins
```

Goose 1.47.0 provides `plugin install` and `plugin update`, but no plugin uninstall subcommand. Use the removal procedure documented by your installed host version rather than deleting unknown runtime state manually.

### Other compatible hosts

Use the host's documented Agent Skills or Agent Plugins installation mechanism. There is intentionally no invented universal command: the portable file formats are shared, while discovery and lifecycle management belong to each host. Qualified creator names are a host presentation detail and may differ.

### One standalone creator from a source checkout

Clone the canonical repository, then copy the self-contained creator directory:

```bash
git clone https://github.com/bioinfornatics/agent-plugins.git
cd agent-plugins
mkdir -p ~/.agents/skills
cp -R skills/skill-creator ~/.agents/skills/skill-creator
test -f ~/.agents/skills/skill-creator/SKILL.md
```

The `.agents/skills` location is an emerging interoperability convention used by Goose and other compatible agents; confirm discovery rules in your host.

## Validation and evaluation

Validation answers “does the artifact conform?” Evaluation answers “does it improve behavior?”

- **`portable-load`:** models what an Agent Plugins 1.0.0 loader accepts, ignores, or isolates.
- **`strict-authoring`:** adds semantic, operational, migration, and safety policy; this is the authoring default.
- **Release:** additionally requires applicable tests, behavioral receipts, archive identity, and human review.

JSON commands return a stable envelope. Exit codes are `0` for success, `1` for failure, `2` for invalid usage, and `3` when required execution or evidence is blocked. A blocked evaluation is not a passed evaluation and is not necessarily a format failure.

```text
scenarios → paired isolated runs → grading → benchmark → review → release gates
```

## Troubleshooting

| Symptom | What to check |
|---|---|
| A creator is not found | Start a new host session after installation; try the qualified name for a plugin install and the plain name for a standalone install. |
| Goose cannot start a creator | Confirm Goose has a configured model provider and the plugin installation completed without errors. |
| Node.js errors appear | Run `node --version`; creator scripts require Node.js 22 or later. |
| An installed release reports a missing dependency | Treat it as an incomplete package; do not repair it with `npm install`. Reinstall a complete release and report the defect. |
| Validation fails | Read the structured diagnostics and correct the referenced path or field; do not bypass strict-authoring errors. |
| Evaluation reports `blocked` | Supply the requested model run, grading, timing, test, or human-review evidence, then resume the workflow. |
| Portable and Goose behavior seem inconsistent | Check whether the resource is portable core, a Goose-specific adapter, or a legacy migration input. |

Report reproducible defects in the [canonical issue tracker](https://github.com/bioinfornatics/agent-plugins/issues).

## Formats, portability, and security

### Portable core

The active target is the published Agent Plugins 1.0.0 format:

```text
my-plugin/
├── plugin.json          # required
├── skills/review/       # optional Agent Skills
│   └── SKILL.md
└── mcp.json             # optional portable MCP configuration
```

`plugin.json`, direct children of `skills/`, and root `mcp.json` form the portable package surface. The vendored Agent Plugins 1.1.0 snapshot is an inactive Working Draft for analysis, not a supported target.

### Explicit host adapters

Custom-agent definitions and hooks currently target Goose contracts. New hooks live under `plugin.json.extensions["io.github.bioinfornatics.agent-plugins.goose"]` and point to `extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json`. Root `hooks/hooks.json`, root `.mcp.json`, and inline `plugin.json.mcpServers` are legacy migration inputs, not portable alternatives.

Hooks are executable behavior. Review generated commands, paths, credentials, blocking semantics, and side effects before enabling them. Never package secrets.

See [portable conformance](skills/plugin-creator/references/portable-conformance.md) and the [Goose adapter reference](skills/plugin-creator/references/goose-plugin-format.md) for normative detail.

## Component reference

- [Skill Creator](skills/skill-creator/README.md)—portable Agent Skills authoring and evaluation.
- [Plugin Creator](skills/plugin-creator/README.md)—portable package boundaries, validation, migration, and release.
- [Agent Creator](skills/agent-creator/README.md)—Goose custom-agent definitions.
- [Hook Creator](skills/hook-creator/README.md)—Goose lifecycle hooks and executable safety.

## Contributing

Contributor dependency installation is separate from end-user installation. From the repository root, these copy/paste-safe subshell commands preserve the working directory:

```bash
(cd skills/agent-creator && npm install && npm run build && npm test)
(cd skills/hook-creator && npm install && npm run build && npm test)
(cd skills/plugin-creator && npm install && npm run build && npm test)
(cd skills/skill-creator && npm install && npm run build && npm test)
```

Verify the complete offline distribution from the repository root:

```bash
npm run prepare:offline
npm test
npm run test:offline
```

## Project information

- Canonical development, issues, and releases: <https://github.com/bioinfornatics/agent-plugins>
- Servier Open Source Hub showcase fork: <https://github.com/servierhub/agent-plugins>
- Agent Skills specification: <https://agentskills.io/specification>
- Agent Plugins specification: <https://agent-plugins.org/>
- Goose documentation: <https://goose-docs.ai/>
- Distribution manifest: [`plugin.json`](plugin.json)
- License: [CeCILL-C](LICENSE)

Install from and report issues to the canonical repository. The ServierHub repository showcases the project in the Servier Open Source Hub and may carry presentation commits before they are proposed upstream.
