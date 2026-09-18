# Golden end-to-end journeys

The `plugin-creator golden-e2e` command provides three immutable offline journeys: idea to API-review Skill, dependency-review agent, and multi-component safety plugin. Each starts with natural language and no artifact, applies novice defaults or bounded expert overrides, and covers generation, validation, repeated evaluation, challenge, improvement, review, and release gating.

The deterministic offline adapter generates real isolated candidates under `.agents/plugins`, invokes the shipped Skill, agent, and plugin validators, executes every frozen scenario repetition, and records assertion results and deterministic timings. Evidence says `kind: executed` and `executed: true` for those local operations while `llm_executed: false` explicitly distinguishes the absence of model inference, network, host, or production execution. An independent deterministic challenger evaluates the initial candidate and a revised candidate addresses its findings.

Metrics are derived from baseline and revised records: effectiveness is pass rate, productivity is relative duration reduction, and outcome success is normalized improvement over baseline. Every run emits periodic heartbeats, a durable cancellation checkpoint, provenance hashes, and a checksummed CI archive. The archive verifier checks required inventory/contracts and rejects direct or transitive artifact, result, record, fixture, and checkpoint tampering. Resume is idempotent after completion and rejects stale provenance. Completed runs terminate at `pending-production-approval` (exit 4); the executor has no activation capability. Cancellation is exit 3. `--inspect` detects stale or invalid evidence and still denies activation.

    node dist/scripts/cli.js golden-e2e --list
    node dist/scripts/cli.js golden-e2e --journey idea-api-review-skill --workspace ./evaluations/golden/api --format json
    node dist/scripts/cli.js golden-e2e --journey dependency-review-agent --workspace ./evaluations/golden/deps --profile expert --override repetitions=9 --resume

Fixtures, suites, thresholds, and expected contracts live under `assets/golden-e2e/`. Fixture checksum mismatch fails closed.
