#!/usr/bin/env node
import { realpathSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initHook, parseInitArgs, UsageError } from "./init_hook.js";
import { validateHook } from "./validate_hook.js";
import { verifyEvaluationRunManifest, writeEvaluationRunManifest } from "./evaluation_run_manifest.js";
const HELP = `Usage: hook-creator [--format text|json] [--quiet] <command> [options]

Commands:
  init <plugin_dir> <event> <name> [--matcher <regex>] [--timeout <n>]
  validate <plugin_dir>
  eval-manifest create <spec.json> <manifest.json>
  eval-manifest verify <manifest.json> [receipt.json]

Common options:
  --format <text|json>  Select human-readable or JSON output (default: text)
  --quiet               Suppress successful output
  -h, --help            Show help
`;
function parseCommon(argv) { let format = "text", quiet = false, help = false; const rest = []; for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format") {
        const value = argv[++i];
        if (value !== "text" && value !== "json")
            throw new UsageError("--format must be text or json");
        format = value;
    }
    else if (arg.startsWith("--format=")) {
        const value = arg.slice(9);
        if (value !== "text" && value !== "json")
            throw new UsageError("--format must be text or json");
        format = value;
    }
    else if (arg === "--quiet")
        quiet = true;
    else if (arg === "--help" || arg === "-h")
        help = true;
    else
        rest.push(arg);
} return { format, quiet, help, rest }; }
function output(value, format, quiet, lines) { if (quiet)
    return; if (format === "json")
    console.log(JSON.stringify(value));
else
    for (const line of lines)
        console.log(line); }
function failure(error, format, usage) { if (format === "json")
    console.log(JSON.stringify({ ok: false, error: error.message, usage }));
else
    console.error("error: " + error.message); return usage ? 2 : 1; }
export function run(argv) { let common; try {
    common = parseCommon(argv);
}
catch (error) {
    return failure(error, "text", true);
} const [command, ...args] = common.rest; if (common.help) {
    output({ ok: true, help: HELP }, common.format, false, [HELP.trimEnd()]);
    return 0;
} if (!command)
    return failure(new UsageError("a command is required; use --help"), common.format, true); try {
    if (command === "init") {
        const result = initHook(parseInitArgs(args));
        output({ ok: true, command, ...result }, common.format, common.quiet, [result.hooksPath, result.scriptPath]);
        return 0;
    }
    if (command === "eval-manifest") {
        const [action, manifestPath, receiptPath, extra] = args;
        if (action === "create" && manifestPath && receiptPath && !extra) {
            const result = writeEvaluationRunManifest(manifestPath, receiptPath);
            output({ ok: true, command, action, manifest: result }, common.format, common.quiet, [receiptPath, result.canonical_content_sha256]);
            return 0;
        }
        if (action === "verify" && manifestPath && !extra) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8")), receipt = receiptPath ? JSON.parse(readFileSync(receiptPath, "utf8")) : undefined, result = verifyEvaluationRunManifest(manifest, receipt);
            output({ command, action, ...result }, common.format, common.quiet && result.ok, result.ok ? ["OK: " + manifestPath] : result.errors.map(x => "ERROR: " + x));
            return result.ok ? 0 : 1;
        }
        throw new UsageError("usage: hook-creator eval-manifest create <spec.json> <manifest.json> | verify <manifest.json> [receipt.json]");
    }
    if (command === "validate") {
        if (args.length !== 1)
            throw new UsageError("usage: hook-creator validate <plugin_dir>");
        const result = validateHook(args[0]), ok = result.errors.length === 0;
        output({ ok, command, ...result }, common.format, common.quiet && ok, [...result.warnings.map(x => "WARNING: " + x), ...result.errors.map(x => "ERROR: " + x), ...(ok ? ["OK: " + result.path] : [])]);
        return ok ? 0 : 1;
    }
    throw new UsageError("unknown command: " + command);
}
catch (error) {
    return failure(error, common.format, error instanceof UsageError);
} }
function isMain(metaUrl) { if (!process.argv[1])
    return false; try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(process.argv[1]));
}
catch {
    return false;
} }
if (isMain(import.meta.url))
    process.exitCode = run(process.argv.slice(2));
