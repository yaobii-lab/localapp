import {
  detectSource,
  getCwd,
  gitBranch,
  processCommandLine,
  resolveProject,
  scanListeningPorts
} from "../process/inspect.js";
import { readProjection, recordEvent } from "../registry/projection.js";
import type { Annotation, ListeningPort } from "../types.js";

export interface AdoptOptions {
  port: number;
  note?: string | null;
  // Tri-state: true = --keep, false = --no-keep, null = neither given (inherit
  // the existing annotation's kept flag on re-adopt instead of silently clearing it).
  keep: boolean | null;
  source?: string | null;
}

export async function runAdopt(options: AdoptOptions): Promise<number> {
  const osScan = await scanListeningPorts();
  const listeningPort = osScan.find((entry) => entry.port === options.port);
  if (!listeningPort) {
    process.stderr.write(`Nothing is listening on port ${options.port}\n`);
    return 1;
  }

  const annotations = await readProjection();
  const existing = annotations.find((annotation) => annotationMatches(listeningPort, annotation));
  const serviceId = existing?.id ?? generateServiceId(new Set(annotations.map((item) => item.id)));
  const pid = listeningPort.pid;
  const cwd = await getCwd(pid);
  const project = await resolveProject(cwd);
  const detectedSource = await detectSource(pid);
  const source = options.source ?? detectedSource.source;
  const command = await processCommandLine(pid);
  const branch = cwd ? await gitBranch(cwd) : null;
  const url = `http://localhost:${options.port}`;
  // Sticky kept: an explicit --keep/--no-keep wins; otherwise preserve whatever
  // a prior adopt recorded, so a re-adopt that only updates the note never
  // silently demotes a kept app.
  const kept = options.keep ?? existing?.kept ?? false;

  await recordEvent({
    type: "service_adopted",
    serviceId,
    projectPath: project.path,
    command,
    pid,
    port: options.port,
    url,
    source,
    note: options.note ?? null,
    branch,
    kept,
    parentChain: detectedSource.parentChain,
    at: new Date().toISOString()
  });

  printAdopted({
    id: serviceId,
    project: project.name ?? project.path,
    command,
    url,
    pid,
    source,
    branch,
    note: options.note ?? null,
    kept
  });
  return 0;
}

function annotationMatches(entry: ListeningPort, annotation: Annotation): boolean {
  if (annotation.pid && annotation.pid === entry.pid) return true;
  if (annotation.port && annotation.port === entry.port) return true;
  return false;
}

function generateServiceId(existing: Set<string>): string {
  while (true) {
    const id = `svc_${Math.random().toString(36).slice(2, 7)}`;
    if (!existing.has(id)) return id;
  }
}

function printAdopted(service: {
  id: string;
  project: string | null;
  command: string | null;
  url: string;
  pid: number;
  source: string;
  branch: string | null;
  note: string | null;
  kept: boolean;
}): void {
  process.stdout.write(
    [
      "Adopted service",
      `ID: ${service.id}`,
      `Project: ${service.project ?? "-"}`,
      `Command: ${service.command ?? "-"}`,
      `URL: ${service.url}`,
      `PID: ${service.pid}`,
      `Source: ${service.source}`,
      `Branch: ${service.branch ?? "-"}`,
      `Note: ${service.note ?? "-"}`,
      `Kept: ${service.kept ? "yes" : "no"}`,
      ""
    ].join("\n")
  );
}
