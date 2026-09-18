# Reproducible hook evaluation run manifest

Use `hook-evaluation-run-manifest/v1` for local and CI; `execution.environment` records the environment without changing the schema.

The manifest stores an absolute canonical `inputs.path_base` and normalized `canonical_ref` values, so a manifest written elsewhere still verifies the exact source inputs. Artifact, baseline, scenarios, fixtures, and plan are content-addressed. Baseline is a strict union: a content link or an explicit `unavailable_reason`. Tool identity likewise requires exactly one of `version` or `unavailable_reason`.

Every runtime participant (host adapter, model, tool, runner, grader) names a declared trust boundary. Runtime validation and the JSON Schema are closed at every level: unknown fields, malformed or mismatched content links, unknown trust boundaries, secret-bearing fields, and invalid availability unions fail before manifest hashing or provenance reads. Only required secret environment-variable names may be recorded.

Create with `hook-creator eval-manifest create run-spec.json /other/location/run-manifest.json`. Verify with `hook-creator eval-manifest verify /other/location/run-manifest.json [receipt.json]`. Creation does not overwrite. Verification uses the stored canonical base, re-hashes inputs, and invalidates a `hook-evaluation-receipt/v1` after any bound input change. Symlinks are rejected.
