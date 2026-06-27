import type { ListeningPort, PortStatus, Service } from "../types.js";

const EMPTY = "-";

export function renderPortStatusJson(status: PortStatus): string {
  return JSON.stringify(status, null, 2);
}

export function renderPortStatusHuman(status: PortStatus): string {
  const lines = [`Port ${status.port}: ${status.state}`];

  if (status.listener) lines.push(`Listener: ${renderListener(status.listener)}`);
  if (status.service) lines.push(`Service: ${renderService(status.service)}`);
  for (const record of status.recentRecords) lines.push(`Recent record: ${renderService(record)}`);
  for (const action of status.suggestedActions) lines.push(`Try: ${action}`);

  return lines.join("\n");
}

function renderListener(listener: ListeningPort): string {
  return [
    `pid ${listener.pid}`,
    listener.command ? `process ${listener.command}` : null,
    listener.projectPath ? `project ${listener.projectPath}` : null
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

function renderService(service: Service): string {
  return [
    service.id ?? "unmanaged",
    service.status,
    service.command ?? EMPTY,
    service.projectPath ?? EMPTY,
    service.url ?? EMPTY,
    service.pid === null ? EMPTY : `pid ${service.pid}`,
    renderTime(service)
  ]
    .filter((part): part is string => part !== null)
    .join(" | ");
}

function renderTime(service: Service): string | null {
  if (service.lastSeenAt) return `last seen ${service.lastSeenAt}`;
  if (service.startedAt) return `started ${service.startedAt}`;
  return null;
}
