import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { aggregateJudgments, assertionHash, canonical as gradingCanonical, deterministicCheck, identityFields, invocationHash, normalizeAssertions, sha256 as gradingSha256, substantiveOverlap } from "./evaluator_grading.js";
export function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
export function compositeHash(parts) {
    const hash = createHash("sha256");
    for (const part of parts) {
        hash.update(part);
        hash.update("\0");
    }
    return hash.digest("hex");
}
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(value);
}
/** Hash an evidence mode from canonical JSON, independent of object key order. */
export function evidenceModeHash(mode) {
    return sha256(canonical(mode));
}
function rawPairSeed(binding, pairIndex) {
    return Number.parseInt(compositeHash([binding.skill_source_sha256, binding.eval_plan_sha256, binding.scenario_sha256, String(pairIndex)]).slice(0, 8), 16) >>> 0;
}
/** Derive a pair's execution order solely from its recorded unsigned 32-bit seed. */
export function pairedOrderFromSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new TypeError("pair seed must be an unsigned 32-bit integer");
    return seed % 2 === 0 ? ["with_skill", "baseline"] : ["baseline", "with_skill"];
}
/** Derive reproducible seeds whose parity alternates, preserving counterbalance. */
export function counterbalancedPairSeed(binding, pairIndex) {
    if (!Number.isInteger(pairIndex) || pairIndex <= 0)
        throw new TypeError("pair index must be a positive integer");
    const startingParity = rawPairSeed(binding, 1) & 1;
    const requiredParity = startingParity ^ ((pairIndex - 1) & 1);
    return ((rawPairSeed(binding, pairIndex) & 0xfffffffe) | requiredParity) >>> 0;
}
function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
function filesBelow(root, current = root) {
    if (!isDirectory(current))
        return existsSync(current) ? [current] : [];
    const files = [];
    for (const name of readdirSync(current).sort())
        files.push(...filesBelow(root, join(current, name)));
    return files;
}
/** A stable content hash that includes relative names and bytes for directories. */
export function artifactHash(path) {
    if (!existsSync(path))
        return "missing";
    if (!isDirectory(path))
        return sha256(readFileSync(path));
    return compositeHash(filesBelow(path).sort().flatMap(file => [relative(path, file).replaceAll("\\", "/"), readFileSync(file)]));
}
export class ExecutionPlanError extends Error {
    code;
    constructor(code, message) { super(message); this.name = "ExecutionPlanError"; this.code = code; }
}
export function expectedRunDirs(workspace) {
    const absolute = resolve(workspace);
    if (!isDirectory(absolute))
        return [];
    const result = [], ids = new Set();
    for (const evalName of readdirSync(absolute).filter(name => name.startsWith("eval-")).sort()) {
        const evalDir = join(absolute, evalName);
        if (!isDirectory(evalDir))
            continue;
        const metadata = loadJson(join(evalDir, "eval_metadata.json"));
        if (!metadata || !["fast", "standard", "release"].includes(metadata.run_profile))
            throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " has invalid or missing run_profile");
        const profilePairs = { fast: 1, standard: 3, release: 5 };
        if (!Number.isInteger(metadata.requested_pairs) || metadata.requested_pairs !== profilePairs[metadata.run_profile])
            throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " requested_pairs must exactly match run_profile");
        const id = String(metadata.eval_id ?? "");
        if (!id || ids.has(id))
            throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " has missing or duplicate eval_id " + id);
        ids.add(id);
        const schedules = metadata.execution_schedule;
        if (!Array.isArray(schedules) || schedules.length !== metadata.requested_pairs)
            throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " execution_schedule must contain exactly requested_pairs entries");
        const binding = metadata.execution_binding;
        if (!binding || typeof binding !== "object")
            throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " execution_binding is missing");
        const expectedConfigs = ["with_skill", metadata.baseline_configuration ?? (isDirectory(join(evalDir, "old_skill")) ? "old_skill" : "without_skill")];
        for (let index = 1; index <= metadata.requested_pairs; index++) {
            const scheduled = schedules[index - 1];
            const scheduleBinding = { skill_source_sha256: String(binding.skill_source_sha256), eval_plan_sha256: String(binding.eval_plan_sha256), scenario_sha256: String(binding.scenario_sha256) };
            const expectedSeed = counterbalancedPairSeed(scheduleBinding, index);
            const expectedOrder = pairedOrderFromSeed(expectedSeed);
            if (!scheduled || scheduled.pair_index !== index || scheduled.seed !== expectedSeed || JSON.stringify(scheduled.order) !== JSON.stringify(expectedOrder))
                throw new ExecutionPlanError("invalid-evaluation-plan", evalName + " execution_schedule is not a strict total deterministic schedule at pair " + index);
            for (const config of expectedConfigs)
                result.push(join(evalDir, config, "run-" + index));
        }
    }
    return result;
}
export function listRunDirs(workspace) {
    const result = [];
    const absolute = resolve(workspace);
    // Archives retain the original eval-* layout for auditability, but are never
    // active evaluation inputs even when a caller points discovery at one.
    if (absolute.split(sep).includes(".full-eval-archive") || !isDirectory(absolute))
        return result;
    workspace = absolute;
    for (const evalName of readdirSync(workspace).filter(name => name.startsWith("eval-")).sort()) {
        const evalDir = join(workspace, evalName);
        if (!isDirectory(evalDir))
            continue;
        for (const configuration of readdirSync(evalDir).sort()) {
            const configDir = join(evalDir, configuration);
            if (!isDirectory(configDir) || !(configuration.includes("with_skill") || configuration.includes("old_skill") || configuration.includes("without_skill")))
                continue;
            const runs = readdirSync(configDir).filter(name => /^run-\d+$/.test(name) && isDirectory(join(configDir, name))).sort();
            result.push(...(runs.length ? runs.map(name => join(configDir, name)) : [configDir]));
        }
    }
    return result;
}
export function runCoordinates(runDir) {
    const runName = basename(runDir);
    if (/^run-\d+$/.test(runName))
        return { configuration: basename(dirname(runDir)), run_index: Number(runName.slice(4)) };
    return { configuration: basename(runDir), run_index: 1 };
}
export function evidenceArtifactHashes(runDir) {
    const result = {};
    for (const name of ["outputs", "grading.json", "timing.json", "navigation.json", "transcript.json", "deterministic-evidence.json", "grader-evidence", "manual-import-manifest.json"]) {
        const path = join(runDir, name);
        if (existsSync(path) && (name !== "outputs" || isDirectory(path)))
            result[name] = artifactHash(path);
    }
    return result;
}
function loadJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return null;
    }
}
export function expectedExecutionBinding(runDir) {
    const evalDir = dirname(dirname(runDir));
    const metadata = loadJson(join(evalDir, "eval_metadata.json"));
    const context = metadata?.execution_binding;
    if (!context || typeof context !== "object")
        return null;
    const coordinates = runCoordinates(runDir);
    return {
        skill_source_sha256: String(context.skill_source_sha256 ?? ""),
        eval_plan_sha256: String(context.eval_plan_sha256 ?? ""),
        scenario_sha256: String(context.scenario_sha256 ?? ""),
        ...(context.evidence_mode_sha256 ? { evidence_mode_sha256: String(context.evidence_mode_sha256) } : {}),
        ...(context.grading_plan_sha256 ? { grading_plan_sha256: String(context.grading_plan_sha256) } : {}),
        ...coordinates,
        ...(Array.isArray(metadata?.execution_schedule) ? (() => { const scheduled = metadata.execution_schedule.find((item) => item.pair_index === coordinates.run_index); if (!scheduled)
            return {}; const baseline = coordinates.configuration.includes("old_skill") || coordinates.configuration.includes("without_skill"); const role = baseline ? "baseline" : "with_skill"; return { pair_index: scheduled.pair_index, seed: scheduled.seed, order: scheduled.order, order_position: scheduled.order.indexOf(role) + 1 }; })() : {}),
    };
}
function metadataMode(runDir) { const metadata = loadJson(join(dirname(dirname(runDir)), "eval_metadata.json")); const mode = metadata?.evidence_mode; return { planned: String(mode?.planned ?? "manual-governed-import"), hash: evidenceModeHash(mode ?? { schema_version: 1, planned: "manual-governed-import" }) }; }
function semanticEvidence(runDir) { const root = join(runDir, "grader-evidence"); if (!isDirectory(root))
    return []; return readdirSync(root).filter(name => name.endsWith(".json")).sort().map(name => loadJson(join(root, name))).filter(Boolean); }
