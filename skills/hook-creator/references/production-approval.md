# Identity-bound production approval v1

The hook-production-approval/v1 record is offline and append-only. Passing automation creates only a pending request. Human review, approval, rejection, expiry, and supersession identify a reviewer by stable ID and RBAC-ready role, include timestamp, rationale, accepted risks, and waivers, and carry an Ed25519 signature. Trust entries bind ID, role, key fingerprint, and allowed actions. Anonymous review cannot satisfy production approval.

The request binds SHA-256 hashes for artifact, archive, manifest, benchmark, test, and review. Any changed binding is stale. Rejection is durable and reasoned; expiration and supersession are signed terminal history. Optimistic revision/content checks and an exclusive lock reject concurrent writers.

Deploy/install must call approval consume with purpose deploy or install, trust policy, and exact current bindings. Consume is read-only and cannot create approval.

Trust policy: {"version":"hook-approval-trust-policy/v1","reviewers":[{"id":"alice@example.com","role":"release-approver","keyid":"<sha256-spki>","public_key_pem":"<PEM>","actions":["review","approve","reject","expire","supersede"]}]}
