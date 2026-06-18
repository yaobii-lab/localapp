export interface ReuseChecks {
  sameProjectPath: boolean;
  sameCommand: boolean;
  processAlive: boolean;
  portProbedLive: boolean;
}

export interface ReuseDecision {
  reuse: boolean;
  reason: string[];
  failed: string | null;
}

export function evaluateReuse(checks: ReuseChecks): ReuseDecision {
  if (!checks.sameProjectPath) return fail("different_project_path");
  if (!checks.sameCommand) return fail("different_command");
  if (!checks.processAlive) return fail("process_not_alive");
  if (!checks.portProbedLive) return fail("port_probe_failed");

  return {
    reuse: true,
    reason: ["same_project_path", "same_command", "process_alive", "port_probed_live"],
    failed: null
  };
}

function fail(reason: string): ReuseDecision {
  return { reuse: false, reason: [], failed: reason };
}
