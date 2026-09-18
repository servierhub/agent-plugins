# Decision-oriented evaluation review

The review viewer derives a canonical Review IR from run metadata, grading, timing, outputs, and benchmark artifacts. Static and live modes call the same IR builder and HTML renderer, so they have identical semantics.

The initial view answers the decision: candidate and baseline IDs, verdict, paired effect size, variance/95% confidence, critical regressions, time/token/cost evidence, missing evidence, and required human action. A **blocked** or **inconclusive** result is never styled or described as passing.

The failed-scenario filter means candidate failure or regression; baseline-only weakness is labeled separately and does not enter that filter. The disagreement filter includes candidate-versus-baseline differences as well as repeated-run or grader/model differences. Use these filters to triage evidence. Every decision summary, critical regression, missing-evidence item, and key metric links through a stable anchor to its scenario, run, assertion, or provenance evidence. Expand scenarios for grades, raw outputs, and provenance. Missing resource measurements remain “Unavailable”; the viewer does not infer them.

The self-contained HTML has no remote dependencies. Embedded artifact text is JSON-escaped and rendered with text nodes. A restrictive CSP permits only embedded images, local feedback requests, inline styles, and the embedded viewer script. Keyboard users can tab through controls and native disclosure widgets; headings, labels, live regions, and status text support screen readers.

## Commands

```bash
# live
node dist/eval-viewer/generate_review.js WORKSPACE --benchmark WORKSPACE/benchmark.json
# static
node dist/eval-viewer/generate_review.js WORKSPACE --benchmark WORKSPACE/benchmark.json --static WORKSPACE/review.html
```
