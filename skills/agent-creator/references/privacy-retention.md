# Privacy and evidence retention

Agent Creator uses the versioned `agent-creator.privacy-policy/v1` policy. It is
implemented by `dist/scripts/privacy_policy.js`; applications should import the
same redactor rather than maintain separate secret patterns.

## Classifications

- **Metadata**: counts, timestamps, public identifiers, hashes, declared secret
  *names*, and aggregate verdicts. This may enter heartbeats and receipts only
  after central redaction. Never record a credential value.
- **Content**: prompts, responses, transcripts, user notes, and source excerpts.
  Content is not metadata merely because it is inside JSON.
- **Protected artifacts**: credentials and proprietary or access-controlled
  content. Store bytes in the local protected store and put only the
  `sha256:<digest>` protected reference in a manifest or receipt.

The redactor safely parses valid raw JSON before recursively redacting its
structure; malformed JSON, YAML, and ordinary text receive conservative pattern
redaction. It covers password/token/API-key/authorization fields, arbitrary
`*_CREDENTIAL` assignments, AWS access keys, GitHub tokens, common live/test
keys, bearer/basic credentials, private keys, `/home/<user>` paths, and
Windows/macOS user-home paths. Raw response payloads are never used as a
fallback output. Required secret
names such as `CI_TOKEN` may be recorded; values may not. Redaction is defense
in depth, not authorization.

## Retention and deletion

Evaluation transcript retention is independent from aggregate evidence:

```bash
agent-creator evaluate ... --transcript-retention delete-after-aggregate
```

This omits `transcript.json` while preserving response-derived aggregate
artifacts, timing, grading inputs, and the run summary. The default `retain`
keeps transcripts for local debugging. Choose explicitly for proprietary work.

Protected objects have an expiry and a content-addressed reference. Immutable
metadata is bound by its canonical SHA-256 hash to an append-only hash-chained
metadata ledger. Deletion records use a separate sequence-numbered,
previous-hash-linked ledger. Each ledger has an atomically replaced, fsynced,
mode-`0600` durable head checkpoint; verification rejects changed records,
broken links, and truncation relative to that checkpoint. `status` and
`readProtectedArtifact` treat expired, missing, malformed, integrity-failed,
symlinked, or deleted evidence as unavailable. `delete` removes bytes and appends a
non-content tombstone with affected claim IDs marked `unavailable`; it never
pretends that a claim remains supported after its evidence is gone. Tombstones are append-only at the application layer and chain verification is
fail-closed. The offline design intentionally has no signing secret: hashes and
the durable head detect accidental or partial modification, but cannot stop an
attacker who can rewrite both ledger and checkpoint. They also do not resist a
filesystem administrator, rollback of the entire workspace, disk loss, or a
compromised process. Put the checkpoint on access-controlled durable storage
(or externally anchor/sign its head) when those threats are in scope.

```bash
agent-creator privacy policy
agent-creator privacy redact 'Authorization: Bearer ...'
agent-creator privacy put --workspace "$RUN" --file transcript.json \
  --ttl-seconds 86400 --secret-name CI_TOKEN > protected-ref.json
agent-creator privacy status --workspace "$RUN" --ref protected-ref.json
agent-creator privacy delete --workspace "$RUN" --ref protected-ref.json \
  --reason 'retention elapsed' --claim claim-17
```

## Local and CI boundary

For local runs, place the workspace on a user-owned filesystem, keep protected
store directories mode `0700` and objects `0600`, avoid shared/synced folders,
and delete artifacts when the evaluation purpose ends. Filesystem permissions
do not protect against the same account or an administrator.

For CI, use an isolated runner and least-privilege job identity; inject secrets
from the CI secret store; do not echo values; restrict logs, caches, artifacts,
and fork/PR access; encrypt storage; and prevent untrusted jobs from reading a
protected workspace. Configure CI artifact expiry no later than the protected
reference expiry, disable caches for transcripts, and run deletion on success,
failure, cancellation, and scheduled cleanup. Tombstone logs may be retained
longer because they contain hashes and status rather than content, but still
require access control. A content hash proves identity, not confidentiality.
