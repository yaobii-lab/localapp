export type AgentName = "claude" | "codex" | "cursor";
export type IntegrationStatus = "complete" | "missing" | "conflicted";
export type IntegrationOutcome =
  | "configured"
  | "removed"
  | "unchanged"
  | "missing"
  | "skipped"
  | "conflicted"
  | "failed";

export interface IntegrationResult {
  agent: AgentName;
  outcome: IntegrationOutcome;
  detail: string;
}

export interface InitOptions {
  home: string;
  agents?: AgentName[];
  yes?: boolean;
  dryRun?: boolean;
  status?: boolean;
  uninstall?: boolean;
}

export interface InitResult {
  exitCode: number;
  detected: AgentName[];
  results: IntegrationResult[];
}
