#!/usr/bin/env node
// Run paired custom-agent evaluations with Goose.
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, copyFileSync, cpSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseAgent, renderAgent } from "./agent_format.js";
import { createExecutionHeartbeat } from "./execution_heartbeat.js";
const execFileAsync = promisify(execFile);
export function extractAssistantText(document) {
    const chunks = [];
    for (const message of document?.messages ?? []) {
        if (message?.role !== "assistant")
            continue;
        for (const item of message?.content ?? []) {
            if (item?.type === "text" && typeof item?.text === "string") {
                chunks.push(item.text);
            }
        }
    }
    return chunks.join("\n\n").trim();
}
function baselineAgent(agent, name) {
    const description = `Baseline role for comparison with ${agent.name}`;
    const body = "Complete the delegated task using your general capabilities. " +
        "Follow the user's request, but do not assume specialized role instructions " +
        "that are not present in the task itself.";
    return renderAgent(name, description, agent.model, body);
}
async function runCase(evalCase, configuration, agentPath, workspace, gooseCommand, model, timeoutMs, maxTurns, fixtureRoot) {
    const evalId = evalCase.id;
    const runDir = join(workspace, `eval-${evalId}`, configuration);
    const outputs = join(runDir, "outputs");
    mkdirSync(outputs, { recursive: true });
    const temporary = mkdtempSync(join(tmpdir(), "agent-eval-"));
    let document;
    let duration;
    try {
        const agent = parseAgent(agentPath);
        const installed = join(temporary, ".agents", "agents", `${agent.name}.md`);
        mkdirSync(dirname(installed), { recursive: true });
        copyFileSync(agentPath, installed);
        for (const relative of evalCase.files ?? []) {
            if (relative.startsWith("/") || relative.split(/[\\/]/).includes(".."))
                throw new Error(`Eval ${evalId} fixture path must stay inside the creator: ${relative}`);
            const source = resolve(fixtureRoot, relative), destination = join(temporary, relative);
            let sourceStat;
            try {
                sourceStat = statSync(source);
            }
            catch {
                throw new Error(`Eval ${evalId} fixture does not exist: ${relative}`);
            }
            mkdirSync(dirname(destination), { recursive: true });
            sourceStat.isDirectory() ? cpSync(source, destination, { recursive: true }) : copyFileSync(source, destination);
        }
        const context = JSON.stringify({ subject: evalCase.subject ?? null, language: evalCase.language ?? null, target: evalCase.target ?? null, preconditions: evalCase.preconditions ?? [], capabilities: evalCase.capabilities ?? null });
        const prompt = `Delegate this task to the custom agent named ${agent.name}. ` +
            "Return only the delegated agent's final task result, without discussing the delegation.\n\n" +
            `Evaluation context:\n${context}\n\nTask:\n${evalCase.prompt}`;
        const args = [
            "run",
            "--no-session",
            "--quiet",
            "--output-format",
            "json",
            "--max-turns",
            String(maxTurns),
            "--text",
            prompt,
        ];
        if (model)
            args.push("--model", model);
        const [command, ...baseArgs] = gooseCommand;
        const started = performance.now();
        let stdout;
        try {
            const result = await execFileAsync(command, [...baseArgs, ...args], {
                cwd: temporary,
                timeout: timeoutMs,
                maxBuffer: 1024 * 1024 * 64,
            });
            stdout = result.stdout;
        }
        catch (error) {
            throw new Error(`Goose failed for eval ${evalId}/${configuration}: ${(error.stderr ?? error.message ?? "").trim()}`);
        }
        duration = (performance.now() - started) / 1000;
        try {
            document = JSON.parse(stdout);
        }
        catch (error) {
            throw new Error(`Goose returned invalid JSON: ${error.message}`);
        }
    }
    finally {
        rmSync(temporary, { recursive: true, force: true });
    }
    const outputText = extractAssistantText(document);
    writeFileSync(join(outputs, "response.md"), `${outputText}\n`, "utf-8");
    writeFileSync(join(runDir, "transcript.json"), `${JSON.stringify(document, null, 2)}\n`, "utf-8");
    const metadata = document.metadata ?? {};
    const timing = {
        total_tokens: Number.isFinite(metadata.total_tokens) ? metadata.total_tokens : 0,
        total_turns: Number.isFinite(metadata.total_turns) ? metadata.total_turns : 0,
        total_duration_seconds: Math.round(duration * 1000) / 1000,
    };
    writeFileSync(join(runDir, "timing.json"), `${JSON.stringify(timing, null, 2)}\n`, "utf-8");
    return { eval_id: evalId, configuration, ...timing };
}
export function validateEvalSet(document) {
    if (typeof document !== "object" || document === null || !Array.isArray(document.evals)) {
        throw new Error("Eval set must be an object containing an 'evals' list");
    }
    const cases = document.evals;
    const seen = new Set();
    for (const evalCase of cases) {
        if (typeof evalCase !== "object" || evalCase === null) {
            throw new Error("Each eval must be an object");
        }
        if ((typeof evalCase.id !== "string" && typeof evalCase.id !== "number") ||
            seen.has(evalCase.id)) {
            throw new Error("Each eval must have a unique string or integer id");
        }
        seen.add(evalCase.id);
        if (typeof evalCase.prompt !== "string" || !evalCase.prompt.trim()) {
            throw new Error(`Eval ${evalCase.id} must have a non-empty prompt`);
        }
        for (const field of ["subject", "language"])
            if (typeof evalCase[field] !== "string" || !evalCase[field].trim())
                throw new Error(`Eval ${evalCase.id} must have a non-empty ${field}`);
        if (typeof evalCase.target !== "object" || evalCase.target === null || typeof evalCase.target.kind !== "string")
            throw new Error(`Eval ${evalCase.id} must have a target with kind`);
        if (!Array.isArray(evalCase.preconditions) || !evalCase.preconditions.every(item => typeof item === "string"))
            throw new Error(`Eval ${evalCase.id} preconditions must be a list of strings`);
        if (!Array.isArray(evalCase.files) || !evalCase.files.every(item => typeof item === "string"))
            throw new Error(`Eval ${evalCase.id} files must be a list of strings`);
        const assertions = evalCase.assertions ?? [];
        if (!Array.isArray(assertions) || !assertions.every((item) => typeof item === "string")) {
            throw new Error(`Eval ${evalCase.id} assertions must be a list of strings`);
        }
    }
    return cases;
}
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let index = 0;
    async function worker(workerIndex) {
        while (index < items.length) {
            const current = index;
            index += 1;
            results[current] = await fn(items[current], `worker-${workerIndex + 1}`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, workerIndex) => worker(workerIndex)));
    return results;
}
async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            agent: { type: "string" },
            "eval-set": { type: "string" },
            workspace: { type: "string" },
            "baseline-agent": { type: "string" },
            "goose-cli": { type: "string", default: process.env.AGENT_CREATOR_GOOSE_CLI ?? "goose" },
            model: { type: "string" },
            timeout: { type: "string", default: "600" },
            "max-turns": { type: "string", default: "20" },
            workers: { type: "string", default: "2" },
            "heartbeat-interval": { type: "string", default: "30" },
            "no-heartbeat": { type: "boolean", default: false },
        },
    });
    if (!values.agent || !values["eval-set"] || !values.workspace) {
        console.error("usage: run_agent_eval.js --agent <file> --eval-set <file> --workspace <dir> [options]");
        process.exit(2);
    }
    const agentPath = resolve(values.agent);
    const evalSetPath = resolve(values["eval-set"]);
    const fixtureRoot = dirname(dirname(evalSetPath));
    const agent = parseAgent(agentPath);
    const cases = validateEvalSet(JSON.parse(readFileSync(evalSetPath, "utf-8")));
    const workspace = resolve(values.workspace);
    mkdirSync(workspace, { recursive: true });
    for (const evalCase of cases) {
        const evalDir = join(workspace, `eval-${evalCase.id}`);
        mkdirSync(evalDir, { recursive: true });
        writeFileSync(join(evalDir, "eval_metadata.json"), `${JSON.stringify({
            eval_id: evalCase.id,
            eval_name: evalCase.name ?? String(evalCase.id),
            prompt: evalCase.prompt,
            subject: evalCase.subject ?? "",
            language: evalCase.language ?? "",
            target: evalCase.target ?? {},
            preconditions: evalCase.preconditions ?? [],
            files: evalCase.files ?? [],
            capabilities: evalCase.capabilities ?? {},
            coverage_tags: evalCase.coverage_tags ?? [],
            assertions: evalCase.assertions ?? [],
        }, null, 2)}\n`);
    }
    const temporary = mkdtempSync(join(tmpdir(), "agent-baseline-"));
    let baselineConfiguration;
    let baselinePath;
    try {
        if (values["baseline-agent"]) {
            baselinePath = resolve(values["baseline-agent"]);
            parseAgent(baselinePath);
            baselineConfiguration = "old_agent";
        }
        else {
            const baselineName = `${agent.name}-baseline`;
            baselinePath = join(temporary, `${baselineName}.md`);
            writeFileSync(baselinePath, baselineAgent(agent, baselineName), "utf-8");
            baselineConfiguration = "without_agent_instructions";
        }
        const jobs = [];
        for (const evalCase of cases) {
            jobs.push({ evalCase, configuration: "with_agent", path: agentPath });
            jobs.push({ evalCase, configuration: baselineConfiguration, path: baselinePath });
        }
        const gooseCommand = values["goose-cli"].split(/\s+/).filter(Boolean);
        const workers = Number(values.workers);
        const timeoutMs = Number(values.timeout) * 1000;
        const maxTurns = Number(values["max-turns"]);
        const jobStates = jobs.map(() => "pending");
        const jobWorkers = jobs.map(() => undefined);
        const heartbeatStartedAt = Date.now();
        let heartbeatUpdatedAt = heartbeatStartedAt;
        let executionStatus = "running";
        let consumedTokens = 0;
        let consumedTurns = 0;
        const heartbeatPath = join(workspace, "execution_heartbeats.jsonl");
        const heartbeatIntervalMs = Number(values["heartbeat-interval"]) * 1000;
        if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0)
            throw new Error("--heartbeat-interval must be a positive number of seconds");
        const heartbeat = values["no-heartbeat"] ? undefined : createExecutionHeartbeat(() => ({
            tasks: jobStates.map((status, index) => ({ status, ...(jobWorkers[index] ? { worker: jobWorkers[index] } : {}), ...(values.model ? { model: values.model } : {}) })),
            models: values.model ? [values.model] : [],
            startedAt: heartbeatStartedAt,
            updatedAt: heartbeatUpdatedAt,
            checkpoint: { artifact_ref: "run_summary.json", completed_runs: jobStates.filter(status => status === "completed").length },
            budgets: {
                runs: { consumed: jobStates.filter(status => status === "completed" || status === "failed").length, limit: jobs.length },
                turns: { consumed: consumedTurns, limit: jobs.length * maxTurns },
                tokens: { consumed: consumedTokens },
            },
            status: executionStatus,
        }), event => appendFileSync(heartbeatPath, JSON.stringify(event) + "\n", "utf-8"), { intervalMs: heartbeatIntervalMs });
        let results;
        try {
            results = await mapLimit(jobs.map((job, index) => ({ ...job, index })), workers, async (job, workerId) => {
                jobWorkers[job.index] = workerId;
                jobStates[job.index] = "running";
                heartbeatUpdatedAt = Date.now();
                try {
                    const result = await runCase(job.evalCase, job.configuration, job.path, workspace, gooseCommand, values.model, timeoutMs, maxTurns, fixtureRoot);
                    consumedTokens += result.total_tokens;
                    consumedTurns += result.total_turns;
                    jobStates[job.index] = "completed";
                    console.log(`Completed eval ${result.eval_id} / ${result.configuration} (${result.total_duration_seconds}s)`);
                    return result;
                }
                catch (error) {
                    jobStates[job.index] = "failed";
                    throw error;
                }
                finally {
                    heartbeatUpdatedAt = Date.now();
                }
            });
            executionStatus = "completed";
        }
        catch (error) {
            executionStatus = "failed";
            throw error;
        }
        finally {
            heartbeatUpdatedAt = Date.now();
            heartbeat?.stop();
        }
        const summary = {
            agent: agent.name,
            agent_path: agentPath,
            eval_count: cases.length,
            configurations: ["with_agent", baselineConfiguration],
            runs: results.sort((a, b) => String(a.eval_id) === String(b.eval_id)
                ? a.configuration.localeCompare(b.configuration)
                : String(a.eval_id).localeCompare(String(b.eval_id))),
        };
        writeFileSync(join(workspace, "run_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
        console.log(workspace);
    }
    finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error?.message ?? error);
        process.exit(1);
    });
}
