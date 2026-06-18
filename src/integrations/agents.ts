import { access } from "node:fs/promises";
import { join } from "node:path";
import { LOCALAPP_AGENT_INSTRUCTIONS, cursorRuleContent } from "./content.js";
import type { AgentName } from "./types.js";

export interface AgentAdapter {
  name: AgentName;
  detectionPath: (home: string) => string;
  generatedPath: (home: string) => string;
  entryPath: ((home: string) => string) | null;
  content: () => string;
  unsupportedReason?: string;
}

export const AGENT_ADAPTERS: Record<AgentName, AgentAdapter> = {
  claude: {
    name: "claude",
    detectionPath: (home) => join(home, ".claude"),
    generatedPath: (home) => join(home, ".localapp", "integrations", "claude.md"),
    entryPath: (home) => join(home, ".claude", "CLAUDE.md"),
    content: () => LOCALAPP_AGENT_INSTRUCTIONS
  },
  codex: {
    name: "codex",
    detectionPath: (home) => join(home, ".codex"),
    generatedPath: (home) => join(home, ".localapp", "integrations", "codex.md"),
    entryPath: (home) => join(home, ".codex", "AGENTS.md"),
    content: () => LOCALAPP_AGENT_INSTRUCTIONS
  },
  cursor: {
    name: "cursor",
    detectionPath: (home) => join(home, ".cursor"),
    generatedPath: (home) => join(home, ".cursor", "rules", "localapp.mdc"),
    entryPath: null,
    content: cursorRuleContent,
    unsupportedReason:
      "Cursor exposes global User Rules only through Cursor Settings → Rules; no supported global file mechanism is available"
  }
};

export async function detectAgents(home: string): Promise<AgentName[]> {
  const names = Object.keys(AGENT_ADAPTERS) as AgentName[];
  const detected = await Promise.all(
    names.map(async (name) => {
      try {
        await access(AGENT_ADAPTERS[name].detectionPath(home));
        return name;
      } catch {
        return null;
      }
    })
  );
  return detected.filter((name): name is AgentName => name !== null);
}
