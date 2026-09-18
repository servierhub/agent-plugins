#!/usr/bin/env node
/** Builds one decision-oriented review IR for both static and live viewers. */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname, extname, resolve, basename } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "node:http";
const HERE = dirname(new URL(import.meta.url).pathname);
const TEXT = new Set([".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx", ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sql", ".r", ".toml", ".svg"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf" };
const isDir = (p) => { try {
    return statSync(p).isDirectory();
}
catch {
    return false;
} };
const isFile = (p) => { try {
    return statSync(p).isFile();
}
catch {
    return false;
} };
const json = (p) => { try {
    return JSON.parse(readFileSync(p, "utf8"));
}
catch {
    return null;
} };
function embedFile(path, root) {
    const ext = extname(path).toLowerCase(), name = basename(path), provenance = relative(root, path).split("\\").join("/");
    if (TEXT.has(ext)) {
        try {
            return { name, type: "text", content: readFileSync(path, "utf8"), provenance };
        }
        catch {
            return { name, type: "error", content: "(Error reading file)", provenance };
        }
    }
    try {
        const data = readFileSync(path).toString("base64");
        return IMAGE.has(ext) ? { name, type: "image", data_uri: `data:${MIME[ext]};base64,${data}`, provenance } : { name, type: "download", data_uri: `data:${MIME[ext] || "application/octet-stream"};base64,${data}`, provenance };
    }
    catch {
        return { name, type: "error", content: "(Error reading file)", provenance };
    }
}
function configuration(root, runDir) { const parts = relative(root, runDir).split(/[\\/]/); return parts.find(x => /^(with_skill|without_skill|new_skill|old_skill|candidate|baseline)$/i.test(x)) || parts.at(-2) || "unknown"; }
function buildRun(root, runDir) {
    const metadataCandidates = [join(runDir, "eval_metadata.json"), join(dirname(runDir), "eval_metadata.json"), join(dirname(dirname(runDir)), "eval_metadata.json")];
    const metadataPath = metadataCandidates.find(existsSync) || null, metadata = metadataPath ? json(metadataPath) : null;
    const gradingCandidates = [join(runDir, "grading.json"), join(dirname(runDir), "grading.json")], gradingPath = gradingCandidates.find(existsSync) || null;
    const timingCandidates = [join(runDir, "timing.json"), join(dirname(runDir), "timing.json")], timingPath = timingCandidates.find(existsSync) || null;
    const outputsDir = join(runDir, "outputs"), outputs = isDir(outputsDir) ? readdirSync(outputsDir).sort().filter(n => isFile(join(outputsDir, n)) && !new Set(["transcript.md", "user_notes.md", "metrics.json"]).has(n)).map(n => embedFile(join(outputsDir, n), root)) : [];
    const scenario = String(metadata?.eval_id ?? relative(root, runDir).split(/[\\/]/).find(x => x.startsWith("eval-")) ?? "unknown");
    return { id: relative(root, runDir).split(/[\\/]/).join("-"), scenario_id: scenario, configuration: configuration(root, runDir), prompt: String(metadata?.prompt ?? "(No prompt found)"), outputs, grading: gradingPath ? json(gradingPath) : null, timing: timingPath ? json(timingPath) : null, provenance: { metadata: metadataPath ? relative(root, metadataPath) : null, grading: gradingPath ? relative(root, gradingPath) : null, timing: timingPath ? relative(root, timingPath) : null, run: relative(root, runDir) } };
}
function findRuns(root) { const out = []; function walk(dir) { if (!isDir(dir))
    return; if (isDir(join(dir, "outputs"))) {
    out.push(buildRun(root, dir));
    return;
} for (const n of readdirSync(dir).sort())
    if (!new Set(["node_modules", ".git", "skill", "inputs"]).has(n) && isDir(join(dir, n)))
        walk(join(dir, n)); } walk(root); return out.sort((a, b) => a.scenario_id.localeCompare(b.scenario_id) || a.id.localeCompare(b.id)); }
const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const mean = (obj, key) => num(obj?.[key]?.mean);
function configIds(benchmark, runs) { const ids = Object.keys(benchmark?.run_summary || {}).filter(x => x !== "delta"); for (const r of runs)
    if (!ids.includes(r.configuration))
        ids.push(r.configuration); const candidate = ids.find(x => /with_skill|new_skill|candidate/i.test(x)) ?? ids[0] ?? null; const baseline = ids.find(x => /without_skill|old_skill|baseline/i.test(x)) ?? ids.find(x => x !== candidate) ?? null; return { candidate, baseline }; }
function passedMap(run) { return new Map((run.grading?.expectations || []).map((x) => [String(x.text ?? "Unnamed assertion"), Boolean(x.passed)])); }
const anchorToken = (value) => Buffer.from(value, "utf8").toString("hex") || "empty";
const scenarioAnchor = (id) => `scenario-${anchorToken(id)}`;
const runAnchor = (run) => `run-${anchorToken(run.id)}`;
const assertionAnchor = (run, label) => `${runAnchor(run)}-assertion-${anchorToken(label)}`;
function runFailed(run) { const expectations = run.grading?.expectations; return Array.isArray(expectations) ? expectations.some((x) => x.passed === false) : (run.grading?.summary?.failed ?? 0) > 0; }
/** Includes candidate-vs-baseline, repeated-run, and grader/model outcome disagreements. */
function scenarioDisagreement(runs) {
    const outcomes = new Map(), signatures = new Set();
    for (const r of runs) {
        const assertions = [...passedMap(r)].sort(([a], [b]) => a.localeCompare(b));
        signatures.add(JSON.stringify(assertions));
        for (const [label, passed] of assertions) {
            const values = outcomes.get(label) || new Set();
            values.add(passed);
            outcomes.set(label, values);
        }
    }
    return signatures.size > 1 || [...outcomes.values()].some(values => values.size > 1);
}
export function buildReviewIR(workspace, skillName, benchmark, previous = {}) {
    const runs = findRuns(workspace), ids = configIds(benchmark, runs), summary = benchmark?.run_summary || {}, delta = summary.delta || {}, paired = delta.paired?.pass_rate || {};
    const critical = [];
    for (const scenario of new Set(runs.map(r => r.scenario_id))) {
        const cs = runs.filter(r => r.scenario_id === scenario && r.configuration === ids.candidate), bs = runs.filter(r => r.scenario_id === scenario && r.configuration === ids.baseline);
        for (let i = 0; i < Math.min(cs.length, bs.length); i++) {
            const c = passedMap(cs[i]), b = passedMap(bs[i]);
            for (const [label, bp] of b)
                if (bp && c.get(label) === false)
                    critical.push({ text: `${scenario}: ${label}`, href: `#${assertionAnchor(cs[i], label)}` });
        }
    }
    const missing = [];
    const miss = (text, href = "#provenance") => missing.push({ text, href });
    if (!benchmark)
        miss("benchmark.json is missing or invalid");
    if (!ids.candidate)
        miss("candidate configuration is missing", "#scenario-evidence");
    if (!ids.baseline)
        miss("baseline configuration is missing", "#scenario-evidence");
    const noGrade = runs.find(r => !r.grading);
    if (noGrade)
        miss("one or more runs have no valid grading.json", `#${runAnchor(noGrade)}`);
    const effect = num(paired.mean) ?? (() => { const v = Number.parseFloat(delta.pass_rate); return Number.isFinite(v) ? v : null; })();
    const ci = paired.confidence_interval_95 && num(paired.confidence_interval_95.lower) !== null && num(paired.confidence_interval_95.upper) !== null ? { lower: paired.confidence_interval_95.lower, upper: paired.confidence_interval_95.upper } : null;
    if (!ci)
        miss("paired 95% confidence interval is unavailable");
    const metricDefs = [["pass_rate", "rate"], ["time_seconds", "seconds"], ["tokens", "tokens"], ["cost", "cost"]];
    const metrics = metricDefs.map(([id, unit]) => { const candidate = mean(summary[ids.candidate || ""], id), baseline = mean(summary[ids.baseline || ""], id); return { id, candidate, baseline, delta: candidate !== null && baseline !== null ? candidate - baseline : null, unit, evidence_href: "#provenance-benchmark" }; });
    for (const m of metrics.filter(x => x.id !== "pass_rate" && x.candidate === null))
        miss(`${m.id} evidence is unavailable`, m.evidence_href);
    let verdict = "inconclusive";
    if (!ids.candidate || !ids.baseline || runs.some(r => !r.grading) || !benchmark)
        verdict = "blocked";
    else if (critical.length || effect !== null && effect < 0)
        verdict = "fail";
    else if (effect !== null && effect > 0 && ci && ci.lower > 0)
        verdict = "pass";
    const action = verdict === "pass" ? "Confirm the evidence is representative, then accept or request another evaluation." : verdict === "fail" ? "Reject or revise the candidate; resolve every critical regression before acceptance." : verdict === "blocked" ? "Provide the missing evidence before making a decision." : "Run more paired samples or make an explicit risk-acceptance decision; do not treat this result as a pass.";
    const scenarios = [...new Set(runs.map(r => r.scenario_id))].map(id => { const sr = runs.filter(r => r.scenario_id === id), candidateRuns = sr.filter(r => r.configuration === ids.candidate), baselineRuns = sr.filter(r => r.configuration === ids.baseline); return { id, anchor: scenarioAnchor(id), prompt: sr[0]?.prompt || "", failed: candidateRuns.some(runFailed), baseline_weakness: baselineRuns.some(runFailed), disagreement: scenarioDisagreement(sr), runs: sr }; });
    const decisionHref = critical[0]?.href ?? missing[0]?.href ?? "#provenance-benchmark";
    return { schema_version: "1.0", skill_name: skillName, generated_at: String(benchmark?.metadata?.timestamp ?? "unavailable"), candidate_id: ids.candidate, baseline_id: ids.baseline, decision: { verdict, effect_size: effect, confidence_95: ci, variance: num(paired.stddev), critical_regressions: [...new Map(critical.map(x => [`${x.text}|${x.href}`, x])).values()], missing_evidence: [...new Map(missing.map(x => [`${x.text}|${x.href}`, x])).values()], required_human_action: action, evidence_href: decisionHref }, metrics, scenarios, provenance: { benchmark: benchmark ? "benchmark.json" : null, workspace: basename(workspace) }, previous_feedback: previous };
}
function safeJson(value) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
export function generateHtml(ir) { return readFileSync(join(HERE, "viewer.html"), "utf8").replace("/*__EMBEDDED_DATA__*/", `const REVIEW_IR=${safeJson(ir)};`); }
function previousFeedback(path) { if (!path)
    return {}; const data = json(join(resolve(path), "feedback.json")); return Object.fromEntries((data?.reviews || []).filter((x) => x.feedback).map((x) => [String(x.run_id), String(x.feedback)])); }
function loadBenchmark(path) { return path && existsSync(path) ? json(path) : null; }
async function main() { const { positionals, values } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { port: { type: "string", short: "p", default: "3117" }, "skill-name": { type: "string", short: "n" }, "previous-workspace": { type: "string" }, benchmark: { type: "string" }, static: { type: "string", short: "s" } } }); const arg = positionals[0]; if (!arg) {
    console.error("usage: generate_review.js <workspace> [--benchmark FILE] [--static FILE]");
    process.exit(2);
} const workspace = resolve(arg); if (!isDir(workspace)) {
    console.error(`Error: ${workspace} is not a directory`);
    process.exit(1);
} const skill = String(values["skill-name"] || basename(workspace).replace("-workspace", "")), bp = values.benchmark ? resolve(String(values.benchmark)) : existsSync(join(workspace, "benchmark.json")) ? join(workspace, "benchmark.json") : null, prev = previousFeedback(values["previous-workspace"]), feedback = join(workspace, "feedback.json"); const render = () => generateHtml(buildReviewIR(workspace, skill, loadBenchmark(bp), prev)); if (values.static) {
    const out = resolve(String(values.static));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, render());
    console.log(`Static viewer written to: ${out}`);
    return;
} const server = createServer((req, res) => { if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const body = Buffer.from(render());
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
    res.end(body);
    return;
} if (req.url === "/api/feedback" && req.method === "GET") {
    const body = existsSync(feedback) ? readFileSync(feedback) : Buffer.from("{}");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
} if (req.url === "/api/feedback" && req.method === "POST") {
    const chunks = [];
    req.on("data", x => chunks.push(x));
    req.on("end", () => { try {
        const body = Buffer.concat(chunks);
        if (body.length > 1024 * 1024)
            throw Error("feedback exceeds 1 MiB");
        const data = JSON.parse(body.toString("utf8"));
        if (!Array.isArray(data?.reviews))
            throw Error("reviews array required");
        writeFileSync(feedback, JSON.stringify(data, null, 2) + "\n");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
    }
    catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
    } });
    return;
} res.writeHead(404); res.end(); }); const port = Number(values.port); server.listen(port, "127.0.0.1", () => console.log(`Review viewer: http://127.0.0.1:${port}`)); }
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
    main().catch(e => { console.error(e?.message || e); process.exit(1); });
