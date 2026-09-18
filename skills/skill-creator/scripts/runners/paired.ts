// Contracts for one isolated, non-interactive behavioral evaluation run.
export type PairedFailureCode =
  | "invalid-plan"
  | "command-not-found"
  | "timeout"
  | "cancelled"
  | "model-unavailable"
  | "model-rejected"
  | "tool-unavailable"
  | "tool-rejected"
  | "invalid-cwd"
  | "capability-mismatch"
  | "host-exit"
  | "invalid-response"
  | "incomplete";

export interface PairedExecutionEvidence {
  transcript: string;
  events: Array<Record<string, unknown>>;
  durationSeconds: number;
  hostVersion: string;
  exitReason: string;
  exitCode: number | null;
  command: string[];
}

export class PairedExecutionError extends Error {
  constructor(
    public readonly code: PairedFailureCode,
    message: string,
    public readonly exitReason: string,
    public readonly exitCode: number | null = null,
    public readonly evidence?: PairedExecutionEvidence,
  ) {
    super(message);
    this.name = "PairedExecutionError";
  }
}

export interface DeclaredCapabilities {
  filesystem: boolean;
  agent_runner: boolean;
  browser: boolean;
  network: boolean;
  tools: string[];
}

export interface PairedExecutionPlan {
  prompt: string;
  assertions: string[];
  cwd: string;
  model: string | null;
  tools: string[];
  capabilities?: DeclaredCapabilities;
  maxTurns?: number;
  timeoutSeconds: number;
  configuration?: string;
  skillName?: string;
  signal?: AbortSignal;
  seed?: number;
  pairIndex?: number;
  orderPosition?: number;
  fixtureSha256?: string;
}

export interface PairedExecutionResult extends PairedExecutionEvidence {
  output: string;
  expectations: Array<{ text: string; passed: boolean; evidence: string }>;
  tokens: number | null;
  tokenAvailabilityReason: string | null;
  exitCode: number;
}

export interface PairedRunner {
  executePaired(plan: PairedExecutionPlan): Promise<PairedExecutionResult>;
}
