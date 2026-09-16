#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const tmp = mkdtempSync(path.join(tmpdir(), "agent-plugins-offline-"));
const archive = path.join(tmp, "agent-plugins.zip");
const extracted = path.join(tmp, "extracted");
mkdirSync(extracted);

function run(script, args = [], cwd = extracted) {
  const result = spawnSync(node, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NODE_PATH: "",
      npm_config_offline: "true",
      npm_config_cache: path.join(tmp, "empty-npm-cache"),
    },
  });
  if (result.status !== 0) {
    throw new Error(`Offline command failed: ${script} ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout;
}

try {
  const packager = path.join(sourceRoot, "skills", "plugin-creator", "dist", "scripts", "package_goose_plugin.js");
  execFileSync(node, [packager, sourceRoot, archive], { stdio: "inherit" });
  execFileSync("unzip", ["-q", archive, "-d", extracted]);
  const plugin = path.join(extracted, "agent-plugins");

  const allFiles = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else allFiles.push(full);
    }
  }
  walk(plugin);

  const relative = allFiles.map((file) => path.relative(plugin, file).split(path.sep).join("/"));
  for (const excluded of [".agents/", ".beads/", "evaluations/"]) {
    if (relative.some((file) => file.startsWith(excluded))) throw new Error(`Archive contains repository-local metadata: ${excluded}`);
  }
  if (!relative.includes(".vscode/tasks.json")) throw new Error("Archive is missing maintained VS Code tasks");
  if (relative.some((file) => /(^|\/)node_modules\//.test(file) && !/(^|\/)vendor\/node_modules\//.test(file))) {
    throw new Error("Archive contains development node_modules outside vendor/");
  }
  for (const required of [
    "contracts/capability-contract/schema/1.0.0/capability-contract.schema.json",
    "contracts/capability-contract/schema/1.0.0/evaluation-plan.schema.json",
    "contracts/capability-contract/schema/1.0.0/result-contract.schema.json",
    "contracts/capability-contract/schema/1.0.0/host-execution-adapter.schema.json",
    "contracts/capability-contract/schema/1.0.0/host-execution-event.schema.json",
    "contracts/capability-contract/EVALUATION_PLAN_SPECIFICATION.md",
    "contracts/capability-contract/HOST_ADAPTER_SPECIFICATION.md",
    "contracts/capability-contract/RESULT_SPECIFICATION.md",
    "contracts/capability-contract/PRODUCER_INVENTORY_SPECIFICATION.md",
    "contracts/capability-contract/fixtures/result/producer-inventory.json",
    "contracts/capability-contract/fixtures/result/expected-consumer-fields.json",
    "contracts/capability-contract/fixtures/result/valid/pending-human-review-mappings.json",
    "contracts/capability-contract/dist/evaluation.js",
    "contracts/capability-contract/dist/evaluation.d.ts",
    "contracts/capability-contract/dist/evaluation-types.js",
    "contracts/capability-contract/dist/evaluation-types.d.ts",
    "contracts/capability-contract/dist/index.js",
    "contracts/capability-contract/dist/index.d.ts",
    "contracts/capability-contract/dist/host-adapter.js",
    "contracts/capability-contract/dist/host-adapter.d.ts",
    "contracts/capability-contract/dist/host-adapter-types.js",
    "contracts/capability-contract/dist/host-adapter-types.d.ts",
    "contracts/capability-contract/dist/fake-host-adapter.js",
    "contracts/capability-contract/dist/fake-host-adapter.d.ts",
    "contracts/capability-contract/fixtures/host-adapter/successful-stream.jsonl",
    "contracts/capability-contract/dist/result.js",
    "contracts/capability-contract/dist/result.d.ts",
    "contracts/capability-contract/dist/result-types.js",
    "contracts/capability-contract/dist/result-types.d.ts",
    "contracts/capability-contract/fixtures/result/valid/completed-pass-pending.json",
    "contracts/capability-contract/SPECIFICATION.md",
    "skills/skill-creator/dist/scripts/quick_validate.js",
    "skills/skill-creator/vendor/node_modules/js-yaml/package.json",
    "skills/skill-creator/vendor/node_modules/adm-zip/package.json",
    "skills/plugin-creator/vendor/node_modules/adm-zip/package.json",
    "skills/agent-creator/vendor/node_modules/js-yaml/package.json",
    "skills/hook-creator/vendor/manifest.json",
    "skills/skill-creator/evals/evals.json",
    "skills/skill-creator/assets/evaluation-fixtures/frontmatter-invalid/SKILL.md",
    "skills/agent-creator/evals/evals.json",
    "skills/agent-creator/assets/evaluation-fixtures/invalid-agent.md",
    "skills/hook-creator/evals/evals.json",
    "skills/hook-creator/assets/evaluation-fixtures/exact-rm-guard/hooks/hooks.json",
    "skills/plugin-creator/evals/evals.json",
    "skills/plugin-creator/assets/evaluation-fixtures/package-ready/plugin.json",
  ]) {
    if (!existsSync(path.join(plugin, required))) throw new Error(`Missing offline artifact: ${required}`);
  }

  const contractIndex = path.join(plugin, "contracts", "capability-contract", "dist", "index.js");
  const contractProbe = `import { mapLegacyStatus, classifyResultExit, FakeHostAdapter, HOST_ADAPTER_PROTOCOL_VERSION } from ${JSON.stringify(contractIndex)}; const mapped = mapLegacyStatus({ creator: "skill-creator", context: "skill-receipt-status", token: "complete" }); if (!mapped.ok || mapped.mapping.result.approval.state !== "not-applicable") throw new Error("offline legacy mapping failed"); const exit = classifyResultExit({ schemaVersion: "1.0.0", operation: { state: "completed" }, evaluation: { applicable: true, verdict: "pass" }, evidence: { applicable: true, availability: "available" }, approval: { applicable: true, state: "pending", context: "production-review" } }); if (exit.code !== 4) throw new Error("offline exit mapping failed"); const adapter = new FakeHostAdapter(); const negotiation = await adapter.discover({ supportedProtocolVersions: [HOST_ADAPTER_PROTOCOL_VERSION], capabilities: { required: [{ capability: "streaming" }], optional: [{ capability: "browser" }] } }); if (!negotiation.compatible || negotiation.degradations[0]?.capability !== "browser") throw new Error("offline host adapter negotiation failed");`;
  run("--input-type=module", ["--eval", contractProbe]);

  run(path.join(plugin, "skills", "skill-creator", "dist", "scripts", "quick_validate.js"), [path.join(plugin, "skills", "skill-creator")]);
  const skillOut = path.join(tmp, "skill-out");
  mkdirSync(skillOut);
  run(path.join(plugin, "skills", "skill-creator", "dist", "scripts", "package_skill.js"), [path.join(plugin, "skills", "skill-creator"), skillOut]);
  const standaloneArchive = path.join(skillOut, "skill-creator.skill");
  const standaloneExtract = path.join(tmp, "standalone-skill");
  mkdirSync(standaloneExtract);
  execFileSync("unzip", ["-q", standaloneArchive, "-d", standaloneExtract]);
  const standaloneSkill = path.join(standaloneExtract, "skill-creator");
  run(path.join(standaloneSkill, "dist", "scripts", "quick_validate.js"), [standaloneSkill], standaloneExtract);
  for (const required of [
    "assets/evaluation-fixtures/frontmatter-invalid/SKILL.md",
    "assets/evaluation-fixtures/skill-comparison/current/invoice-normalizer/SKILL.md",
  ]) {
    if (!existsSync(path.join(standaloneSkill, required))) throw new Error(`Standalone Skill is missing evaluation fixture: ${required}`);
  }

  const agent = path.join(tmp, "agent.md");
  writeFileSync(agent, "---\nname: offline-reviewer\ndescription: Reviews offline bundles\n---\n\nReview the bundle.\n");
  run(path.join(plugin, "skills", "agent-creator", "dist", "scripts", "validate_agent.js"), [agent]);
  run(path.join(plugin, "skills", "plugin-creator", "dist", "scripts", "validate_agent_plugin_schema.js"), [plugin, "--format", "json"]);
  run(path.join(plugin, "skills", "plugin-creator", "dist", "scripts", "validate_goose_plugin.js"), [plugin]);
  const repacked = path.join(tmp, "repacked.zip");
  run(path.join(plugin, "skills", "plugin-creator", "dist", "scripts", "package_goose_plugin.js"), [plugin, repacked]);
  if (!existsSync(repacked)) throw new Error("Offline plugin repack did not produce an archive");

  console.log(JSON.stringify({ status: "passed", archive, extractedPlugin: plugin, files: relative.length }, null, 2));
} finally {
  if (!process.env.KEEP_OFFLINE_TEST) rmSync(tmp, { recursive: true, force: true });
}