# ADR 0002: Reject symbolic links from release packages

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision stories:** ap-i8j.3.2, ap-i8j.3.3

## Decision

Directory validation resolves every discovered path against the real plugin root before reading or traversing it. A link that resolves outside the root is rejected at the narrowest component boundary. A contained link may be inspected safely by validation, subject to the documented TOCTOU limits of the containment primitive.

Release packaging is intentionally stricter: it rejects every symbolic link, including links whose current target is inside the plugin. ZIP portability does not provide consistent symlink semantics across clients and platforms, and a target can change between validation and archive creation. Junctions and reparse points that are exposed as links receive the same policy; any path that resolves outside the root is rejected regardless of its reported kind.

This is a strict packaging policy, not a claim that Agent Plugins core forbids links. Diagnostics therefore identify packaging policy separately from portable document validity.

## Consequences

- External links can never disclose out-of-package content.
- Internal links must be materialized as ordinary files/directories before packaging.
- Package collection performs containment checks before reads and traversal.
- Validation and packaging may legitimately differ: a package can be inspectable but not release-eligible.
- Filesystem checks are not an atomic sandbox; callers in attacker-writable trees must use handle-relative no-follow operations or otherwise control concurrent mutation.
