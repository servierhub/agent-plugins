# Dual-runtime architecture

## Contract boundaries

Agent Plugins describes the portable package surface. It does not standardize this distribution's executable runtime profile. Keep runtime selection in a versioned reverse-domain extension and document the host integration separately.

## Recommended repository layout

~~~text
plugin.json
apps/<command>-cli/
  package.json
  package-lock.json
  scripts/*.ts
  tests/
skills/<skill>/
  SKILL.md
  references/
  scripts/<command>.mjs
  runtime/
    runtime-manifest.json
    dist/**/*.js
    node_modules/<production-closure>/
~~~

The application directory owns editable source, build configuration, tests, and dependency metadata. The Skill owns only instructions and generated runtime material needed after an isolated copy.

## Git/source projection

Use a small launcher that verifies the minimum Node version, resolves the Skill root from its own module URL, reads a closed versioned runtime manifest, rejects unsafe mappings or symlinks, starts emitted JavaScript with an argument array, and forwards exit status or signal.

Generate `runtime/` atomically. Include emitted JavaScript, required resources, notices, and exactly the transitive production dependencies pinned by the lockfile. Exclude TypeScript, tests, package-manager shims, optional/dev dependencies, native addons unless governed, and packages with unreviewed install scripts. Installation must not contact the network.

## Native release projection

Build one executable per pinned OS/architecture target from the same source entrypoint. Stage into a clean temporary directory, copy only portable documentation/resources, create `scripts/<command>` (`.exe` on Windows), record mode/target/compiler and every file hash, validate, then atomically publish the stage.

A native profile excludes the source launcher, `runtime/`, `node_modules`, source applications, tests, and build manifests. Packaging must detect wrong-architecture binaries and mixed runtime material.

## Vendor extension examples

Source installation:

~~~json
{"extensions":{"io.example.plugin.runtime":{"schemaVersion":1,"mode":"node-bundled","node":">=22.0.0","launchers":"skills/<name>/scripts/<command>.mjs","runtime":"skills/<name>/runtime/"}}}
~~~

Native release:

~~~json
{"extensions":{"io.example.plugin.runtime":{"schemaVersion":1,"mode":"native-bun","executables":"skills/<name>/scripts/<command>[.exe]"}}}
~~~

Replace the example namespace with one controlled by the distributor. These are host/vendor contracts, not portable Agent Plugins fields.

## Related commands

Avoid PATH lookup and sibling-script spawning. In the source profile, generate a contained related-command map and copy required emitted runtime under the caller. In a compiled profile, dispatch in-process through imported handlers.
