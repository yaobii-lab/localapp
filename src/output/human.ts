import type { Service } from "../types.js";

const EMPTY = "—";

export type EmptyReason = "no_services" | "filtered";

export function renderHuman(
  services: Service[],
  options: { emptyReason?: EmptyReason; now?: Date } = {}
): string {
  if (services.length === 0) {
    return emptyState(options.emptyReason ?? "no_services");
  }

  const now = options.now ?? new Date();
  const running = services.filter((service) => service.status === "running");
  const notRunning = services
    .filter((service) => service.status !== "running")
    .sort((left, right) => timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt));
  const groups = [
    renderGroup("Running", running, "STARTED", (service) => service.startedAt, now),
    renderGroup("Not running", notRunning, "LAST SEEN", (service) => service.lastSeenAt, now)
  ].filter((group): group is string => group !== null);

  return groups.join("\n\n");
}

function emptyState(reason: EmptyReason): string {
  if (reason === "filtered") {
    return "No services match this view. Try: localapp ls --all or localapp ls --stopped";
  }

  return 'No services registered yet. Add one with: localapp add --note "..." -- <cmd>';
}

function renderGroup(
  title: string,
  services: Service[],
  timeHeader: string,
  pickTime: (service: Service) => string | null,
  now: Date
): string | null {
  if (services.length === 0) return null;

  const rows = services.map((service) => [
    service.port === null ? EMPTY : String(service.port),
    service.projectName ?? EMPTY,
    `${statusSymbol(service)} ${service.status}`,
    service.url ?? EMPTY,
    relativeTime(pickTime(service), now),
    truncate(service.note),
    serviceTags(service)
  ]);

  const tableRows = [
    ["PORT", "PROJECT", "STATUS", "URL", timeHeader, "NOTE", ""],
    ...rows
  ];
  const widths = tableRows[0].map((_, index) =>
    Math.max(...tableRows.map((row) => row[index]?.length ?? 0))
  );

  return [
    title,
    ...tableRows.map((row) =>
      row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] + 2)))
        .join("")
        .trimEnd()
    )
  ].join("\n");
}

function serviceTags(service: Service): string {
  return [
    service.duplicateOf ? "(duplicate)" : null,
    service.kept ? "(kept)" : null
  ]
    .filter((tag): tag is string => tag !== null)
    .join(" ");
}

function statusSymbol(service: Service): string {
  return service.status === "running" ? "●" : "○";
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function relativeTime(value: string | null, now: Date): string {
  if (!value) return EMPTY;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return EMPTY;

  const diffMs = now.getTime() - parsed;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function truncate(value: string | null, max = 40): string {
  if (!value) return EMPTY;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
