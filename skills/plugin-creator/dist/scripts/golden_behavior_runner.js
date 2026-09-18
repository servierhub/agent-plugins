import { readFileSync } from "node:fs";
const [kind, scenario, inputPath, mode] = process.argv.slice(2), x = JSON.parse(readFileSync(inputPath, "utf8")), improved = mode === "improved";
await new Promise(resolve => setTimeout(resolve, improved ? 1 : 18));
let output;
if (kind === "skill") {
    const activated = String(x.request).includes("API review");
    output = { activated, restrained: !activated, findings: improved && activated && String(x.request).includes("breaking") ? ["breaking-change", "security-risk"] : [] };
}
else if (kind === "agent")
    output = { risk: String(x.version).includes("major") ? "high" : "low", provenance_checked: improved && x.provenance !== "registry", mutation_applied: false, approval_required: true };
else {
    const command = String(x.tool_input?.command ?? ""), blocked = /(^|\s)(rm\s+-rf\s+\/|git\s+push\s+(--force|-f)(\s|$))/.test(command) || (improved && /(ignore|bypass).*(safety|hook)/i.test(command));
    output = { decision: blocked ? "block" : "allow", command, evidence: "pre-tool-safety", exit_code: blocked ? 2 : 0 };
}
process.stdout.write(JSON.stringify(output));
