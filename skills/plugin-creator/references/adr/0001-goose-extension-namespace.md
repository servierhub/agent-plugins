# ADR 0001: Namespace Goose-specific plugin extensions under `io.github.block.goose`

- **Status:** Superseded by [ADR 0004](0004-distributor-goose-extension-namespace.md) for new output
- **Date:** 2026-08-23
- **Decision story:** ap-i8j.5.1
- **Scope:** Open Plugin packages that carry Goose hook declarations or other Goose host data

## Context

An Agent Plugins/Open Plugin package needs a place for host-specific data without making that data appear portable across hosts. The vendored Agent Plugins 1.0.0 schema explicitly defines `plugin.json.extensions` as client-specific data keyed by reverse-domain namespace and assigns no semantics to each namespace object. The vendored Goose references separately describe hooks as a Goose runtime facility. Those are different ownership boundaries: the open package format can transport an extension, but only the Goose host can define what the extension means.

The repository currently also has a top-level `hooks/` convention. That convention predates this namespaced envelope and is useful to current Goose installations, but its position at the package root can be mistaken for a portable Open Plugin primitive. No reviewed source establishes such portable semantics.

The strongest public naming evidence available is the official Goose project location at [`block/goose`](https://github.com/block/goose) and its published documentation under [`block.github.io/goose`](https://block.github.io/goose/). Reversing the documented GitHub Pages ownership path yields `io.github.block`; adding the product segment yields `io.github.block.goose`. This is source-verifiable repository/project stewardship, not a claim about trademark ownership or a promise that Block has ratified this exact extension identifier.

## Decision

### 1. Namespace ownership

Use **`io.github.block.goose`** as the Goose host-extension namespace.

- `io.github.block` is derived from the publicly visible `block.github.io` project publication namespace.
- `goose` scopes the identifier to the Goose host rather than to every Block project.
- The namespace owner defines interpretation, validation, lifecycle, and compatibility of values beneath this key.
- Open Plugin tooling may preserve, copy, package, and expose this value, but must not assign portable meaning to it.
- This repository records the convention; it does **not** assert legal ownership, trademark authority, or confirmed upstream adoption. Until Goose upstream explicitly adopts the identifier, implementations must label it a repository-defined Goose adapter contract.

Do not use an unqualified key such as `goose`, `hooks`, or `host`: those names invite collisions and imply common-format ownership that the evidence does not establish.

### 2. Package layout

Reserve the top-level directory `extensions/` for host-owned extension assets. Goose data uses one directory named by the complete namespace:

```text
plugin.json
extensions/
└── io.github.block.goose/
    ├── hooks.json
    └── ...                 # future Goose-owned assets only
```

The namespace is a single directory component, not expanded into `io/github/block/goose`. This keeps the on-disk identifier identical to the manifest key and makes collision checks mechanical. Paths are package-relative, use `/` separators in the manifest, must remain inside the package after normalization, and must not traverse symlinks or `..` outside the package root.

### 3. `plugin.json` extension envelope

Place host data under the manifest's top-level `extensions` object, keyed by the same reverse-domain identifier:

```json
{
  "extensions": {
    "io.github.block.goose": {
      "version": 1,
      "hooks": "extensions/io.github.block.goose/hooks.json"
    }
  }
}
```

For this contract:

- `extensions` is a map from globally collision-resistant owner identifiers to owner-defined values.
- `io.github.block.goose.version` is a required positive integer identifying the envelope/schema major version; version `1` is defined here.
- `hooks` is a required package-relative path when hooks are supplied. It points to one JSON document and is not an inline hook list.
- Unknown members inside `io.github.block.goose` are rejected by a validator for a schema version it claims to support. A transport-only tool that does not interpret the extension may preserve the complete value byte-for-byte, but must not report it as validated.
- Duplicate logical namespaces, including recognized aliases, are an error rather than a precedence rule.

Agent Plugins 1.0.0 explicitly permits the top-level `extensions` member and requires each namespace value to be an object, but assigns no meaning or child schema to that object. This ADR defines the `version` and `hooks` children only for this repository's Goose adapter. Consumers targeting another manifest version must verify that version's schema; if it does not admit this envelope, they must reject it or require an explicitly enabled compatibility mode rather than silently reinterpret it.

### 4. Hooks document and schema ownership

`extensions/io.github.block.goose/hooks.json` contains the Goose hook configuration accepted by the targeted Goose release. Its event names, matcher rules, command representation, input/output payloads, ordering, timeouts, and exit behavior are **Goose-owned semantics**.

The plugin creator must:

1. select a supported Goose target/version;
2. validate `hooks.json` against the Goose hook schema or normative documentation recorded for that target;
3. emit the namespaced envelope only when that source is available and validation succeeds; and
4. otherwise fail closed with an actionable “unsupported or unverified Goose hook schema” error.

This ADR deliberately does not reproduce a hook-event schema. The vendored snapshot, not an inferred cross-host model, is the source of truth. In particular, creators must not invent events, normalize commands into another host's shape, assume shell portability, or treat an unknown event as inert.

### 5. Failure scope

Failures are scoped according to who understands the extension:

- **Package creation/validation:** malformed envelope, unsafe path, missing file, unsupported version, duplicate alias, or Goose-schema failure is fatal for creation of a package that declares this namespace.
- **Goose installation/load:** an unsupported version or invalid hooks document disables/rejects the entire `io.github.block.goose` extension atomically. No subset of hooks is run.
- **Hook execution:** runtime failure follows the targeted Goose hook contract only. The current vendored reference says Goose hooks generally fail open unless a supported blocking signal is used, and documents blocking only for `PreToolUse` (exit code 2 with a stderr reason, or the documented JSON decision on stdout). This ADR does not broaden that behavior or invent retry, blocking, timeout, exit-code, or session-abort semantics for other events.
- **Other hosts:** a host that does not implement this namespace may preserve or ignore it only if its Open Plugin conformance rules permit unknown extensions. It must never execute it or claim Goose validation.
- **Ambiguous capability:** fail closed. Absence of an authoritative rule is not evidence for permissive behavior.

Rejecting the Goose extension need not invalidate otherwise portable package content when the consuming format explicitly permits isolated unknown extensions. If the applicable manifest contract does not establish that isolation, reject the package as a whole rather than guessing.

### 6. Versioning

Version the owner envelope independently from both the package manifest and Goose itself.

- `version: 1` means the envelope fields and their interpretation defined by this ADR.
- Backward-compatible additions require both an updated recorded schema and an implementation policy for older readers; they do not silently change version 1's closed validation.
- Breaking changes use a new integer major version.
- The selected Goose compatibility range belongs in repository tooling/validation metadata only after an authoritative Goose versioning rule is recorded. This ADR does not invent one.
- A consumer supports an explicit finite set of versions. It rejects all others, including a missing version.

### 7. Migration aliases

The canonical manifest key and directory are always `io.github.block.goose`. Aliases are input-only migration aids; creators never emit them in new output.

The only initially recognized legacy representation is the existing package-root `hooks/` convention, and only where the repository's recorded Goose adapter already defines how that directory is loaded. It is not a second namespace and does not establish portable Open Plugin hooks.

Migration rules:

1. If only canonical data exists, use it.
2. If only a recognized root `hooks/` representation exists, a compatibility importer may translate it to the canonical document after validating it against the selected Goose source snapshot.
3. If canonical and legacy forms both exist, fail as ambiguous; do not merge and do not choose precedence.
4. Preserve no unrecognized alias. Names such as `goose`, `block.goose`, and `com.block.goose` are not aliases.
5. Diagnostics identify the legacy source and recommend `extensions/io.github.block.goose/hooks.json` plus the canonical manifest entry.

Alias support is transitional and importer-specific. Removal requires a separately recorded migration decision and a release boundary; no removal date is invented here.

## Relationship to current root hooks

The current root `hooks/` tree remains a **legacy Goose integration surface** for compatibility with installations that already consume it. It is not promoted to an Open Plugin core directory by this decision. New package format output uses the namespaced extension location. Existing root hooks are not moved or rewritten by this ADR.

A packaging tool may materialize root hooks from the canonical extension for a known Goose target, or import them in the opposite direction, but only through an explicit adapter with source-version validation. It must not ship both forms in one package because double discovery could execute a hook twice and because no verified upstream precedence rule is available.

## Consequences

### Positive

- Ownership is visible in both manifest and filesystem paths.
- Goose-specific behavior cannot be mistaken for cross-host Open Plugin semantics.
- Unknown or changed upstream behavior fails closed.
- Envelope evolution is independent from package and host release numbering.
- Legacy root hooks have a migration path without becoming permanent portable API.

### Costs and risks

- The identifier is based on public project stewardship evidence, not explicit upstream ratification; a future official Goose namespace may require a new ADR and alias migration.
- Strict schemas that do not admit `extensions` cannot consume this representation without a spec update or compatibility profile.
- Packages may need target-specific validation and generated compatibility layouts.
- Rejecting mixed legacy/canonical packages favors safety over convenience.

## Alternatives considered

- **`goose` or root `hooks`:** rejected because ownership is ambiguous and portability would be implied.
- **`com.block.goose` / `xyz.block.goose`:** rejected because the reviewed material did not establish this repository's authority to allocate names under those corporate domains.
- **`io.github.block.goose`:** selected because the official repository and documentation publication path make the stewardship relationship auditable while still carrying the explicit non-ratification caveat.
- **Inline hooks in `plugin.json`:** rejected because it couples the portable manifest to a host schema and makes independent versioning harder.
- **Best-effort processing of unknown versions/events:** rejected because executing partially understood hooks is unsafe.

## Evidence basis

The decision uses these recorded sources:

- [Vendored Agent Plugins 1.0.0 `plugin.schema.json`](../agent-plugins-1.0.0/plugin.schema.json): defines the top-level `extensions` object as client-specific manifest data keyed by reverse-domain extension namespace, with namespace values that are objects and with no Agent Plugins semantics assigned to their contents.
- [Vendored Agent Plugins snapshot README](../agent-plugins-1.0.0/README.md): identifies the canonical `agent-plugins.org` schema URLs and retrieval date (2026-08-21).
- [Vendored Goose Hooks Reference](../goose-hooks.md): records root `hooks/hooks.json`, the current document shape, events, matcher and `${PLUGIN_ROOT}` rules, blocking signals, local-command risk, and generally fail-open runtime behavior.
- [Vendored Goose Plugin Format Reference](../goose-plugin-format.md): records Goose's plugin layout, root hooks relationship, installation locations, and the separation between schema conformance and Goose operational validation.
- [Official Goose repository, `block/goose`](https://github.com/block/goose) and [official published Goose documentation](https://block.github.io/goose/): evidence for public project stewardship used to derive `io.github.block.goose`.

The first four are the repository's recorded source-of-truth snapshots for implementation. The official URLs support project stewardship and current host behavior only to the extent they explicitly document it. None of these sources proves that `io.github.block.goose`, the child envelope defined here, or this migration contract has been accepted upstream. Accordingly, those elements are local design decisions and all unsupported semantic interpretation fails closed.
