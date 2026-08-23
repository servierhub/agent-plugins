# Trigger evaluation checklist

Read this reference when testing or optimizing Skill selection.

## Eval set

Create realistic `should_trigger` and difficult `should_not_trigger` queries. Include:

- explicit and implicit intent;
- formal, casual, abbreviated, and typo-bearing requests;
- multilingual requests while keeping the description English;
- close sibling capabilities;
- simple requests where loading the Skill adds no value;
- substantive requests where the Skill should clearly help.

Prefer at least 8–10 positive and 8–10 negative cases. Run each query multiple times when model variance matters.

## Metrics

Measure more than total accuracy:

- **precision:** relevant triggers / all triggers;
- **recall:** relevant triggers / all relevant requests;
- **F1:** balance of precision and recall;
- false positives by neighboring Skill;
- false negatives by intent category;
- variance across repeated runs and target models.

## Optimization

Keep train and held-out test cases separate. Select the best description by held-out performance, not training accuracy. Do not expand descriptions into multilingual keyword lists or examples from the eval set.

```bash
node dist/scripts/cli.js trigger-eval \
  --eval-set <trigger-eval.json> \
  --skill-path <skill-directory> \
  --runs-per-query 3
```

For iterative optimization, use the description-optimization reference linked directly from SKILL.md.

## Sibling overlap

Evaluate all nearby Skills on the same difficult negatives. A description is not acceptable when it improves recall by stealing requests that belong to a sibling.

## Completion checklist

- Positive and difficult-negative coverage is balanced.
- Precision, recall, and F1 are reported.
- Held-out results drive selection.
- Sibling overlap is inspected.
- Multilingual semantic discovery works without multilingual metadata.
- Trigger evidence is separate from behavioral output evidence.
