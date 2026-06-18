import type { Annotation, ListeningPort, Service } from "../types.js";

export function joinServices(osScan: ListeningPort[], annotations: Annotation[]): Service[] {
  const usedAnnotations = new Set<number>();
  const services = osScan.map((entry) => {
    const annotationIndex = findAnnotationIndex(entry, annotations, usedAnnotations);
    const annotation = annotationIndex >= 0 ? annotations[annotationIndex] : null;
    if (annotationIndex >= 0) usedAnnotations.add(annotationIndex);

    return serviceFromListeningPort(entry, annotation);
  });

  annotations.forEach((annotation, index) => {
    if (!usedAnnotations.has(index) && annotation.port) {
      services.push(serviceFromStaleAnnotation(annotation));
      usedAnnotations.add(index);
    }
  });

  annotations.forEach((annotation, index) => {
    if (
      !usedAnnotations.has(index) &&
      (annotation.status === "starting" || annotation.status === "stopped")
    ) {
      services.push(serviceFromAnnotation(annotation));
    }
  });

  markDuplicates(services);
  return services.sort(
    (a, b) => (a.port ?? Number.POSITIVE_INFINITY) - (b.port ?? Number.POSITIVE_INFINITY)
  );
}

function findAnnotationIndex(
  entry: ListeningPort,
  annotations: Annotation[],
  usedAnnotations: Set<number>
): number {
  const pidMatch = annotations.findIndex(
    (annotation, index) => !usedAnnotations.has(index) && annotation.pid === entry.pid
  );
  if (pidMatch >= 0) return pidMatch;

  return annotations.findIndex(
    (annotation, index) =>
      !usedAnnotations.has(index) && !annotation.pid && annotation.port === entry.port
  );
}

function serviceFromListeningPort(entry: ListeningPort, annotation: Annotation | null): Service {
  const projectPath = entry.projectPath ?? annotation?.projectPath ?? null;
  const projectName = entry.projectName ?? basenameOrNull(projectPath);
  const port = annotation?.port ?? entry.port;

  return {
    id: annotation?.id ?? null,
    status: "running",
    projectPath,
    projectName,
    command: annotation?.command ?? null,
    port,
    url: annotation?.url ?? `http://localhost:${port}`,
    pid: entry.pid,
    source: annotation?.source ?? "unknown",
    note: annotation?.note ?? null,
    branch: annotation?.branch ?? null,
    kept: annotation?.kept ?? false,
    health: annotation?.health ?? null,
    duplicateOf: null,
    startedAt: annotation?.startedAt ?? null,
    lastSeenAt: annotation?.lastSeenAt ?? null
  };
}

function serviceFromStaleAnnotation(annotation: Annotation): Service {
  const port = annotation.port as number;
  return {
    id: annotation.id,
    status: annotation.status === "stopped" ? "stopped" : "stale",
    projectPath: annotation.projectPath ?? null,
    projectName: basenameOrNull(annotation.projectPath ?? null),
    command: annotation.command ?? null,
    port,
    url: annotation.url ?? `http://localhost:${port}`,
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

function serviceFromAnnotation(annotation: Annotation): Service {
  return {
    id: annotation.id,
    status: annotation.status === "stopped" ? "stopped" : "starting",
    projectPath: annotation.projectPath ?? null,
    projectName: basenameOrNull(annotation.projectPath ?? null),
    command: annotation.command ?? null,
    port: annotation.port ?? null,
    url: annotation.url ?? null,
    pid: annotation.pid ?? null,
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

function markDuplicates(services: Service[]): void {
  const firstByDedupKey = new Map<string, Service>();
  for (const service of services) {
    if (service.status !== "running" || !service.projectPath || !service.command) continue;

    const key = `${service.projectPath}\0${service.command}`;
    const first = firstByDedupKey.get(key);
    if (!first) {
      firstByDedupKey.set(key, service);
      continue;
    }

    service.duplicateOf = first.id ?? `port:${first.port}`;
  }
}

function basenameOrNull(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}
