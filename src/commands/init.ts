import { AGENT_ADAPTERS, detectAgents } from "../integrations/agents.js";
import { getIntegrationStatus, installIntegration, uninstallIntegration } from "../integrations/manage.js";
import type { InitOptions, InitResult, IntegrationResult } from "../integrations/types.js";

interface InitDeps {
  confirm: (message: string) => Promise<boolean>;
}

export async function runInit(options: InitOptions, deps?: Partial<InitDeps>): Promise<InitResult> {
  const detected = await detectAgents(options.home);
  const selected = options.agents ?? detected;
  if (!options.status && !options.uninstall && !options.dryRun && !options.yes) {
    const approved = await deps?.confirm?.(`Configure LocalApp for: ${selected.join(", ")}?`);
    if (!approved) {
      return {
        exitCode: 0,
        detected,
        results: selected.map((agent) => ({ agent, outcome: "skipped", detail: "not approved" }))
      };
    }
  }
  const results: IntegrationResult[] = [];
  for (const agent of selected) {
    const adapter = AGENT_ADAPTERS[agent];
    try {
      if (options.status) {
        const status = await getIntegrationStatus(adapter, options.home);
        results.push({ agent, outcome: status === "complete" ? "unchanged" : status, detail: status });
      } else if (options.uninstall) {
        results.push(await uninstallIntegration(adapter, options.home, options.dryRun === true));
      } else {
        results.push(await installIntegration(adapter, options.home, options.dryRun === true));
      }
    } catch (error) {
      results.push({
        agent,
        outcome: "failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const failed = results.some((result) => result.outcome === "failed" || result.outcome === "conflicted");
  return { exitCode: failed ? 1 : 0, detected, results };
}

export type { AgentName, InitOptions, InitResult } from "../integrations/types.js";
