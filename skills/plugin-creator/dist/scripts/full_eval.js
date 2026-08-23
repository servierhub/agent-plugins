import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateAgentPluginSchema } from "./validate_agent_plugin_schema.js";
import { validate } from "./validate_goose_plugin.js";
import { verifyPlugin } from "./verify_plugin_gates.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const q = (value) => JSON.stringify(value);
function directories(path) { return existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : []; }
function packagePlugin(root, archive) { return spawnSync(process.execPath, [join(HERE, "package_goose_plugin.js"), root, archive], { encoding: "utf8" }); }
export function fullEval(options) {
    const root = resolve(options.pluginPath), workspace = resolve(options.workspace ?? join(root, "evaluations", "plugin"));
    const integration = resolve(options.integration ?? join(workspace, "integration"));
    const manifest = (() => { try {
        return JSON.parse(requireText(join(root, "plugin.json")));
    }
    catch {
        return null;
    } })();
    const name = manifest?.name ?? basename(root), archive = resolve(options.archive ?? join(workspace, name + ".zip"));
    const skills = directories(join(root, "skills"));
    const supplied = options.componentReceipts?.map(path => resolve(path)) ?? [];
    const receiptByName = new Map();
    for (const path of supplied) {
        const n = receiptName(path);
        if (n)
            receiptByName.set(n, path);
    }
    for (const skill of skills) {
        const path = join(workspace, "components", skill, "receipt.json");
        if (!receiptByName.has(skill) && existsSync(path))
            receiptByName.set(skill, path);
    }
    const skillCreatorCli = resolve(HERE, "../../../skill-creator/dist/scripts/cli.js");
    const components = skills.map(skill => { const skillPath = join(root, "skills", skill), receipt = receiptByName.get(skill) ?? join(workspace, "components", skill, "receipt.json"); return { name: skill, path: skillPath, receipt, available: existsSync(receipt), command: "node " + q(skillCreatorCli) + " full-eval " + q(skillPath) + " --workspace " + q(join(workspace, "components", skill)) + " --resume --format json" }; });
    const phases = [
        { name: "validate", status: "planned", detail: "validate Agent Plugins schema and Goose structure" },
        { name: "discover_components", status: "planned", detail: skills.length + " bundled skill(s)" },
        { name: "component_evaluation", status: "planned", detail: "consume component receipts; never invoke an LLM" },
        { name: "integration_evaluation", status: "planned", detail: "detect benchmark.json and review.html" },
        { name: "package", status: "planned", detail: archive },
        { name: "verify", status: "planned", detail: "invoke release verification gates" }
    ];
    const next_actions = [];
    if (options.dryRun)
        return envelope("planned", 0, root, workspace, archive, components, phases, next_actions, null, true, Boolean(options.resume));
    const schema = validateAgentPluginSchema(root), structural = validate(root), valid = schema.valid && !structural.errors.length;
    phases[0].status = valid ? "pass" : "fail";
    phases[0].detail = valid ? "validation passed" : "validation failed";
    phases[1].status = "pass";
    const missing = components.filter(c => !c.available);
    phases[2].status = missing.length ? "blocked" : "pass";
    phases[2].detail = missing.length ? missing.length + " component receipt(s) missing" : components.length + " component receipt(s) found";
    for (const component of missing)
        next_actions.push(component.command + " # writes " + component.receipt);
    const benchmark = join(integration, "benchmark.json"), review = join(integration, "review.html");
    const integrationMissing = [!existsSync(benchmark) ? benchmark : null, !existsSync(review) ? review : null].filter(Boolean);
    const reviewPassed = options.humanReview === "pass";
    phases[3].status = integrationMissing.length || !reviewPassed ? "blocked" : "pass";
    phases[3].detail = integrationMissing.length ? "missing: " + integrationMissing.join(", ") : !reviewPassed ? "human review pending" : "integration outputs and human review present";
    if (integrationMissing.length)
        next_actions.push("produce plugin integration outputs at " + q(benchmark) + " and " + q(review));
    if (!reviewPassed)
        next_actions.push("review " + q(review) + " then rerun with --human-review pass --resume");
    const prerequisites = valid && !missing.length && !integrationMissing.length && reviewPassed;
    if (prerequisites) {
        mkdirSync(dirname(archive), { recursive: true });
        const packaged = packagePlugin(root, archive);
        phases[4].status = packaged.status === 0 ? "pass" : "fail";
        phases[4].detail = packaged.status === 0 ? archive : (packaged.stderr || packaged.stdout || "packaging failed").trim();
    }
    else {
        phases[4].status = "skipped";
        phases[4].detail = "prerequisites incomplete";
    }
    const receipt = verifyPlugin({ pluginPath: root, profile: "release", componentReceipts: components.filter(c => c.available).map(c => c.receipt), integration, archive: existsSync(archive) ? archive : undefined, testsStatus: options.testsStatus, humanReview: options.humanReview, minPassRate: options.minPassRate, minDelta: options.minDelta });
    phases[5].status = receipt.status === "na" ? "skipped" : receipt.status;
    phases[5].detail = "release verification: " + receipt.status;
    for (const [gate, value] of Object.entries(receipt.gates))
        if (value.status === "blocked" && !next_actions.some(a => a.includes(value.reason ?? "~~~")))
            next_actions.push("resolve " + gate + " gate: " + (value.reason ?? "evidence missing"));
    const status = !valid || phases[4].status === "fail" || receipt.status === "fail" ? "failure" : receipt.status === "pass" ? "success" : "blocked";
    return envelope(status, status === "success" ? 0 : status === "blocked" ? 3 : 1, root, workspace, archive, components, phases, next_actions, receipt, false, Boolean(options.resume));
}
function requireText(path) { return readFileSync(path, "utf8"); }
function receiptName(path) { try {
    return JSON.parse(requireText(path))?.name ?? null;
}
catch {
    return null;
} }
function envelope(status, exit_code, plugin, workspace, archive, components, phases, next_actions, verification, dry_run, resume) { return { schema_version: "1.0", command: "full-eval", status, exit_code, dry_run, resume, plugin, workspace, archive, phases, components, next_actions, verification }; }
