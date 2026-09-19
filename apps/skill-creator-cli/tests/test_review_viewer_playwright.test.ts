import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReviewIR, generateHtml } from "../dist/eval-viewer/generate_review.js";

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH;
const chromium = playwrightModule ? (await import(playwrightModule)).chromium : null;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "review-playwright-"));
  for (let index = 0; index < 30; index++) for (const config of ["with_skill", "old_skill"]) {
    const run = join(root, "eval-" + index, config, "run-1");
    mkdirSync(join(run, "outputs"), { recursive: true });
    writeFileSync(join(root, "eval-" + index, "eval_metadata.json"), JSON.stringify({ eval_id: "case-" + index, prompt: "Prompt " + index }));
    const candidate = config === "with_skill";
    writeFileSync(join(run, "grading.json"), JSON.stringify({ expectations: [{ text: "accessible behavior", passed: candidate, evidence: "evidence" }], summary: { passed: candidate ? 1 : 0, failed: candidate ? 0 : 1, total: 1, pass_rate: candidate ? 1 : 0 } }));
    writeFileSync(join(run, "timing.json"), JSON.stringify({ total_duration_seconds: 1, total_tokens: 10 }));
    writeFileSync(join(run, "outputs", "result.txt"), "output " + index);
  }
  const benchmark = { run_summary: { with_skill: { pass_rate: { mean: 1 }, time_seconds: { mean: 1 }, tokens: { mean: 10 } }, old_skill: { pass_rate: { mean: 0 }, time_seconds: { mean: 1 }, tokens: { mean: 10 } }, delta: { pass_rate: "+1.00", paired: { pass_rate: { mean: 1, stddev: 0, confidence_interval_95: { lower: .8, upper: 1 } } } } } };
  const path = join(root, "review.html");
  writeFileSync(path, generateHtml(buildReviewIR(root, "playwright review", benchmark)));
  return { root, path };
}

test("Playwright verifies evaluation viewer accessibility and interactions", { skip: !chromium && "PLAYWRIGHT_MODULE_PATH is not configured" }, async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium-browser";
  const f = fixture();
  const browser = await chromium!.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("file://" + f.path);
    await page.getByRole("heading", { name: "Evaluation decision review" }).waitFor();
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.locator("[role=status]").count() >= 1, true);
    assert.match(await page.locator('label[for="search"]').innerText(), /Search prompts/);
    await page.locator("#search").fill("Prompt 29");
    assert.match(await page.locator("#count").innerText(), /^1 of 1 matching/);
    await page.locator("#clear").click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "search");
    await page.locator("#more").click();
    assert.equal(await page.locator("#scenarios article").count() > 25, true);
    const disclosure = page.locator(".run summary").first();
    await disclosure.focus(); await page.keyboard.press("Space");
    assert.equal(await disclosure.evaluate(element => (element.parentElement as HTMLDetailsElement).open), true);
    assert.equal(await page.locator('label[for="feedback"]').count(), 1);
    await page.locator("#feedback").fill("Playwright reviewed");
    await page.locator("#save").click();
    assert.match(await page.locator("#save-status").innerText(), /Saving|saved|downloaded/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); rmSync(f.root, { recursive: true, force: true }); }
});
