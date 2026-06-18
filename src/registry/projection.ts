import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Annotation, Event, PortDetectionMethod } from "../types.js";
import { eventsPath, servicesPath } from "./paths.js";

export async function readProjection(path = servicesPath()): Promise<Annotation[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      if (path !== servicesPath()) return [];
      const rebuilt = rebuildProjection(await readEvents());
      if (rebuilt.length > 0) await writeProjection(rebuilt);
      return rebuilt;
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed.flatMap(toAnnotation);
  if (isRecord(parsed) && Array.isArray(parsed.services)) {
    return parsed.services.flatMap(toAnnotation);
  }
  return [];
}

export async function writeProjection(
  annotations: Annotation[],
  path = servicesPath()
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify({ services: annotations }, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

export async function appendEvent(event: Event, path = eventsPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
}

export async function readEvents(path = eventsPath()): Promise<Event[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return toEvent(JSON.parse(line));
      } catch {
        return [];
      }
    });
}

export async function recordEvent(
  event: Event,
  paths: { events?: string; services?: string } = {}
): Promise<void> {
  await appendEvent(event, paths.events ?? eventsPath());
  const events = await readEvents(paths.events ?? eventsPath());
  await writeProjection(rebuildProjection(events), paths.services ?? servicesPath());
}

export function rebuildProjection(events: Event[]): Annotation[] {
  const annotations = new Map<string, Annotation>();

  for (const event of events) {
    if (event.type === "service_started") {
      annotations.set(event.serviceId, {
        id: event.serviceId,
        status: "starting",
        projectPath: event.projectPath,
        command: event.command,
        port: null,
        url: null,
        pid: event.pid,
        source: event.source,
        note: event.note ?? null,
        branch: event.branch ?? null,
        kept: false,
        health: "unknown",
        startedAt: event.at,
        lastSeenAt: event.at
      });
      continue;
    }

    if (event.type === "service_registered") {
      annotations.set(event.serviceId, {
        id: event.serviceId,
        status: "stopped",
        projectPath: event.projectPath,
        command: event.command,
        port: null,
        url: null,
        pid: null,
        source: event.source,
        note: event.note ?? null,
        branch: event.branch ?? null,
        kept: true,
        health: "unknown",
        startedAt: null,
        lastSeenAt: event.at
      });
      continue;
    }

    if (event.type === "service_adopted") {
      annotations.set(event.serviceId, {
        id: event.serviceId,
        status: "running",
        projectPath: event.projectPath,
        command: event.command,
        port: event.port,
        url: event.url,
        pid: event.pid,
        source: event.source,
        note: event.note,
        branch: event.branch,
        kept: event.kept,
        health: "unknown",
        startedAt: event.at,
        lastSeenAt: event.at
      });
      continue;
    }

    const annotation = annotations.get(event.serviceId);
    if (!annotation) continue;

    if (event.type === "port_detected") {
      annotation.port = event.port;
      annotation.url = event.url;
      annotation.status = event.port ? "running" : "starting";
      annotation.lastSeenAt = event.at;
      continue;
    }

    if (event.type === "service_reused") {
      annotation.lastSeenAt = event.at;
      continue;
    }

    if (event.type === "service_stopped") {
      annotation.status = "stopped";
      annotation.pid = null;
      annotation.lastSeenAt = event.at;
    }
  }

  return [...annotations.values()];
}

function toAnnotation(value: unknown): Annotation[] {
  if (!isRecord(value) || typeof value.id !== "string") return [];
  return [
    {
      id: value.id,
      status: optionalStatus(value.status),
      projectPath: optionalString(value.projectPath),
      command: optionalString(value.command),
      port: optionalNumber(value.port),
      url: optionalString(value.url),
      pid: optionalNumber(value.pid),
      source: optionalString(value.source),
      note: optionalString(value.note),
      branch: optionalString(value.branch),
      kept: optionalBoolean(value.kept) ?? false,
      health: optionalHealth(value.health),
      startedAt: optionalString(value.startedAt),
      lastSeenAt: optionalString(value.lastSeenAt)
    }
  ];
}

