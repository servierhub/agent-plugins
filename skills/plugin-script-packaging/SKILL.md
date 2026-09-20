---
name: plugin-script-packaging
description: Designs and verifies language-aware executable packaging for Agent Plugins across source installs and native releases. Use when adding TypeScript, Rust, Python, or other CLI runtimes, dependencies, launchers, or cross-platform binaries to a plugin.
---

# Plugin Script Packaging

Package executable behavior without coupling an installed Skill to repository-only source files. Treat the portable Skill, implementation source, generated source runtime, and native release projection as separate artifacts.

## Scope

Use this Skill for script-runtime architecture and verification inside an Agent Plugin. Route Skill instruction quality to `agent-plugins:skill-creator` (fallback `skill-creator`) and whole-plugin manifest, conformance, installation, or release decisions to `agent-plugins:plugin-creator` (fallback `plugin-creator`). Do not invent an Agent Plugins field for executable dependencies: runtime metadata outside the published schema must use a namespaced `plugin.json.extensions` object and remain explicitly vendor-specific.

## Progressive disclosure

Read the shared references for every task:

- [dual-runtime architecture](references/dual-runtime-architecture.md) before changing runtime layout, launchers, dependency closure, or native projection;
- [verification matrix](references/verification-matrix.md) before claiming either installation mode works.

Then select exactly one language branch before designing files or commands:

| Condition | Language reference |
|---|---|
| Language is absent, TypeScript, JavaScript, Node.js, Bun, or npm-based | Read [TypeScript packaging](references/language-typescript.md). TypeScript is the default. |
| Language or toolchain is Rust or Cargo | Read [Rust packaging](references/language-rust.md). |
| Language or toolchain is Python, pip, PyPI, zipapp, PyInstaller, or Nuitka | Read [Python packaging](references/language-python.md). |
| Another language | Do not load an unrelated language reference. Derive a named branch from its locked dependency graph, source artifact, runtime/interpreter contract, native target model, and reproducible packaging tools; state that the language is not yet covered by a bundled specialist reference. |

Do not read all language references “for completeness.” Load another branch only when comparing languages or when the implementation genuinely contains multiple language runtimes. For a polyglot command, select one primary entrypoint language and load each additional reference only for the runtime component it governs.

## Workflow

1. **Define the public command.** Record its logical name, arguments, exit statuses, inputs, outputs, side effects, minimum runtime, supported platforms, and whether another packaged command invokes it.
2. **Select the language branch.** Infer TypeScript only when the user provides no language signal. Otherwise load the matching conditional reference and use its source artifact, lockfile, launcher/interpreter, dependency, and native-build rules.
3. **Inspect the selected host and distribution modes.** Do not infer installation behavior from the open format. Identify whether the artifact is a Git/source checkout, a native release, or both.
4. **Separate ownership.** Keep editable implementation, tests, manifests, and lockfiles in the repository application/source area. Keep the installed Skill self-contained; it must never reach outside its own directory at runtime.
5. **Design source and native projections when both are promised.** Use the selected language reference for the exact launcher, interpreter, prebuilt target, dependency closure, and exclusions. The shared invariant is one unambiguous declared entrypoint per profile, not one universal `.mjs` layout.
6. **Declare the mode.** Put vendor-specific runtime metadata under a reverse-domain key in `plugin.json.extensions`. Record a schema version and either the source launcher/runtime pattern or the native executable pattern. Never add undeclared fields to the portable manifest root.
7. **Make invocation deterministic.** Branch on both language and installation mode. Invoke only the entrypoint declared by the selected language profile; never execute editable source or search repository/application paths from an installed Skill. Fail as incomplete or mixed when the declared entrypoint is absent or incompatible artifacts coexist.
8. **Generate, do not hand-edit, runtime projections.** Pin source-to-runtime mapping, language toolchain, compiler/freezer, targets, and lockfile. Include licenses/notices and generate checksums or an inventory manifest. Apply the selected branch's rules for install scripts, build scripts, native extensions, shared libraries, interpreters, and target selection.
9. **Preserve path and process safety.** Resolve relative to the installed Skill, reject absolute/traversal mappings and symlink escapes, avoid shell interpolation, forward arguments as an array, propagate exit codes/signals, and never package credentials.
10. **Validate before installation.** Test the source projection in an isolated copied Skill with no repository-relative fallback. Clear the selected language branch's search paths, user-package locations, and build-tool environment. Test native artifacts without their source interpreter or build tool. Then validate the complete plugin.
11. **Install and smoke-test through the real host.** For Goose Git installation, confirm the installed revision, declared language/runtime profile, and exact contained entrypoint before invoking it. For a native archive, verify its checksum and release manifest before installation, then invoke the target binary. Restart the host if discovery occurs only at session startup.
12. **Report evidence.** State which modes and platforms were actually executed, exact commands, exit codes, artifact hashes, and unsupported or untested cells. A successful source run is not evidence for a native target.

## Required output

Return the logical command contract, source/native layout table, namespaced runtime manifest fragment, generation and installation commands, validation and smoke-test results, status for every promised mode/platform, and a handoff to `plugin-creator` for whole-plugin validation and release.

## Prohibitions

- Do not place editable implementation source (`.ts`, `.rs`, `.py`, or equivalent) in an installed runtime profile.
- Do not run npm, Cargo, pip, or another dependency installer during end-user installation.
- Do not let a source launcher, interpreter entrypoint, or target selector fall back to repository paths or undeclared system packages.
- Do not ship source-profile runtime material beside a native executable in one profile.
- Do not claim a native binary is portable across operating systems or CPU architectures.
- Do not treat vendor runtime metadata as Agent Plugins portable core.
- Do not report success from static layout checks alone; execute the selected entrypoint.
