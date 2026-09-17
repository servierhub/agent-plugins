import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import AdmZip from "adm-zip";
import { packageSkill } from "../dist/scripts/package_skill.js";

test("skill packaging rejects symbolic links", () => {
  const tmp = mkdtempSync(join(tmpdir(), "package-skill-"));
  try {
    const root = join(tmp, "demo");
    mkdirSync(root);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: Packages demo workflows. Use when testing Skill packaging\n---\n\n# Demo\n");
    writeFileSync(join(tmp, "secret.txt"), "secret");
    symlinkSync(join(tmp, "secret.txt"), join(root, "secret-link"));
    const oldLog = console.log;
    console.log = () => {};
    try { assert.equal(packageSkill(root, join(tmp, "out")), null); }
    finally { console.log = oldLog; }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the creator package is self-contained for offline CLI execution", () => {
  const tmp = mkdtempSync(join(tmpdir(), "package-skill-offline-"));
  const creator = resolve(".");
  const oldLog = console.log; console.log = () => {};
  try {
    const archive = packageSkill(creator, tmp);
    assert.ok(archive);
    const unpacked = join(tmp, "unpacked");
    new AdmZip(archive!).extractAllTo(unpacked, true);
    const packaged = join(unpacked, "skill-creator");
    const probe = spawnSync(process.execPath, [join(packaged, "dist/scripts/cli.js"), "full-eval", packaged, "--dry-run", "--format", "json"], { encoding: "utf8", cwd: tmp, env: { ...process.env, NODE_PATH: "" } });
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(JSON.parse(probe.stdout).status, "planned");
  } finally { console.log = oldLog; rmSync(tmp, { recursive: true, force: true }); }
});

test("skill packaging blocks error-level authoring audit findings", () => {
  const tmp = mkdtempSync(join(tmpdir(), "package-skill-audit-"));
  try {
    const root = join(tmp, "demo"); mkdirSync(root);
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: Traite les fichiers. Utilisez quand nécessaire.\n---\n\n# Demo\n");
    const oldLog = console.log; console.log = () => {};
    try { assert.equal(packageSkill(root, join(tmp, "out")), null); }
    finally { console.log = oldLog; }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
