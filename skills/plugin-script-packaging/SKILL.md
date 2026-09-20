---
name: plugin-script-packaging
description: Designs and verifies executable script packaging for Agent Plugins across Git/source Node runtimes and tagged native binaries. Use when adding scripts, CLIs, offline dependencies, launchers, or cross-platform executables to a plugin.
---

# Plugin Script Packaging

Package executable behavior without coupling an installed Skill to repository-only source files. Treat the portable Skill, implementation source, generated source runtime, and native release projection as separate artifacts.

## Scope

Use this Skill for script-runtime architecture and verification inside an Agent Plugin. Route Skill instruction quality to `agent-plugins:skill-creator` (fallback `skill-creator`) and whole-plugin manifest, conformance, installation, or release decisions to `agent-plugins:plugin-creator` (fallback `plugin-creator`). Do not invent an Agent Plugins field for executable dependencies: runtime metadata outside the published schema must use a namespaced `plugin.json.extensions` object and remain explicitly vendor-specific.

## Required references

- Read [dual-runtime architecture](references/dual-runtime-architecture.md) before changing runtime layout, launchers, dependency closure, or native projection.
- Read [verification matrix](references/verification-matrix.md) before claiming either installation mode works.

## Workflow

1. **Define the public command.** Record its logical name, arguments, exit statuses, inputs, outputs, side effects, minimum runtime, supported platforms, and whether another packaged command invokes it.
2. **Inspect the selected host and distribution modes.** Do not infer installation behavior from the open format. Identify whether the artifact is a Git/source checkout, a native release, or both.
3. **Separate ownership.** Keep editable TypeScript and tests in the repository application/source area. Keep the installed Skill self-contained; it must never reach outside its own directory at runtime.
4. **Design both projections when both are promised:**
   - Git/source: a small `scripts/<command>.mjs` launcher plus contained generated `runtime/` with emitted JavaScript and the exact production dependency closure;
   - native release: one platform executable at `scripts/<command>[.exe]`, with the source launcher, generated runtime, and `node_modules` excluded.
5. **Declare the mode.** Put vendor-specific runtime metadata under a reverse-domain key in `plugin.json.extensions`. Record a schema version and either the source launcher/runtime pattern or the native executable pattern. Never add undeclared fields to the portable manifest root.
6. **Make invocation deterministic.** Instructions must branch on the declared installation mode:
   - `node-bundled`: run `node scripts/<command>.mjs ...` from the Skill directory or use its resolved absolute path;
   - `native-bun` (or another named native profile): run `scripts/<command>[.exe] ...` directly;
   - never execute `.ts` files and never search repository `apps/` from an installed Skill;
   - fail as an incomplete or mixed package if the declared entrypoint is absent or incompatible artifacts coexist.
7. **Generate, do not hand-edit, runtime projections.** Pin the source-to-runtime mapping, compiler version, and targets. Derive the production dependency closure from a lockfile, reject lifecycle-install packages unless explicitly governed, include licenses/notices, and generate checksums or an inventory manifest.
8. **Preserve path and process safety.** Resolve relative to the installed Skill, reject absolute/traversal mappings and symlink escapes, avoid shell interpolation, forward arguments as an array, propagate exit codes/signals, and never package credentials.
9. **Validate before installation.** Test the source projection in an isolated copied Skill with no repository-relative fallback. Test native artifacts with an empty `PATH`, `NODE_PATH`, and runtime-specific environment. Then validate the complete plugin.
10. **Install and smoke-test through the real host.** For Goose Git installation, confirm the installed revision and `node-bundled` manifest, then invoke the `.mjs` launcher. For a native archive, verify its checksum and release manifest before installation, then invoke the binary. Restart the host if discovery occurs only at session startup.
11. **Report evidence.** State which modes and platforms were actually executed, exact commands, exit codes, artifact hashes, and unsupported or untested cells. A successful source run is not evidence for a native target.

## Required output

Return the logical command contract, source/native layout table, namespaced runtime manifest fragment, generation and installation commands, validation and smoke-test results, status for every promised mode/platform, and a handoff to `plugin-creator` for whole-plugin validation and release.

## Prohibitions

- Do not place editable `.ts` implementation in an installed Skill.
- Do not run `npm install` during end-user installation.
- Do not let a source launcher fall back to repository paths.
- Do not ship `.mjs` or `runtime/` beside a native executable in one profile.
- Do not claim a native binary is portable across operating systems or CPU architectures.
- Do not treat vendor runtime metadata as Agent Plugins portable core.
- Do not report success from static layout checks alone; execute the selected entrypoint.
