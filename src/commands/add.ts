import { basename } from "node:path";
import { realProjectPath } from "../core/liveness.js";
import { detectSource, gitBranch } from "../process/inspect.js";
import { readProjection, recordEvent } from "../registry/projection.js";
import type { Annotation } from "../types.js";

export interface AddOptions {
  commandArgs: string[];
  projectPath?: string | null;
  source?: string | null;
  note?: string | null;
}

export async function runAdd(options: AddOptions): Promise<number> {
  if (options.commandArgs.length === 0) {
    throw new Error("Missing command after --");
  }

  const projectPath = await realProjectPath(options.projectPath ?? process.cwd());
  const command = formatCommand(options.commandArgs);
  const detectedSource = await detectSource(process.pid);
  const source = options.source ?? detectedSource.source;
  const branch = await gitBranch(projectPath);
  const annotations = await readProjection();
  const serviceId = generateServiceId(new Set(annotations.map((annotation) => annotation.id)));

  await recordEvent({
    type: "service_registered",
    serviceId,
    projectPath,
    command,
    source,
    note: options.note ?? null,
    branch,
    parentChain: detectedSource.parentChain,
    at: new Date().toISOString()
  });

  printAdded({
    id: serviceId,
    project: basename(projectPath),
    command,
    source,
    branch,
    note: options.note ?? null
  });
  return 0;
}

function generateServiceId(existing: Set<string>): string {
  while (true) {
    const id = `svc_${Math.random().toString(36).slice(2, 7)}`;
    if (!existing.has(id)) return id;
  }
}

function formatCommand(commandArgs: string[]): string {
  return commandArgs.map(formatCommandArg).join(" ");
}

function formatCommandArg(arg: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

function printAdded(service: {
  id: string;
  project: string;
  command: string;
  source: string;
  branch: string | null;
  note: string | null;
}): void {
  process.stdout.write(
    [
      `✓ added ${service.project} to shelf`,
      `ID: ${service.id}`,
      `Command: ${service.command}`,
      `Source: ${service.source}`,
      `Branch: ${service.branch ?? "-"}`,
      `Note: ${service.note ?? "-"}`,
      `Open with: localapp run ${service.project}`,
      ""
    ].join("\n")
  );
}

export type { Annotation };
