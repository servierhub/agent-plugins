# Test and evaluation evidence attestations

Hook Creator uses a DSSE envelope with a canonical in-toto Statement v1 payload. The payload type is application/vnd.in-toto+json and predicate type is https://openplugins.dev/attestation/hook-evidence/v1. The envelope schema is schemas/evidence-attestation.schema.json; semantic validation covers the decoded payload.

The statement binds one artifact subject, source revision/hash, result status/hash, evaluation manifest hash (required for evaluation), exact argv and integer exit code, canonical working directory, explicit environment, and issue/expiry times. Credential-like environment names are rejected. Never record secrets.

Issuer identity and trust policy are separate. Local evidence is unsigned, offline, state local, and trust low; it cannot authorize production. CI evidence has one Ed25519 signature. Production verification requires a separately supplied hook-attestation-trust-policy/v1 containing issuer id, keyid (SHA-256 of DER SPKI), and public_key_pem. Verification uses Node crypto and DSSE PAE offline. Keep private keys only in CI secret storage, pass a temporary PKCS#8 PEM path, delete it afterward, and never commit private keys or live secrets.

Commands:

    hook-creator attestation create evidence-spec.json evidence.dsse.json
    hook-creator attestation create evidence-spec.json evidence.dsse.json --private-key /temporary/key.pem
    hook-creator attestation verify evidence.dsse.json --policy local
    hook-creator attestation verify evidence.dsse.json --policy production --trust-policy trust-policy.json

Spec paths are relative to the spec; symlinks are rejected. Subject is {name,path}, source is {revision,path}, result is {status,path}, manifest is a path, command is an argv array, and environment is {platform,arch,node,variables}. Results distinguish local, ci-attested, invalid, expired, and untrusted-issuer. Freshness is enforced identically for local and CI evidence as `issued_at <= verification time < expires_at`: future-issued evidence is invalid and the exact expiry instant is expired. Production accepts only fresh, passing, zero-exit trusted CI evidence. Manual --tests-status is rejected in production.
