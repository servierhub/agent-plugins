# Verification matrix

Record evidence independently for every promised cell.

| Dimension | Source/Git requirement | Native-release requirement |
|---|---|---|
| Entrypoint | `.mjs` launcher exists and is plain | target binary exists and is executable where applicable |
| Implementation | emitted `.js`, never installed `.ts` | compiled into binary; no source application |
| Dependencies | exact vendored production closure | embedded by compiler; no `node_modules` |
| Isolation | copied Skill runs outside repository | extracted archive runs outside build tree |
| Environment | correct Node version; no network install | empty `PATH`, `NODE_PATH`, and runtime home variables |
| Integrity | runtime manifest paths/hashes match | release inventory and archive checksum match |
| Safety | traversal and symlink mappings rejected | wrong target and mixed runtime rejected |
| Behavior | representative command and failure path execute | same command and failure path execute |
| Host | actual Git installation discovers the Skill | actual archive installation discovers the Skill |

## Minimum test sequence

1. Validate Skill metadata and linked resources.
2. Build the application and run unit tests.
3. Generate the source runtime twice and check deterministic drift.
4. Copy only the Skill directory and run its launcher.
5. Compile each pinned native target in its native CI runner.
6. Smoke-test the current-platform binary with a clean environment.
7. Compare stable JSON behavior between emitted JavaScript and native executable.
8. Assert native staging excludes `.mjs`, `runtime/`, `node_modules`, source applications, tests, and build files.
9. Tamper with a hash, mix a foreign binary, and add source runtime material; each must fail closed.
10. Install through the supported host, verify revision/profile, restart discovery, and execute one real workflow.

Cross-compilation proves only artifact production. Runtime success requires execution on that target or an explicit `not-tested` result.
