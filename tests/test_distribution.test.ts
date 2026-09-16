import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_NAME = "agent-plugins";
const SKILLS = join(ROOT, "skills");
const EXPECTED_SKILLS = new Set(["skill-creator", "agent-creator", "hook-creator", "plugin-creator"]);

test("open plugins manifest", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "plugin.json"), "utf-8"));
  assert.equal(manifest.name, PLUGIN_NAME);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.trim());
});

test("skills are self-contained and named by directory", () => {
  const found = new Set<string>();
  const skillsDir = join(ROOT, "skills");
  for (const entry of readdirSync(skillsDir).sort()) {
    const skillFile = join(skillsDir, entry, "SKILL.md");
    let text: string;
    try {
      text = readFileSync(skillFile, "utf-8");
    } catch {
      continue;
    }
    const match = /^name:\s*([^\n]+)$/m.exec(text);
    assert.ok(match, skillFile);
    const name = match![1].trim().replace(/^['"]|['"]$/g, "");
    assert.equal(name, entry);
    found.add(name);
  }
  assert.deepEqual(found, EXPECTED_SKILLS);
});

test("plugin-creator routes to qualified names with fallbacks", () => {
  const text = readFileSync(join(ROOT, "skills", "plugin-creator", "SKILL.md"), "utf-8");
  for (const name of ["skill-creator", "hook-creator", "agent-creator"]) {
    assert.ok(text.includes(`${PLUGIN_NAME}:${name}`));
    assert.ok(text.includes(`\`${name}\``));
  }
});

test("documentation prioritizes open-format adoption and a verified host integration", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const manifest = JSON.parse(readFileSync(join(ROOT, "plugin.json"), "utf-8"));
  assert.ok(readme.startsWith("[![Servier Powered]"), "Servier badge must be the first README element");
  assert.ok(readme.includes("**runtime-agnostic by format**"));
  assert.ok(readme.includes("Verified host integration"));
  assert.ok(readme.includes("Agentic AI Foundation"));
  assert.ok(readme.includes(`Distribution | \`${manifest.version}\``), "README distribution version must match plugin.json");
  assert.ok(readme.includes("goose plugin install https://github.com/servierhub/agent-plugins.git"));
  assert.ok(!readme.split("\n").some((line) => line.includes("goose plugin install") && line.includes("bioinfornatics/agent-plugins")));
  for (const section of [
    "## Quick start",
    "## Choose your path",
    "## Choose the right creator",
    "## How-to guides",
    "## Installation and updates",
    "## Troubleshooting",
    "## Formats, portability, and security",
  ]) assert.ok(readme.includes(section), `README missing adoption section: ${section}`);
  for (const name of EXPECTED_SKILLS) assert.ok(readme.includes(`${PLUGIN_NAME}:${name}`));
});

test("explicit skill evaluation requests use the progressively disclosed completion contract", () => {
  const entrypoint = readFileSync(join(ROOT, "skills", "skill-creator", "SKILL.md"), "utf-8");
  const workflow = readFileSync(join(ROOT, "skills", "skill-creator", "references", "evaluation-workflow.md"), "utf-8");
  assert.match(entrypoint, /Evaluate behavioral quality or compare versions[\s\S]*references\/evaluation-workflow\.md/);
  assert.match(entrypoint, /When the user asks to evaluate[\s\S]*execute the evaluation/);
  for (const required of [
    "Completion contract",
    "paired `with_skill`",
    "grading.json",
    "aggregate_benchmark.js",
    "eval-viewer/generate_review.js",
    "blocked",
    "does not replace behavioral evaluation",
  ]) assert.ok(workflow.includes(required), required);
});

test("explicit plugin evaluation requests require behavioral skill and integration evidence", () => {
  const text = readFileSync(join(ROOT, "skills", "plugin-creator", "SKILL.md"), "utf-8");
  for (const required of [
    "Behavioral Evaluation Contract",
    "complete evaluation receipt",
    "plugin-level integration scenarios",
    "combined benchmark",
    "review viewer",
    "evaluation: blocked",
  ]) assert.ok(text.includes(required), required);
});

test("every creator ships a complete offline runtime bundle", () => {
  for (const name of EXPECTED_SKILLS) {
    const skill = join(ROOT, "skills", name);
    const pkg = JSON.parse(readFileSync(join(skill, "package.json"), "utf-8"));
    assert.equal(pkg.offlineBundle, true, `${name}: offlineBundle`);
    assert.ok(existsSync(join(skill, "dist")), `${name}: dist`);
    assert.ok(existsSync(join(skill, "vendor", "manifest.json")), `${name}: vendor manifest`);
    assert.ok(existsSync(join(skill, "THIRD_PARTY_NOTICES.md")), `${name}: notices`);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      assert.ok(existsSync(join(skill, "vendor", "node_modules", dependency, "package.json")), `${name}: ${dependency}`);
    }
  }
});

