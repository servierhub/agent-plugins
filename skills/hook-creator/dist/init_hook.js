#!/usr/bin/env node
// Add a minimal hook rule and script to an existing plugin directory.
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, statSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_HOOKS_PATH, GOOSE_ENVELOPE_VERSION, GOOSE_NAMESPACE, GOOSE_NAMESPACE_ALIASES, HOOK_EVENTS, LEGACY_HOOKS_PATH } from "./hook_format.js";
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export class UsageError extends Error {
}
export function parseInitArgs(argv) {
    const positional = [];
    let matcher = null;
    let timeout = 30;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--matcher") {
            const value = argv[++i];
            if (value === undefined)
                throw new UsageError("--matcher requires a value");
            matcher = value;
        }
        else if (arg === "--timeout") {
            const value = argv[++i];
            if (value === undefined)
                throw new UsageError("--timeout requires a value");
            timeout = Number(value);
        }
        else if (arg.startsWith("--matcher=")) {
            matcher = arg.slice("--matcher=".length);
        }
        else if (arg.startsWith("--timeout=")) {
            timeout = Number(arg.slice("--timeout=".length));
        }
        else if (arg.startsWith("-")) {
            throw new UsageError(`unknown option: ${arg}`);
        }
        else {
            positional.push(arg);
        }
    }
    if (positional.length !== 3) {
        throw new UsageError("usage: init_hook.js <plugin_dir> <event> <name> [--matcher <regex>] [--timeout <n>]");
    }
    const [pluginDir, event, name] = positional;
    if (!HOOK_EVENTS.has(event)) {
        throw new UsageError(`invalid event: ${event} (choices: ${Array.from(HOOK_EVENTS).sort().join(", ")})`);
    }
    if (!NAME_RE.test(name))
        throw new UsageError("Handler name must be lowercase kebab-case");
    if (matcher !== null) {
        try {
            new RegExp(matcher);
        }
        catch (error) {
            throw new UsageError(`Invalid matcher regex: ${error.message}`);
        }
    }
    if (!Number.isFinite(timeout) || !Number.isInteger(timeout) || timeout <= 0) {
        throw new UsageError("Timeout must be a positive integer");
    }
    return { pluginDir, event, name, matcher, timeout };
}
export function initHook(options) {
    const { pluginDir, event, name, matcher, timeout } = options;
    const root = resolve(pluginDir);
    const manifest = join(root, "plugin.json");
    if (!existsSync(manifest))
        throw new Error(`Plugin manifest not found: ${manifest}`);
    const hooksPath = join(root, ...CANONICAL_HOOKS_PATH.split("/"));
    const legacyHooksPath = join(root, ...LEGACY_HOOKS_PATH.split("/"));
    const scriptPath = join(root, "scripts", `${name}.sh`);
    if (existsSync(legacyHooksPath))
        throw new Error(`Legacy hooks found at ${LEGACY_HOOKS_PATH}; migrate explicitly before adding canonical hooks`);
    if (existsSync(scriptPath))
        throw new Error(`Refusing to overwrite existing script: ${scriptPath}`);
    const manifestValue = JSON.parse(readFileSync(manifest, "utf-8"));
    const extensions = (manifestValue.extensions ?? {});
    if (typeof extensions !== "object" || extensions === null || Array.isArray(extensions))
        throw new Error("plugin.json extensions must be an object");
    for (const alias of GOOSE_NAMESPACE_ALIASES)
        if (alias in extensions)
            throw new Error(`Unsupported Goose namespace alias '${alias}'`);
    const existing = extensions[GOOSE_NAMESPACE];
    if (existing && (existing.version !== GOOSE_ENVELOPE_VERSION || existing.hooks !== CANONICAL_HOOKS_PATH))
        throw new Error(`Conflicting ${GOOSE_NAMESPACE} extension envelope`);
    extensions[GOOSE_NAMESPACE] = { version: GOOSE_ENVELOPE_VERSION, hooks: CANONICAL_HOOKS_PATH };
    manifestValue.extensions = extensions;
    mkdirSync(join(root, "extensions", GOOSE_NAMESPACE), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    let document;
    if (existsSync(hooksPath)) {
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(hooksPath, "utf-8"));
        }
        catch (error) {
            throw new Error(`Cannot update invalid hooks.json: ${error.message}`);
        }
        const candidate = parsed;
        if (typeof candidate.hooks !== "object" || candidate.hooks === null || Array.isArray(candidate.hooks)) {
            throw new Error("Existing hooks.json must contain a top-level hooks object");
        }
        document = candidate;
    }
    else {
        document = { hooks: {} };
    }
    const rule = { hooks: [{ type: "command", command: `\${PLUGIN_ROOT}/scripts/${name}.sh`, timeout }] };
    if (matcher !== null)
        rule.matcher = matcher;
    document.hooks[event] = document.hooks[event] ?? [];
    document.hooks[event].push(rule);
    writeFileSync(manifest, `${JSON.stringify(manifestValue, null, 2)}\n`, "utf-8");
    writeFileSync(hooksPath, `${JSON.stringify(document, null, 2)}\n`, "utf-8");
    writeFileSync(scriptPath, "#!/usr/bin/env sh\nset -eu\npayload=$(cat 2>/dev/null || printf '{}')\n" +
        "# Implement trusted local automation using the JSON payload.\n" +
        "printf '%s' \"$payload\" >/dev/null\nexit 0\n", "utf-8");
    chmodSync(scriptPath, statSync(scriptPath).mode | 0o111);
    return { hooksPath, scriptPath };
}
function isMain(metaUrl) {
    if (!process.argv[1])
        return false;
    try {
        return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(process.argv[1]));
    }
    catch {
        return false;
    }
}
function legacyMain() {
    try {
        const result = initHook(parseInitArgs(process.argv.slice(2)));
        console.log(result.hooksPath);
        console.log(result.scriptPath);
    }
    catch (error) {
        console.error(`error: ${error.message}`);
        process.exitCode = 2;
    }
}
if (isMain(import.meta.url))
    legacyMain();
