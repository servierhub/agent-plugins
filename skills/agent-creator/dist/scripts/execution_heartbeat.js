/** Privacy-safe progress heartbeats for long-running agent executions. */
export const EXECUTION_HEARTBEAT_SCHEMA = "agent-creator.execution-heartbeat/v1";
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled", "terminated"]);
const PROTECTED_KEY = /(?:prompt|content|message|response|output|input|secret|token|password|authorization|credential|api[_-]?key)/i;
const systemClock = {
    now: () => Date.now(),
    setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
    clearInterval: handle => clearInterval(handle),
};
function millis(value) {
    if (value === undefined)
        return undefined;
    const result = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(result) ? result : undefined;
}
function nonnegative(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
function statusOf(value) {
    if (value === "queued")
        return "pending";
    if (value === "in_progress")
        return "running";
    if (value === "succeeded")
        return "completed";
    if (value === "error")
        return "failed";
    if (value === "retrying")
        return "retry";
    return ["pending", "running", "completed", "failed", "retry"].includes(value) ? value : undefined;
}
/** Redacts protected fields before arbitrary checkpoint values cross an event boundary. */
export function redactHeartbeatValue(value, seen = new WeakSet(), topLevel = true) {
    // A scalar checkpoint may itself be prompt/output content. It has no key that can
    // establish safety, so never publish it verbatim. Named object fields can retain
    // non-sensitive progress metadata while protected keys are still redacted.
    if (value === null || value === undefined)
        return null;
    if (typeof value !== "object")
        return topLevel ? "[REDACTED]" : value;
    if (Array.isArray(value))
        return value.map(item => redactHeartbeatValue(item, seen, false));
    if (seen.has(value))
        return "[REDACTED]";
    seen.add(value);
    const output = {};
    for (const [key, child] of Object.entries(value)) {
        output[key] = PROTECTED_KEY.test(key) ? "[REDACTED]" : redactHeartbeatValue(child, seen, false);
    }
    return output;
}
/** Converts one executor snapshot into the stable, event-compatible heartbeat envelope. */
export function buildExecutionHeartbeat(snapshot, now = Date.now(), staleAfterMs = DEFAULT_HEARTBEAT_INTERVAL_MS * 2) {
    const counts = { completed: 0, running: 0, pending: 0, failed: 0, retry: 0 };
    const tasks = snapshot.tasks ?? [];
    for (const task of tasks) {
        const status = statusOf(task.status);
        if (status)
            counts[status]++;
    }
    for (const key of Object.keys(counts)) {
        if (snapshot.counts?.[key] !== undefined)
            counts[key] = nonnegative(snapshot.counts[key]);
    }
    const workerIds = new Set();
    const modelIds = new Set(snapshot.models ?? []);
    for (const task of tasks) {
        if (task.worker && statusOf(task.status) === "running")
            workerIds.add(task.worker);
        if (task.model)
            modelIds.add(task.model);
    }
    // Active workers are derived from running tasks. `workers` may describe the
    // configured pool and must never be reported as current activity.
    const terminal = snapshot.terminal === true || TERMINAL.has(String(snapshot.status ?? "").toLowerCase());
    const activeWorkers = terminal ? 0 : workerIds.size;
    const startedAt = millis(snapshot.startedAt) ?? now;
    const updatedAt = millis(snapshot.updatedAt);
    const staleFor = updatedAt === undefined ? Math.max(0, now - startedAt) : Math.max(0, now - updatedAt);
    const budgetInputs = { ...(snapshot.budgets ?? {}) };
    if (snapshot.budget)
        budgetInputs[snapshot.budget.unit || "units"] = snapshot.budget;
    const budget = {};
    for (const [unit, value] of Object.entries(budgetInputs)) {
        const consumed = nonnegative(value.consumed ?? value.used);
        const limit = typeof value.limit === "number" && Number.isFinite(value.limit) && value.limit >= 0 ? value.limit : undefined;
        budget[unit] = { consumed, ...(limit === undefined ? {} : { limit, remaining: Math.max(0, limit - consumed), fraction: limit === 0 ? 0 : consumed / limit }) };
    }
    return {
        type: "execution.heartbeat",
        schema_version: EXECUTION_HEARTBEAT_SCHEMA,
        timestamp: new Date(now).toISOString(),
        data: {
            counts,
            workers: { active: activeWorkers, ids: terminal ? [] : [...workerIds].sort() },
            models: [...modelIds].sort(),
            elapsed_ms: Math.max(0, now - startedAt),
            checkpoint: redactHeartbeatValue(snapshot.checkpoint ?? null),
            budget,
            stale: staleFor > staleAfterMs,
            stale_for_ms: staleFor,
            terminal,
        },
    };
}
/** Polls executor snapshots and emits heartbeats until stopped or a terminal snapshot is seen. */
export class ExecutionHeartbeatScheduler {
    snapshot;
    emit;
    handle;
    stopped = false;
    intervalMs;
    staleAfterMs;
    clock;
    constructor(snapshot, emit, options = {}) {
        this.snapshot = snapshot;
        this.emit = emit;
        this.intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        if (!Number.isFinite(this.intervalMs) || this.intervalMs <= 0)
            throw new Error("heartbeat intervalMs must be positive");
        this.staleAfterMs = options.staleAfterMs ?? this.intervalMs * 2;
        if (!Number.isFinite(this.staleAfterMs) || this.staleAfterMs < 0)
            throw new Error("heartbeat staleAfterMs must be non-negative");
        this.clock = options.clock ?? systemClock;
    }
    start() {
        if (this.stopped || this.handle !== undefined)
            return this;
        this.handle = this.clock.setInterval(() => this.tick(), this.intervalMs);
        return this;
    }
    tick() {
        if (this.stopped)
            return undefined;
        const snapshot = this.snapshot();
        if (snapshot.terminal === true || TERMINAL.has(String(snapshot.status ?? "").toLowerCase())) {
            this.stop();
            return undefined;
        }
        const event = buildExecutionHeartbeat(snapshot, this.clock.now(), this.staleAfterMs);
        this.emit(event);
        return event;
    }
    stop() {
        if (this.handle !== undefined)
            this.clock.clearInterval(this.handle);
        this.handle = undefined;
        this.stopped = true;
    }
    get isStopped() { return this.stopped; }
}
export function createExecutionHeartbeat(snapshot, emit, options = {}) {
    return new ExecutionHeartbeatScheduler(snapshot, emit, options).start();
}
