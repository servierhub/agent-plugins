import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "bun-release.json"), "utf8"));
const expectedNames = ["skill-creator", "agent-creator", "hook-creator", "plugin-creator"];
const stageRoot = join(ROOT, config.stagingRoot, platformKey(), "skills");
const stagedExecutable = (name: string, extension: string) => join(stageRoot, name, "scripts", name + extension);

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

test("Bun compiler version, release targets, and executable names are pinned", () => {
  assert.match(config.bunVersion, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(config.targets, {
    "linux-x64": "bun-linux-x64-baseline",
    "linux-arm64": "bun-linux-arm64",
    "darwin-x64": "bun-darwin-x64",
    "darwin-arm64": "bun-darwin-arm64",
    "win32-x64": "bun-windows-x64-baseline",
  });
  assert.deepEqual(Object.keys(config.executables), expectedNames);
  assert.equal(config.runtimeProfiles.source.mode, "node-bundled");
  assert.deepEqual(config.runtimeProfiles.source.requiredSkillEntries, ["scripts", "runtime"]);
  assert.equal(config.runtimeProfiles.native.mode, "native-bun");
  assert.deepEqual(config.runtimeProfiles.native.excludedSkillEntries, ["runtime", "node_modules"]);
  assert.deepEqual(config.runtimeProfiles.native.excludedScriptSuffixes, [".mjs"]);
  assert.ok(config.targets[platformKey()], `missing pinned target for ${platformKey()}`);
});

test("standalone creator executables pass clean-environment help smoke tests", () => {
  const target = process.env.BUN_BUILD_TARGET || config.targets[platformKey()];
  const extension = target.startsWith("bun-windows-") ? ".exe" : "";
  const home = mkdtempSync(join(tmpdir(), "creator-binary-smoke-"));
  try {
    for (const name of expectedNames) {
      const executable = stagedExecutable(name, extension);
      const mode = statSync(executable).mode;
      if (process.platform !== "win32") {
        assert.notEqual(mode & 0o111, 0, `${name} must have executable mode`);
      }
      const env: NodeJS.ProcessEnv = {
        HOME: home,
        PATH: "",
        NODE_PATH: "",
        LANG: "C",
        LC_ALL: "C",
      };
      if (process.platform === "win32") {
        env.SystemRoot = process.env.SystemRoot;
        env.ComSpec = process.env.ComSpec;
        env.PATHEXT = process.env.PATHEXT;
        env.TEMP = process.env.TEMP;
        env.TMP = process.env.TMP;
      }
      const result = spawnSync(executable, ["--help"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
      assert.match(result.stdout, new RegExp(`Usage: ${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});


test("standalone commands dispatch in-process without external runtimes or sibling scripts", () => {
  const target = process.env.BUN_BUILD_TARGET || config.targets[platformKey()];
  const extension = target.startsWith("bun-windows-") ? ".exe" : "";
  const home = mkdtempSync(join(tmpdir(), "creator-binary-command-"));
  const skill = join(home, "demo-skill"), plugin = join(home, "demo-plugin"), hookPlugin = join(home, "hook-plugin"), agent = join(home, "demo-agent.md");
  mkdirSync(skill); mkdirSync(plugin); mkdirSync(join(hookPlugin, "extensions", "io.github.bioinfornatics.agent-plugins.goose"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: demo-skill\ndescription: Handles demo workflows. Use when validating behavior.\n---\n# Demo\n");
  writeFileSync(agent, "---\nname: demo-agent\ndescription: Reviews demo artifacts.\n---\nReview the supplied artifact.\n");
  writeFileSync(join(plugin, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "demo-plugin", version: "1.0.0", description: "Demo plugin" }));
  writeFileSync(join(hookPlugin, "plugin.json"), JSON.stringify({ name: "hook-plugin", version: "1.0.0", extensions: { "io.github.bioinfornatics.agent-plugins.goose": { version: 1, hooks: "extensions/io.github.bioinfornatics.agent-plugins.goose/hooks.json" } } }));
  writeFileSync(join(hookPlugin, "extensions", "io.github.bioinfornatics.agent-plugins.goose", "hooks.json"), JSON.stringify({ hooks: { PostToolUse: [{ matcher: "developer__shell", hooks: [{ type: "command", command: "echo ok" }] }] } }));
  const env: NodeJS.ProcessEnv = { HOME: home, PATH: "", NODE_PATH: "", LANG: "C", LC_ALL: "C" };
  const cases: Array<[string, string[], number, RegExp]> = [
    ["skill-creator", ["validate", skill, "--format", "json"], 0, /"status": "success"/],
    ["agent-creator", ["validate", agent, "--format", "json"], 0, /"ok":true/],
    ["hook-creator", ["validate", hookPlugin, "--format", "json"], 0, /"ok":true/],
    ["plugin-creator", ["migrate", plugin, "--format", "json"], 0, /"mode": "dry-run"/],
  ];
  try {
    for (const [name, args, status, output] of cases) {
      const run = spawnSync(stagedExecutable(name, extension), args, { cwd: home, env, encoding: "utf8", timeout: 30_000 });
      assert.ifError(run.error); assert.equal(run.status, status, name + ": " + (run.stderr || run.stdout)); assert.match(run.stdout, output);
      assert.doesNotMatch(run.stdout + run.stderr, /vendor[\\/]node_modules|Unknown command: \/\$bunfs\//);
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("standalone full-eval, plugin verify/package, and golden paths work in a clean environment", () => {
  const target = process.env.BUN_BUILD_TARGET || config.targets[platformKey()];
  const extension = target.startsWith("bun-windows-") ? ".exe" : "";
  const home = mkdtempSync(join(tmpdir(), "creator-binary-release-paths-"));
  const skill = join(home, "demo"), plugin = join(home, "plugin"), evals = join(skill, "evals");
  mkdirSync(evals, { recursive: true }); mkdirSync(join(plugin, "skills", "demo"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: demo\ndescription: Evaluates demo workflows. Use when testing the demo behavior.\n---\n# Demo\n");
  writeFileSync(join(evals, "evals.json"), JSON.stringify({ skill_name: "demo", evals: [{ id: 7, name: "concrete-demo-run", subject: "behavioral-evaluation", language: "en", target: { kind: "existing-skill", execution: "execute", path: "." }, preconditions: ["Use fixture"], budget: { max_turns: 12, timeout_seconds: 600 }, prompt: "Evaluate the demo Skill at the supplied skill path.", expected_output: "A graded demo output.", files: [], capabilities: { filesystem: true, agent_runner: true, browser: false, network: false, tools: [] }, assertions: ["works"], coverage_tags: ["language:en"], navigation_expectations: { must_read: ["SKILL.md"], read_when_relevant: [], must_not_read: [] } }] }));
  writeFileSync(join(plugin, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "plugin", version: "1.0.0", description: "Demo plugin" }));
  writeFileSync(join(plugin, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: Handles demo workflows. Use when asked for a demo.\n---\n# Demo\n");
  const env: NodeJS.ProcessEnv = { HOME: home, PATH: "", NODE_PATH: "", LANG: "C", LC_ALL: "C" };
  const skillBin = stagedExecutable("skill-creator", extension), pluginBin = stagedExecutable("plugin-creator", extension);
  try {
    const full = spawnSync(skillBin, ["full-eval", skill, "--workspace", join(home, "eval-workspace"), "--dry-run", "--format", "json"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(full.error); assert.equal(full.status, 0, full.stderr || full.stdout); assert.equal(JSON.parse(full.stdout).status, "planned");
    const pluginFull = spawnSync(pluginBin, ["full-eval", plugin, "--workspace", join(plugin, "evaluations", "native-plan"), "--dry-run", "--format", "json"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(pluginFull.error); assert.equal(pluginFull.status, 0, pluginFull.stderr || pluginFull.stdout);
    const pluginPlan = JSON.parse(pluginFull.stdout); assert.equal(pluginPlan.status, "planned"); assert.match(pluginPlan.components[0].command, /^contained:skill-creator /);
    const verify = spawnSync(pluginBin, ["verify", plugin, "--profile", "static", "--format", "json"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(verify.error); assert.equal(verify.status, 3, verify.stderr || verify.stdout); assert.equal(JSON.parse(verify.stdout).gates.identity.status, "pass");
    const archive = join(home, "plugin.zip"), packaged = spawnSync(pluginBin, ["package", plugin, archive, "--format", "json"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(packaged.error); assert.equal(packaged.status, 0, packaged.stderr || packaged.stdout); assert.equal(statSync(archive).isFile(), true);
    const golden = spawnSync(pluginBin, ["golden-e2e", "--journey", "idea-api-review-skill", "--workspace", join(home, "golden"), "--format", "json"], { cwd: home, env, encoding: "utf8", timeout: 30_000 });
    assert.ifError(golden.error); assert.equal(golden.status, 4, golden.stderr || golden.stdout); assert.equal(JSON.parse(golden.stdout).status, "pending-production-approval");
    for (const run of [full, pluginFull, verify, packaged, golden]) assert.doesNotMatch(run.stdout + run.stderr, /\/$bunfs\/references|Unknown option --workspace|vendor[\\/]node_modules/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("extracted runtime-only archive preserves validate, package, and golden CLI contracts", () => {
  const target = process.env.BUN_BUILD_TARGET || config.targets[platformKey()];
  const extension = target.startsWith("bun-windows-") ? ".exe" : "";
  if (process.platform === "win32") return;
  const home = mkdtempSync(join(tmpdir(), "creator-extracted-journeys-"));
  const stage = join(home, "stage", "creators"), archive = join(home, "creators.tar.gz"), extracted = join(home, "extracted");
  mkdirSync(stage, { recursive: true }); mkdirSync(extracted);
  for (const name of expectedNames) { const destination = join(stage, name + extension); copyFileSync(stagedExecutable(name, extension), destination); chmodSync(destination, 0o755); }
  const packed = spawnSync("tar", ["-czf", archive, "-C", join(home, "stage"), "creators"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  rmSync(join(home, "stage"), { recursive: true, force: true });
  const unpacked = spawnSync("tar", ["-xzf", archive, "-C", extracted], { encoding: "utf8" });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  assert.deepEqual(readdirSync(join(extracted, "creators")).sort(), expectedNames.slice().sort());

  const skill = join(home, "demo"), plugin = join(home, "plugin");
  mkdirSync(skill); mkdirSync(join(plugin, "skills", "demo"), { recursive: true });
  const skillText = "---\nname: demo\ndescription: Handles demo workflows. Use when asked for a demo.\n---\n# Demo\n";
  writeFileSync(join(skill, "SKILL.md"), skillText); writeFileSync(join(plugin, "skills", "demo", "SKILL.md"), skillText);
  writeFileSync(join(plugin, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "plugin", version: "1.0.0", description: "Demo plugin" }));
  const cleanEnv: NodeJS.ProcessEnv = { HOME: join(home, "empty-home"), PATH: "", NODE_PATH: "", BUN_INSTALL: "", LANG: "C", LC_ALL: "C" };
  mkdirSync(cleanEnv.HOME!);
  const native = (name:string,args:string[]) => spawnSync(join(extracted, "creators", name + extension), args, { cwd: home, env: cleanEnv, encoding: "utf8", timeout: 30_000 });
  const baseline = (relative:string,args:string[]) => spawnSync(process.execPath, [join(ROOT, relative), ...args], { cwd: home, encoding: "utf8", timeout: 30_000 });
  try {
    const validateArgs = ["validate", skill, "--format", "json"];
    const validateBase = baseline("apps/skill-creator-cli/dist/scripts/cli.js", validateArgs), validateNative = native("skill-creator", validateArgs);
    assert.equal(validateNative.status, validateBase.status); assert.deepEqual(JSON.parse(validateNative.stdout), JSON.parse(validateBase.stdout));

    const baselineArchive = join(home, "baseline-package"), nativeArchive = join(home, "native-package");
    const packageBase = baseline("apps/skill-creator-cli/dist/scripts/cli.js", ["package", skill, baselineArchive, "--format", "json"]);
    const packageNative = native("skill-creator", ["package", skill, nativeArchive, "--format", "json"]);
    assert.equal(packageNative.status, packageBase.status); assert.equal(statSync(join(nativeArchive, "demo.skill")).isFile(), true);
    assert.equal(JSON.parse(packageNative.stdout).status, JSON.parse(packageBase.stdout).status);

    const baseWorkspace = join(home, "golden-base"), nativeWorkspace = join(home, "golden-native");
    const goldenArgs = (workspace:string) => ["golden-e2e", "--journey", "idea-api-review-skill", "--workspace", workspace, "--format", "json"];
    const goldenBase = baseline("apps/plugin-creator-cli/dist/scripts/cli.js", goldenArgs(baseWorkspace)), goldenNative = native("plugin-creator", goldenArgs(nativeWorkspace));
    assert.equal(goldenNative.status, goldenBase.status);
    const baseJson = JSON.parse(goldenBase.stdout), nativeJson = JSON.parse(goldenNative.stdout);
    for (const key of ["journey", "status", "activation_allowed"]) assert.deepEqual(nativeJson[key], baseJson[key], key);
    for (const result of [validateNative, packageNative, goldenNative]) assert.doesNotMatch(result.stdout + result.stderr, /node_modules|\/$bunfs\/|(?:^|[\/])bun(?:$|[\/])/i);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("release runtime paths do not spawn process.execPath or sibling scripts", () => {
  const resolver = readFileSync(join(ROOT, "apps/plugin-creator-cli/scripts/related-command-runtime.ts"), "utf8");
  assert.match(resolver, /isNativeRuntime/);
  assert.match(resolver, /if \(isNativeRuntime\) return nativeHandler\(\)/);
  assert.doesNotMatch(readFileSync(join(ROOT, "apps/plugin-creator-cli/scripts/golden_journeys.ts"), "utf8"), /spawnSync\s*\(\s*process\.execPath/);
  for (const relative of ["apps/skill-creator-cli/scripts/cli.ts", "apps/skill-creator-cli/scripts/full_eval.ts", "apps/agent-creator-cli/scripts/cli.ts", "apps/hook-creator-cli/scripts/cli.ts", "apps/plugin-creator-cli/scripts/cli.ts", "apps/plugin-creator-cli/scripts/golden_journeys.ts"]) {
    const source = readFileSync(join(ROOT, relative), "utf8");
    assert.doesNotMatch(source, /spawn(?:Sync)?\s*\(\s*process\.execPath|join\s*\(\s*HERE\s*,\s*script/);
  }
});
test("release assembly is a clean deterministic projection and never mutates source skills", () => {
  const output = mkdtempSync(join(tmpdir(), "creator-release-staging-"));
  const releaseKey = platformKey();
  const target = config.targets[releaseKey];
  const snapshot = (directory: string) => {
    const rows: Array<[string, string, number, string]> = [];
    const visit = (current: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
        const absolute = join(current, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile()) {
          const stat = statSync(absolute);
          rows.push([absolute.slice(directory.length + 1).replaceAll("\\", "/"), (stat.mode & 0o777).toString(8), stat.size, createHash("sha256").update(readFileSync(absolute)).digest("hex")]);
        }
      }
    };
    visit(directory);
    return rows;
  };
  const sourcesBefore = expectedNames.map((name) => [name, snapshot(join(ROOT, "skills", name))]);
  const assemble = () => spawnSync(process.execPath, [join(ROOT, "scripts", "build-bun-executables.mjs"), "--target=" + target, "--output=" + output], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  try {
    const first = assemble();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const stage = join(output, releaseKey);
    const releaseManifest = JSON.parse(readFileSync(join(stage, "release-manifest.json"), "utf8"));
    const releasePlugin = JSON.parse(readFileSync(join(stage, "plugin.json"), "utf8"));
    assert.equal(releaseManifest.runtimeMode, "native-bun");
    assert.equal(releasePlugin.extensions?.["io.github.bioinfornatics.agent-plugins.runtime"]?.mode, "native-bun");
    const firstInventory = snapshot(stage);
    writeFileSync(join(stage, "obsolete-file"), "must be removed");
    const second = assemble();
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(snapshot(stage), firstInventory, "clean rebuild must have the same paths, bytes, and modes");
    assert.deepEqual(expectedNames.map((name) => [name, snapshot(join(ROOT, "skills", name))]), sourcesBefore);
    for (const name of expectedNames) {
      const skill = join(stage, "skills", name);
      assert.deepEqual(readdirSync(join(skill, "scripts")), [name]);
      assert.notEqual(statSync(join(skill, "scripts", name)).mode & 0o111, 0);
      for (const forbidden of ["dist", "package.json", "tests", "tsconfig.json", "vendor", "runtime", "node_modules"]) assert.equal(statSync(join(skill, forbidden), { throwIfNoEntry: false }), undefined, name + ": " + forbidden);
      assert.equal(readdirSync(join(skill, "scripts")).some((entry) => entry.endsWith(".mjs")), false);
    }
    assert.doesNotMatch(readFileSync(join(ROOT, "bun-release.json"), "utf8"), /skills\/[^/]+\/(?:scripts|dist)/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
