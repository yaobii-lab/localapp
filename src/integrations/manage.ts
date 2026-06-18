import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentAdapter } from "./agents.js";
import type { IntegrationResult, IntegrationStatus } from "./types.js";

const START = "<!-- localapp:start -->";
const END = "<!-- localapp:end -->";

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function referenceBlock(path: string): string {
  return `${START}\n@${path}\n${END}\n`;
}

function referenceState(entry: string | null, path: string): "complete" | "missing" | "conflicted" {
  if (entry === null) return "missing";
  const hasStart = entry.includes(START);
  const hasEnd = entry.includes(END);
  if (hasStart !== hasEnd) return "conflicted";
  if (!hasStart) return "missing";
  return entry.includes(referenceBlock(path)) ? "complete" : "conflicted";
}

export async function getIntegrationStatus(
  adapter: AgentAdapter,
  home: string
): Promise<IntegrationStatus> {
  if (adapter.unsupportedReason) return "conflicted";
  const generatedPath = adapter.generatedPath(home);
  const generated = await readOptional(generatedPath);
  if (generated !== null && generated !== adapter.content()) return "conflicted";
  if (generated === null) return "missing";
  if (!adapter.entryPath) return "complete";
  return referenceState(await readOptional(adapter.entryPath(home)), generatedPath);
}

export async function installIntegration(
  adapter: AgentAdapter,
  home: string,
  dryRun: boolean
): Promise<IntegrationResult> {
  if (adapter.unsupportedReason) {
    return { agent: adapter.name, outcome: "conflicted", detail: adapter.unsupportedReason };
  }
  const generatedPath = adapter.generatedPath(home);
  const generated = await readOptional(generatedPath);
  if (generated !== null && generated !== adapter.content()) {
    return { agent: adapter.name, outcome: "conflicted", detail: `modified file: ${generatedPath}` };
  }
  const entryPath = adapter.entryPath?.(home) ?? null;
  const entry = entryPath ? await readOptional(entryPath) : null;
  if (entryPath && referenceState(entry, generatedPath) === "conflicted") {
    return { agent: adapter.name, outcome: "conflicted", detail: `reference conflict: ${entryPath}` };
  }
  const alreadyComplete =
    generated === adapter.content() && (!entryPath || referenceState(entry, generatedPath) === "complete");
  if (alreadyComplete) {
    return { agent: adapter.name, outcome: "unchanged", detail: "already configured" };
  }
  if (!dryRun) {
    await mkdir(dirname(generatedPath), { recursive: true });
    await writeFile(generatedPath, adapter.content(), "utf8");
    if (entryPath && referenceState(entry, generatedPath) === "missing") {
      await mkdir(dirname(entryPath), { recursive: true });
      await writeFile(entryPath, `${entry ?? ""}${referenceBlock(generatedPath)}`, "utf8");
    }
  }
  return {
    agent: adapter.name,
    outcome: "configured",
    detail: dryRun ? `would configure ${generatedPath}` : `configured ${generatedPath}`
  };
}

export async function uninstallIntegration(
  adapter: AgentAdapter,
  home: string,
  dryRun: boolean
): Promise<IntegrationResult> {
  if (adapter.unsupportedReason) {
    return { agent: adapter.name, outcome: "unchanged", detail: adapter.unsupportedReason };
  }
  const generatedPath = adapter.generatedPath(home);
  const generated = await readOptional(generatedPath);
  if (generated !== null && generated !== adapter.content()) {
    return { agent: adapter.name, outcome: "conflicted", detail: `modified file: ${generatedPath}` };
  }
  const entryPath = adapter.entryPath?.(home) ?? null;
  const entry = entryPath ? await readOptional(entryPath) : null;
  if (entryPath && referenceState(entry, generatedPath) === "conflicted") {
    return { agent: adapter.name, outcome: "conflicted", detail: `reference conflict: ${entryPath}` };
  }
  if (generated === null && (!entryPath || referenceState(entry, generatedPath) === "missing")) {
    return { agent: adapter.name, outcome: "unchanged", detail: "not configured" };
  }
  if (!dryRun) {
    if (entryPath && entry !== null) {
      await writeFile(entryPath, entry.replace(referenceBlock(generatedPath), ""), "utf8");
    }
    await rm(generatedPath, { force: true });
  }
  return {
    agent: adapter.name,
    outcome: "removed",
    detail: dryRun ? `would remove ${generatedPath}` : `removed ${generatedPath}`
  };
}