function same(a, b) { return gradingCanonical(a) === gradingCanonical(b); }
function verifyEvaluatorGrade(runDir, label, metadata, manifest, grading, errors) {
    const outputPath = join(runDir, "outputs", "result.txt"), outputBytes = existsSync(outputPath) ? readFileSync(outputPath) : Buffer.alloc(0), output = outputBytes.toString("utf8");
    const assertions = normalizeAssertions(Array.isArray(metadata?.assertions) ? metadata.assertions : []), outputHash = gradingSha256(outputBytes);
    const assertionSetHash = gradingSha256(canonical(assertions)), configuration = runCoordinates(runDir).configuration;
    const sourceHash = metadata?.source_bindings?.[configuration] ?? null, fixtureHash = String(metadata?.fixture_sha256 ?? "");
    const variantHash = gradingSha256(JSON.stringify({ configuration, source_sha256: sourceHash, fixture_sha256: fixtureHash }));
    const plan = metadata?.grading_plan, planned = Array.isArray(plan?.graders) ? plan.graders : [];
    if (!plan || metadata?.execution_binding?.grading_plan_sha256 !== gradingSha256(gradingCanonical(plan)))
        errors.push(label + " immutable grading plan binding is invalid");
    if (planned.length < 2 || new Set(planned.map((g) => g.id)).size !== planned.length || planned.some((g) => g.blinded !== true))
        errors.push(label + " immutable grading plan requires at least two distinct blinded explicit graders");
    for (const [field, value] of Object.entries({ assertion_set_sha256: assertionSetHash, variant_sha256: variantHash, output_sha256: outputHash })) {
        if (grading?.[field] !== value)
            errors.push(label + " grading " + field + " is not derived from authoritative scaffold/output");
        if (manifest?.grading_binding?.[field] !== value)
            errors.push(label + " execution grading " + field + " is not derived from authoritative scaffold/output");
    }
    const claimed = Array.isArray(grading?.expectations) ? grading.expectations : [], derived = [], allInvocationIds = [];
    const timing = loadJson(join(runDir, "timing.json")), usageRows = Array.isArray(timing?.grader_usage) ? timing.grader_usage : [];
    for (const assertion of assertions) {
        const ah = assertionHash(assertion), common = { id: assertion.id, version: assertion.version, classification: assertion.classification, text: assertion.criterion, criterion: assertion.criterion, assertion_sha256: ah, variant_sha256: variantHash, output_sha256: outputHash };
        if (assertion.classification === "deterministic") {
            const checked = deterministicCheck(assertion, output);
            derived.push({ ...common, verdict: checked.verdict, passed: checked.verdict === "pass", evidence: checked.evidence });
            continue;
        }
        const files = semanticEvidence(runDir).filter(j => j.assertion_sha256 === ah), valid = [];
        if (files.length !== planned.length)
            errors.push(label + " semantic assertion " + assertion.id + " evidence set differs from the immutable planned grader set");
        for (const grader of planned) {
            const matches = files.filter(j => j.grader_id === grader.id);
            if (matches.length !== 1) {
                errors.push(label + " semantic assertion " + assertion.id + " requires exactly one judgment from planned grader " + grader.id);
                continue;
            }
            const j = matches[0], identity = { id: String(grader.id), model: String(grader.model), provider: String(grader.provider ?? "unspecified"), command: Array.isArray(grader.command) ? grader.command.map(String) : [], config: grader.config ?? {}, invocation_id: String(j.invocation_id ?? ""), blinded: grader.blinded !== false }, fields = identityFields(identity);
            const bound = j.assertion_sha256 === ah && j.variant_sha256 === variantHash && j.output_sha256 === outputHash && j.grader_identity_sha256 === fields.grader_identity_sha256 && j.grader_config_sha256 === fields.grader_config_sha256 && j.invocation_nonce_sha256 === gradingSha256(identity.invocation_id) && j.grader_invocation_sha256 === invocationHash({ assertionSha256: ah, variantSha256: variantHash, outputSha256: outputHash }, fields);
            const quote = typeof j.evidence_quote === "string" ? j.evidence_quote : "", evidence = quote.length > 0 && output.includes(quote) && substantiveOverlap(assertion.criterion, quote) && !/\b(?:pass(?:es|ed|ing)?|fail(?:s|ed|ing)?|score[sd]?|grad(?:e|es|ed|ing)|verdict|criterion|assertion)\b/i.test(quote);
            let raw = null;
            try {
                const match = /\{[\s\S]*\}/.exec(String(j.raw_response ?? ""));
                raw = match ? JSON.parse(match[0]) : null;
            }
            catch { }
            const rawMatches = raw && raw.verdict === j.verdict && raw.evidence_quote === j.evidence_quote && raw.rationale === j.rationale;
            const usageMatches = usageRows.some((row) => row.grader_id === grader.id && row.model === grader.model && same(row.usage, j.usage));
            if (!bound || j.blinded !== true || !identity.invocation_id || !evidence || j.valid_evidence !== true || !["pass", "fail", "inconclusive"].includes(j.verdict) || !rawMatches || !usageMatches) {
                errors.push(label + " invalid bound/blinded/substantive judgment or usage for " + assertion.id + " from " + grader.id);
                continue;
            }
            allInvocationIds.push(j.invocation_id);
            valid.push(j);
        }
        if (new Set(valid.map(j => j.invocation_id)).size !== valid.length)
            errors.push(label + " semantic assertion " + assertion.id + " reuses grader invocation IDs");
        const aggregate = aggregateJudgments(valid.length === planned.length ? valid : []);
        derived.push({ ...common, ...aggregate, passed: aggregate.verdict === "pass", evidence: valid.map(j => j.evidence_quote), judgments: valid, ...(valid.length ? {} : { reason: "Every planned explicit grader must provide one valid judgment" }) });
    }
    if (new Set(allInvocationIds).size !== allInvocationIds.length)
        errors.push(label + " grader invocation IDs must be distinct across semantic judgments");
    if (claimed.length !== derived.length)
        errors.push(label + " grading expectations do not match planned assertions");
    for (let i = 0; i < derived.length; i++) {
        const a = claimed[i], d = derived[i];
        for (const key of ["id", "version", "classification", "assertion_sha256", "variant_sha256", "output_sha256", "verdict", "passed"])
            if (!a || !same(a[key], d[key]))
                errors.push(label + " expectation " + (d.id ?? i) + " " + key + " is not independently derived");
    }
    const summary = { passed: derived.filter(x => x.verdict === "pass").length, failed: derived.filter(x => x.verdict === "fail").length, inconclusive: derived.filter(x => x.verdict === "inconclusive").length, total: derived.length };
    const complete = { ...summary, pass_rate: summary.total ? summary.passed / summary.total : 0, human_review: summary.inconclusive > 0 };
    for (const [key, value] of Object.entries(complete))
        if (!same(grading?.summary?.[key], value))
            errors.push(label + " grading summary " + key + " is not independently derived");
}
function verifyManualImport(runDir, label, metadata, manifest, errors) { const imported = loadJson(join(runDir, "manual-import-manifest.json")); if (!imported || imported.schema_version !== 1 || imported.governed !== true || typeof imported.signer !== "string" || !imported.signer || typeof imported.signature !== "string" || !imported.signature || imported.evidence_mode_sha256 !== metadata?.execution_binding?.evidence_mode_sha256 || imported.scenario_sha256 !== metadata?.execution_binding?.scenario_sha256)
    errors.push(label + " manual evidence requires a governed signed import manifest bound to the scaffold"); if (manifest?.executor?.adapter !== "manual-import")
    errors.push(label + " manual import cannot relabel its executor as Goose"); }
