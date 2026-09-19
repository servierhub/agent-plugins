import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "bun-release.json"), "utf8"));

function fail(message) { console.error(`error: ${message}`); process.exit(1); }
function option(name) {
  const args = process.argv.slice(2), prefix = `${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function walk(directory, base = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`symbolic links are not portable: ${path.relative(root, absolute)}`);
    if (entry.isDirectory()) files.push(...walk(absolute, base));
    else if (entry.isFile()) files.push({ absolute, relative: path.relative(base, absolute).split(path.sep).join("/") });
    else fail(`unsupported portable entry: ${path.relative(root, absolute)}`);
  }
  return files;
}
function inventory(directory) {
  const entries = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (entry.isSymbolicLink()) fail(`symbolic links are not portable: ${path.relative(root, absolute)}`);
      if (entry.isDirectory()) {
        entries.push({ path: `${relative}/`, mode: (stat.mode & 0o777).toString(8).padStart(3, "0") });
        visit(absolute);
      } else if (entry.isFile()) {
        entries.push({ path: relative, mode: (stat.mode & 0o777).toString(8).padStart(3, "0"), size: stat.size, sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex") });
      } else fail(`unsupported portable entry: ${path.relative(root, absolute)}`);
    }
  }
  visit(directory);
  return entries;
}
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function copyTree(source, destination) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) fail(`symbolic links are not portable: ${path.relative(root, source)}`);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    chmodSync(destination, stat.mode & 0o777);
    for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      copyTree(path.join(source, entry.name), path.join(destination, entry.name));
    }
  } else if (stat.isFile()) {
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    chmodSync(destination, stat.mode & 0o777);
  } else fail(`unsupported portable entry: ${path.relative(root, source)}`);
}
function copyPortable(source, destination) {
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  chmodSync(destination, 0o755);
  for (const entry of config.portableSkillEntries) {
    const from = path.join(source, entry);
    let stat;
    try { stat = lstatSync(from); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    copyTree(from, path.join(destination, entry));
  }
}

const bun = process.env.BUN_EXECUTABLE || "bun";
const version = spawnSync(bun, ["--version"], { encoding: "utf8" });
if (version.error) fail(`cannot execute Bun at ${bun}: ${version.error.message}`);
if (version.status !== 0) fail(`Bun version check failed: ${(version.stderr || version.stdout).trim()}`);
if (version.stdout.trim() !== config.bunVersion) fail(`Bun ${config.bunVersion} is required; found ${version.stdout.trim() || "unknown"}`);

const platformKey = `${process.platform}-${process.arch}`;
const target = option("--target") || config.targets[platformKey];
if (!target) fail(`no pinned Bun target for ${platformKey}; pass --target=<pinned target>`);
const releaseKey = Object.entries(config.targets).find(([, value]) => value === target)?.[0];
if (!releaseKey) fail(`target ${target} is not pinned in bun-release.json`);
const outputRoot = path.resolve(option("--output") || path.join(root, config.stagingRoot));
const sourceSkills = Object.keys(config.executables).map((name) => path.join(root, "skills", name));
if (sourceSkills.some((directory) => outputRoot === directory || outputRoot.startsWith(directory + path.sep))) {
  fail("release staging must be outside source skill directories");
}
const finalStage = path.join(outputRoot, releaseKey);
const temporaryStage = path.join(outputRoot, `.${releaseKey}.tmp-${process.pid}`);
const sourceBefore = sourceSkills.map((directory) => ({ skill: path.basename(directory), inventory: inventory(directory) }));

rmSync(temporaryStage, { recursive: true, force: true });
mkdirSync(path.join(temporaryStage, "skills"), { recursive: true, mode: 0o755 });
for (const entry of config.portablePluginEntries) copyTree(path.join(root, entry), path.join(temporaryStage, entry));
chmodSync(temporaryStage, 0o755);
chmodSync(path.join(temporaryStage, "skills"), 0o755);
try {
  for (const [name, relativeEntry] of Object.entries(config.executables)) {
    const skillStage = path.join(temporaryStage, "skills", name);
    copyPortable(path.join(root, "skills", name), skillStage);
    const scripts = path.join(skillStage, "scripts"); mkdirSync(scripts, { recursive: true, mode: 0o755 }); chmodSync(scripts, 0o755);
    const output = path.join(scripts, name + (target.startsWith("bun-windows-") ? ".exe" : ""));
    const result = spawnSync(bun, ["build", "--compile", `--target=${target}`, `--outfile=${output}`, path.join(root, relativeEntry)], { cwd: root, stdio: "inherit" });
    if (result.error) fail(`failed to build ${name}: ${result.error.message}`);
    if (result.status !== 0) process.exit(result.status ?? 1);
    chmodSync(output, 0o755);
  }
  const sourceAfter = sourceSkills.map((directory) => ({ skill: path.basename(directory), inventory: inventory(directory) }));
  if (digest(sourceAfter) !== digest(sourceBefore)) fail("source skills changed while assembling release staging");
  const stageInventory = inventory(temporaryStage);
  const manifest = { schemaVersion: 1, releaseKey, bunTarget: target, bunVersion: config.bunVersion, files: stageInventory.filter((entry) => !entry.path.endsWith("/")) };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path.join(temporaryStage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  const validatedInventory = inventory(temporaryStage);
  rmSync(finalStage, { recursive: true, force: true });
  renameSync(temporaryStage, finalStage);
  console.log(JSON.stringify({ status: "staged", target, releaseKey, staging: finalStage, sourceSkillsSha256: digest(sourceBefore), inventorySha256: digest(validatedInventory), files: validatedInventory.length }));
} finally { rmSync(temporaryStage, { recursive: true, force: true }); }
