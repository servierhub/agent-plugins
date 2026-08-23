# ADR 0003: Keep Agent Plugins 1.1.0 inactive until publication and evidence gates pass

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision story:** ap-i8j.1.3

## Context

The vendored Agent Plugins 1.1.0 source identifies itself as a **Working Draft**. At upstream commit `ff8ab5e392cc87bd88d87c060815a87490e51003`, its JSON Schema validation rules match 1.0.0 after normalizing canonical version identifiers, but draft text or schemas can still change. Treating identifier similarity or current rule equality as publication would make generated packages depend on a mutable contract.

## Decision

Published Agent Plugins 1.0.0 remains the default and only active generation target. The local registry may record 1.1.0 provenance and draft metadata, but validators must return an explicit inactive/unsupported-version outcome unless an experimental interface is separately designed and explicitly selected. There is no implicit compatibility based on semantic-version proximity.

Activate 1.1.0 only after all gates below pass:

1. **Upstream publication:** upstream no longer labels 1.1.0 a working draft and publishes immutable canonical specification and schema artifacts.
2. **Immutability verification:** the published bytes and canonical identifiers are recorded with commit/blob provenance and SHA-256 hashes. Any drift from this draft snapshot triggers a complete re-diff and review.
3. **Compatibility decision:** an explicit registry entry states whether 1.1.0 has a distinct implementation or maps to 1.0.0 rules. Compatibility is evidence-backed data, never inferred from version numbers.
4. **Semantic review:** normative text, not only JSON Schemas, is mapped to conformance fixtures, including loading exceptions, failure isolation, filesystem containment, and MCP semantics.
5. **Regression evidence:** 1.0.0 validation, generation, migration, packaging, offline behavior, and release gates continue to pass; 1.1.0 fixtures pass in portable-load and strict-release modes.
6. **Documentation and UX:** CLI help and reports distinguish supported, compatible, draft/inactive, and unknown identifiers, and require explicit target selection for non-default generation.
7. **Approval:** a subsequent ADR records the evidence and changes the active registry state. Completing a code path alone does not activate the version.

## Default and rollback policy

- Default generation stays pinned to 1.0.0 until a later ADR deliberately changes it; activating validation support does not automatically change generation defaults.
- Existing 1.0.0 packages remain supported after any future activation.
- If a newly activated version is found unsafe or inconsistent, disable new generation for that target first, retain read-only diagnostics where safe, and restore 1.0.0 as the sole active target without rewriting user packages.
- Never fetch schemas while loading or validating a plugin.

## Consequences

The repository can prepare deterministic multi-version architecture without claiming draft conformance. Users receive clear unsupported/inactive diagnostics rather than accidental validation against a look-alike schema. Activation is delayed until source, semantics, tests, migration, and rollback evidence are reviewable.
