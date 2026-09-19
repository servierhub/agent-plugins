import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const creatorNames = ["skill-creator", "agent-creator", "hook-creator", "plugin-creator"];
const capabilityContractRoot = path.join(root, "contracts", "capability-contract");

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\n> Testing capability contract");
run([path.join(capabilityContractRoot, "scripts", "test.mjs")], capabilityContractRoot);

for (const name of creatorNames) {
  const creatorRoot = path.join(root, "apps", `${name}-cli`);
  console.log(`\n> Testing ${name}`);
  run([path.join(creatorRoot, "scripts", "test.mjs")], creatorRoot);
}

console.log("\n> Testing distribution");
run(["--test", path.join(root, "tests", "test_distribution.test.ts")]);

console.log("\n> Building and testing standalone Bun executables");
run([path.join(root, "scripts", "build-bun-executables.mjs")]);
run(["--test", path.join(root, "tests", "test_bun_executables.test.ts")]);

console.log("\n> Testing release workflow and five-target staging packaging");
run(["--test", path.join(root, "tests", "test_release_packaging.test.ts")]);
const bun = process.env.BUN_EXECUTABLE || "bun";
const workflow = spawnSync(bun, ["test", path.join(root, "tests", "test_bun_release_workflow.test.ts")], { cwd: root, stdio: "inherit", env: process.env });
if (workflow.status !== 0) process.exit(workflow.status ?? 1);

console.log("\n> Testing offline bundle");
run([path.join(root, "scripts", "test-offline-bundle.mjs")]);