test("all creator evaluation sets are autonomous and fixture-backed", () => {
  const designCli = join(SKILLS, "skill-creator", "dist", "scripts", "cli.js");
  for (const name of EXPECTED_SKILLS) {
    const skillRoot = join(SKILLS, name);
    const evalSet = join(skillRoot, "evals", "evals.json");
    assert.ok(existsSync(evalSet), `${name}: missing durable eval set`);
    const result = spawnSync(process.execPath, [designCli, "design-evals", evalSet, "--skill-path", skillRoot, "--format", "json"], { encoding: "utf8" });
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.output.status, "pass", `${name}: ${JSON.stringify(envelope.output.findings)}`);
    assert.equal(envelope.output.summary.warnings, 0, name);
    const document = JSON.parse(readFileSync(evalSet, "utf8"));
    for (const scenario of document.evals) {
      assert.ok(scenario.subject, `${name}/${scenario.id}: subject`);
      assert.ok(scenario.language, `${name}/${scenario.id}: language`);
      assert.ok(scenario.target?.kind, `${name}/${scenario.id}: target.kind`);
      assert.match(scenario.target.execution, /^(explain|dry-run|execute|resume)$/, `${name}/${scenario.id}: execution`);
      assert.ok(scenario.preconditions?.length, `${name}/${scenario.id}: preconditions`);
      assert.ok(scenario.coverage_tags?.includes(`language:${scenario.language}`), `${name}/${scenario.id}: language coverage`);
    }
  }
});

test("offline vendors contain production dependencies only", () => {
  for (const name of EXPECTED_SKILLS) {
    const skill = join(ROOT, "skills", name);
    const pkg = JSON.parse(readFileSync(join(skill, "package.json"), "utf-8"));
    const manifest = JSON.parse(readFileSync(join(skill, "vendor", "manifest.json"), "utf-8"));
    const bundled = new Set(manifest.packages.map((item: { name: string }) => item.name));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) assert.ok(bundled.has(dependency));
    for (const devDependency of Object.keys(pkg.devDependencies ?? {})) assert.ok(!bundled.has(devDependency), `${name}: bundled dev dependency ${devDependency}`);
  }
});

test("skill metadata and progressive disclosure follow repository policy", () => {
  for (const entry of readdirSync(SKILLS)) {
    const skillFile = join(SKILLS, entry, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    const text = readFileSync(skillFile, "utf8");
    const description = text.match(/^description:\s*["']?(.*?)["']?$/m)?.[1] ?? "";
    assert.ok(description.length > 0 && description.length <= 350, `${entry}: description must be concise`);
    assert.ok(!/[^\x00-\x7F]/.test(description), `${entry}: description must be English/ASCII metadata`);
    assert.match(description, /\bUse (?:when|for)\b/, `${entry}: description must state when to activate`);
    assert.ok(text.split(/\r?\n/).length <= 500, `${entry}: SKILL.md must use progressive disclosure above 500 lines`);
  }
  const creator = readFileSync(join(SKILLS, "skill-creator", "SKILL.md"), "utf8");
  for (const question of ["What does the Skill do?", "When should the agent activate it?", "What instructions must the Skill give?", "In what order must they run?", "Are all instructions mandatory?", "Which instructions are conditional?", "Does `SKILL.md` exceed or approach 500 lines?"]) {
    assert.ok(creator.includes(question), `skill-creator missing authoring question: ${question}`);
  }
  assert.match(creator, /Progressive disclosure[\s\S]*metadata for selection[\s\S]*SKILL\.md[\s\S]*common workflow[\s\S]*bundled[\s\S]*references\//i);
});

test("skill-creator applies the complete authoring pattern catalog at creation and improvement", () => {
  const creator = readFileSync(join(SKILLS, "skill-creator", "SKILL.md"), "utf8");
  const catalog = readFileSync(join(SKILLS, "skill-creator", "references", "skill-authoring-best-practices.md"), "utf8");
  assert.match(creator, /Create or materially redesign a Skill[\s\S]*pattern catalog/i);
  assert.match(creator, /Improve after evaluation or real usage[\s\S]*pattern catalog/i);
  assert.match(creator, /At creation and after evaluation[\s\S]*Is it relevant here\?[\s\S]*Why\?[\s\S]*Where should it be applied\?/i);
  for (const pattern of [
    "Concise is key",
    "Appropriate degree of freedom",
    "Test with all intended models",
    "Effective description",
    "High-level guide with references",
    "Domain-specific organization",
    "Conditional details",
    "Sequential workflow",
    "Feedback loop",
    "Plan-validate-execute",
    "Avoid time-sensitive information",
    "Consistent terminology",
    "Template pattern",
    "Examples pattern",
    "Conditional workflow",
    "Evaluation-driven development",
    "Expert-author / fresh-user loop",
    "Observe navigation behavior",
    "Solve, do not defer",
    "Utility scripts",
    "Visual analysis",
    "Verifiable intermediate outputs",
    "Package dependencies",
    "Fully qualified MCP tools",
    "Do not assume tools are installed",
    "Avoid too many options",
  ]) assert.ok(catalog.includes(pattern), `missing upstream authoring pattern: ${pattern}`);
  assert.match(catalog, /Is it relevant here\? Why\? Where should it be applied\?/);
});
