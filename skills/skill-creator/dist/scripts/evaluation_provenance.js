import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
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
export function listRunDirs(workspace) {
    const result = [];
    if (!isDirectory(workspace))
        return result;
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
    for (const name of ["outputs", "grading.json", "timing.json", "navigation.json"]) {
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
        ...coordinates,
    };
}
export function validateExecutionEvidence(workspace, expected) {
    const errors = [];
    const bindings = [];
    const digestParts = [];
    for (const runDir of listRunDirs(workspace)) {
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
        const fields = ["skill_source_sha256", "eval_plan_sha256", "scenario_sha256", "configuration", "run_index"];
        for (const field of fields)
            if (manifest[field] !== wanted[field])
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
    return { status: errors.length ? "blocked" : "complete", errors, evidence_sha256: compositeHash(digestParts), bindings };
}