export function validateExecutionEvidence(workspace, expected) {
    const errors = [];
    const bindings = [];
    const digestParts = [];
    let planned;
    try {
        planned = expectedRunDirs(workspace);
    }
    catch (error) {
        errors.push(error.message);
        return { status: "blocked", errors, evidence_sha256: compositeHash([]), bindings };
    }
    for (const runDir of planned) {
        if (!isDirectory(runDir)) {
            errors.push(relative(workspace, runDir).replaceAll("\\", "/") + " missing planned run directory");
            continue;
        }
        const label = relative(workspace, runDir).replaceAll("\\", "/");
        const manifestPath = join(runDir, "execution-evidence.json");
        const manifest = loadJson(manifestPath);
        const wanted = expectedExecutionBinding(runDir);
        if (!manifest) {
            errors.push(`${label}/execution-evidence.json missing or invalid`);
            continue;
        }
        if (!wanted) {
            errors.push(`${label} generated eval metadata has no execution binding`);
            continue;
        }
        const fields = ["skill_source_sha256", "eval_plan_sha256", "scenario_sha256", "evidence_mode_sha256", "grading_plan_sha256", "configuration", "run_index", "pair_index", "seed", "order", "order_position"];
        for (const field of fields)
            if (JSON.stringify(manifest[field]) !== JSON.stringify(wanted[field]))
                errors.push(`${label} execution evidence ${field} does not match the current plan`);
        if (manifest.schema_version !== "1.0")
            errors.push(`${label} execution evidence schema_version must be 1.0`);
        if (expected?.skill_source_sha256 && manifest.skill_source_sha256 !== expected.skill_source_sha256)
            errors.push(`${label} execution evidence is from a different skill source`);
        if (expected?.eval_plan_sha256 && manifest.eval_plan_sha256 !== expected.eval_plan_sha256)
            errors.push(`${label} execution evidence is from a different eval plan`);
        const actual = evidenceArtifactHashes(runDir);
        for (const required of ["outputs", "grading.json", "timing.json"])
            if (!actual[required])
                errors.push(`${label}/${required} missing`);
        const grading = loadJson(join(runDir, "grading.json")), mode = metadataMode(runDir), executor = manifest.executor;
        if (manifest.evidence_mode_sha256 !== mode.hash)
            errors.push(`${label} evidence mode does not match the immutable scaffold plan`);
        const metadata = loadJson(join(dirname(dirname(runDir)), "eval_metadata.json"));
        if (mode.planned === "goose-evaluator" && executor?.adapter !== "goose")
            errors.push(`${label} planned Goose execution cannot be downgraded by deleting or changing its executor marker`);
        if (mode.planned === "manual-governed-import")
            verifyManualImport(runDir, label, metadata, manifest, errors);
        if (mode.planned === "goose-evaluator") {
            if (grading?.schema_version !== 2 || grading?.authority !== "evaluator" || manifest.grading_binding?.authority !== "evaluator")
                errors.push(`${label} production Goose execution requires evaluator-owned grading`);
            else
                verifyEvaluatorGrade(runDir, label, metadata, manifest, grading, errors);
        }
        if (!manifest.artifact_sha256 || typeof manifest.artifact_sha256 !== "object")
            errors.push(`${label} execution evidence artifact hashes missing`);
        else {
            const keys = [...new Set([...Object.keys(actual), ...Object.keys(manifest.artifact_sha256)])].sort();
            for (const key of keys)
                if (manifest.artifact_sha256[key] !== actual[key])
                    errors.push(`${label}/${key} content hash mismatch`);
        }
        bindings.push(manifest);
        digestParts.push(label, readFileSync(manifestPath));
        for (const [name, hash] of Object.entries(actual).sort(([a], [b]) => a.localeCompare(b)))
            digestParts.push(`${label}/${name}`, hash);
    }
    const byPair = new Map();
    for (const binding of bindings) {
        const key = String(binding.scenario_sha256) + ":" + String(binding.pair_index);
        const group = byPair.get(key) ?? [];
        group.push(binding);
        byPair.set(key, group);
    }
    for (const [key, pair] of byPair) {
        if (pair.length !== 2) {
            errors.push(key + " expected exactly two paired executions");
            continue;
        }
        const [a, b] = pair, ae = a.pair_equivalence, be = b.pair_equivalence;
        for (const field of ["model", "tools", "fixture_sha256", "timeout_seconds", "max_turns"])
            if (JSON.stringify(ae?.[field]) !== JSON.stringify(be?.[field]))
                errors.push(key + " pair equivalence mismatch for " + field);
    }
    return { status: errors.length ? "blocked" : "complete", errors, evidence_sha256: compositeHash(digestParts), bindings };
}
