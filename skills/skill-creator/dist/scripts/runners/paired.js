export class PairedExecutionError extends Error {
    code;
    exitReason;
    exitCode;
    evidence;
    constructor(code, message, exitReason, exitCode = null, evidence) {
        super(message);
        this.code = code;
        this.exitReason = exitReason;
        this.exitCode = exitCode;
        this.evidence = evidence;
        this.name = "PairedExecutionError";
    }
}