function toEvent(value: unknown): Event[] {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.at !== "string") {
    return [];
  }

  if (value.type === "service_started") {
    const pid = optionalNumber(value.pid);
    if (
      typeof value.serviceId !== "string" ||
      typeof value.projectPath !== "string" ||
      typeof value.command !== "string" ||
      pid === null ||
      typeof value.source !== "string" ||
      !Array.isArray(value.parentChain)
    ) {
      return [];
    }
    return [
      {
        type: "service_started",
        serviceId: value.serviceId,
        projectPath: value.projectPath,
        command: value.command,
        pid,
        source: value.source,
        note: optionalString(value.note),
        branch: optionalString(value.branch),
        parentChain: value.parentChain.filter((entry): entry is string => typeof entry === "string"),
        at: value.at
      }
    ];
  }

  if (value.type === "service_registered") {
    if (
      typeof value.serviceId !== "string" ||
      typeof value.projectPath !== "string" ||
      typeof value.command !== "string" ||
      typeof value.source !== "string" ||
      !Array.isArray(value.parentChain)
    ) {
      return [];
    }
    return [
      {
        type: "service_registered",
        serviceId: value.serviceId,
        projectPath: value.projectPath,
        command: value.command,
        source: value.source,
        note: optionalString(value.note),
        branch: optionalString(value.branch),
        parentChain: value.parentChain.filter((entry): entry is string => typeof entry === "string"),
        at: value.at
      }
    ];
  }

  if (value.type === "service_adopted") {
    const pid = optionalNumber(value.pid);
    const port = optionalNumber(value.port);
    if (
      typeof value.serviceId !== "string" ||
      pid === null ||
      port === null ||
      typeof value.url !== "string" ||
      typeof value.source !== "string" ||
      typeof value.kept !== "boolean" ||
      !Array.isArray(value.parentChain)
    ) {
      return [];
    }
    return [
      {
        type: "service_adopted",
        serviceId: value.serviceId,
        projectPath: optionalString(value.projectPath),
        command: optionalString(value.command),
        pid,
        port,
        url: value.url,
        source: value.source,
        note: optionalString(value.note),
        branch: optionalString(value.branch),
        kept: value.kept,
        parentChain: value.parentChain.filter((entry): entry is string => typeof entry === "string"),
        at: value.at
      }
    ];
  }

  if (value.type === "port_detected") {
    if (typeof value.serviceId !== "string") return [];
    const method = optionalPortDetectionMethod(value.method);
    return [
      {
        type: "port_detected",
        serviceId: value.serviceId,
        port: optionalNumber(value.port),
        url: optionalString(value.url),
        method,
        at: value.at
      }
    ];
  }

  if (value.type === "service_reused") {
    if (typeof value.serviceId !== "string" || typeof value.requestedBy !== "string") return [];
    return [
      {
        type: "service_reused",
        serviceId: value.serviceId,
        requestedBy: value.requestedBy,
        reason: Array.isArray(value.reason)
          ? value.reason.filter((entry): entry is string => typeof entry === "string")
          : [],
        at: value.at
      }
    ];
  }

  if (value.type === "service_stopped") {
    const pid = optionalNumber(value.pid);
    if (typeof value.serviceId !== "string" || pid === null) return [];
    return [
      {
        type: "service_stopped",
        serviceId: value.serviceId,
        pid,
        exitCode: optionalNumber(value.exitCode),
        signal: optionalString(value.signal),
        at: value.at
      }
    ];
  }

  return [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function optionalHealth(value: unknown): Annotation["health"] {
  if (value === "ok" || value === "fail" || value === "unknown") return value;
  return null;
}

function optionalStatus(value: unknown): Annotation["status"] {
  if (value === "starting" || value === "running" || value === "stale" || value === "stopped") {
    return value;
  }
  return null;
}

function optionalPortDetectionMethod(value: unknown): PortDetectionMethod {
  if (value === "stdout" || value === "process_scan" || value === "unknown") return value;
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
