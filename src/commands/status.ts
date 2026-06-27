import { joinServices } from "../core/join.js";
import { renderPortStatusHuman, renderPortStatusJson } from "../output/status.js";
import type { Annotation, ListeningPort, PortStatus, Service } from "../types.js";

export interface StatusOptions {
  port: number;
  json: boolean;
}

export async function runStatus(
  options: StatusOptions,
  deps: {
    scanListeningPorts: () => Promise<ListeningPort[]>;
    readProjection: () => Promise<Annotation[]>;
  }
): Promise<number> {
  const [osScan, annotations] = await Promise.all([deps.scanListeningPorts(), deps.readProjection()]);
  const status = resolvePortStatus(options.port, osScan, annotations);
  process.stdout.write(`${options.json ? renderPortStatusJson(status) : renderPortStatusHuman(status)}\n`);
  return 0;
}

export function resolvePortStatus(
  port: number,
  osScan: ListeningPort[],
  annotations: Annotation[]
): PortStatus {
  const services = joinServices(osScan, annotations);
  const listener = osScan.find((entry) => entry.port === port) ?? null;
  const listenerAnnotation = listener
    ? annotations.find((annotation) => annotation.pid === listener.pid)
    : null;
  const unmanagedLiveService =
    listener && !listenerAnnotation
      ? serviceFromListener(listener)
      : null;
  const managedLiveService = listenerAnnotation
    ? services.find((service) => service.id === listenerAnnotation.id) ?? null
    : null;
  const recentRecords = annotations
    .filter((annotation) => annotation.port === port && annotation.id !== managedLiveService?.id)
    .map(serviceFromAnnotation)
    .sort((left, right) => timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt));

  if (listener && managedLiveService) {
    return {
      port,
      state: "managed_running",
      listener,
      service: managedLiveService,
      recentRecords,
      suggestedActions: []
    };
  }

  if (listener) {
    return {
      port,
      state: "unmanaged_running",
      listener,
      service: unmanagedLiveService,
      recentRecords,
      suggestedActions: [`localapp adopt ${port} --note "..."`]
    };
  }

  if (recentRecords.length > 0) {
    return {
      port,
      state: "not_listening_with_record",
      listener: null,
      service: null,
      recentRecords,
      suggestedActions: recoveryActions(recentRecords)
    };
  }

  return {
    port,
    state: "free",
    listener: null,
    service: null,
    recentRecords: [],
    suggestedActions: []
  };
}

function serviceFromListener(listener: ListeningPort): Service {
  return {
    id: null,
    status: "running",
    projectPath: listener.projectPath ?? null,
    projectName: listener.projectName ?? basenameOrNull(listener.projectPath ?? null),
    command: null,
    port: listener.port,
    url: `http://localhost:${listener.port}`,
    pid: listener.pid,
    source: "unknown",
    note: null,
    branch: null,
    kept: false,
    health: null,
    duplicateOf: null,
    startedAt: null,
    lastSeenAt: null
  };
}

function serviceFromAnnotation(annotation: Annotation): Service {
  const port = annotation.port ?? null;
  return {
    id: annotation.id,
    status: annotation.status === "stopped" ? "stopped" : "stale",
    projectPath: annotation.projectPath ?? null,
    projectName: basenameOrNull(annotation.projectPath ?? null),
    command: annotation.command ?? null,
    port,
    url: annotation.url ?? (port === null ? null : `http://localhost:${port}`),
    pid: null,
    source: annotation.source ?? "unknown",
    note: annotation.note ?? null,
    branch: annotation.branch ?? null,
    kept: annotation.kept ?? false,
    health: annotation.health ?? null,
    duplicateOf: null,
    startedAt: annotation.startedAt ?? null,
    lastSeenAt: annotation.lastSeenAt ?? null
  };
}

function recoveryActions(records: Service[]): string[] {
  const actions = records
    .map((record) => record.projectName ?? record.id)
    .filter((value): value is string => value !== null)
    .map((name) => `localapp run ${name}`);
  return [...new Set(actions)];
}

function basenameOrNull(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
