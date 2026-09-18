import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
const hash = (value) => createHash("sha256").update(value).digest("hex");
function files(root, dir = root) { return readdirSync(dir).sort().flatMap(name => { const path = join(dir, name), stat = statSync(path); return stat.isDirectory() ? files(root, path) : [relative(root, path).split(sep).join("/")]; }); }
function markdownFor(kind, root) { const path = kind === "skill" ? join(root, "skills/api-review/SKILL.md") : kind === "agent" ? join(root, "dependency-review.md") : join(root, "skills/safety-policy/SKILL.md"); return { path, text: readFileSync(path, "utf8") }; }
async function evaluate(args) {
    const [kind, scenario, inputPath, candidateRoot] = args, input = JSON.parse(readFileSync(inputPath, "utf8")), artifact = markdownFor(kind, candidateRoot);
    const match = artifact.text.match(/Behavior module:\s*`([^`]+)`/);
    if (!match)
        throw Error("candidate artifact does not reference a behavior module");
    const modulePath = resolve(dirname(artifact.path), match[1]);
    if (!modulePath.startsWith(resolve(candidateRoot) + sep) || !existsSync(modulePath))
        throw Error("candidate behavior module is missing or outside candidate root");
    const policy = await import(pathToFileURL(modulePath).href + "?sha=" + hash(readFileSync(modulePath)));
    const missing = policy.requiredInstructions.filter(text => !artifact.text.includes(text));
    if (missing.length) {
        process.stdout.write(JSON.stringify({ policy_error: "behavioral instructions do not match executable policy", missing_instructions: missing, input_fingerprint: hash(JSON.stringify(input)).slice(0, 12) }));
        process.exitCode = 3;
        return;
    }
    const output = await policy.evaluate(input, scenario);
    process.stdout.write(JSON.stringify({ ...output, input_fingerprint: hash(JSON.stringify(input)).slice(0, 12), artifact_sha256: hash(artifact.text), policy_sha256: hash(readFileSync(modulePath)) }));
}
function challenge(args) {
    const value = (name) => { const at = args.indexOf(name); if (at < 0 || !args[at + 1])
        throw Error("missing " + name); return args[at + 1]; }, candidate = resolve(value("--candidate")), recordsPath = resolve(value("--records")), criteriaPath = resolve(value("--criteria")), branch = Number(value("--branch"));
    const records = JSON.parse(readFileSync(recordsPath, "utf8")), criteria = JSON.parse(readFileSync(criteriaPath, "utf8")), candidateFiles = files(candidate), contents = candidateFiles.map(path => readFileSync(join(candidate, path), "utf8")).join("\n"), scenario = criteria.scenario_suite[(branch - 1) % criteria.scenario_suite.length], failed = records.filter((record) => record.scenario_id === scenario.id && !record.passed);
    const capability = String(scenario.id), present = contents.includes(JSON.stringify(capability)), kind = present && failed.length ? "behavior-mismatch" : "missing-capability", content = present ? `Candidate declares ${capability} but ${failed.length} executed record(s) fail its criterion.` : `Candidate lacks executable capability ${capability} required by: ${scenario.expect}.`;
    process.stdout.write(JSON.stringify({ branch_id: "branch-" + branch, finding_id: `finding-${branch}-${scenario.id}`, scenario_id: scenario.id, kind, capability, content, independent: true, executed: true, inspection: { candidate_path: candidate, records_path: recordsPath, criteria_path: criteriaPath, candidate_file_count: candidateFiles.length, record_count: records.length, candidate_sha256: hash(candidateFiles.map(path => path + ":" + hash(readFileSync(join(candidate, path))).toString()).join("|")), records_sha256: hash(readFileSync(recordsPath)), criteria_sha256: hash(readFileSync(criteriaPath)) } }));
}
const [mode, ...args] = process.argv.slice(2);
try {
    if (mode === "evaluate")
        await evaluate(args);
    else if (mode === "challenge")
        challenge(args);
    else
        throw Error("usage: golden_behavior_runner <evaluate|challenge> ...");
}
catch (error) {
    console.error(error.message);
    process.exitCode = 2;
}
