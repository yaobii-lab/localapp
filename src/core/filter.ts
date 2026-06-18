import type { Service } from "../types.js";

export type ServiceStatusFilter = "default" | "running" | "stopped";

export interface ServiceFilterOptions {
  showAll: boolean;
  status: ServiceStatusFilter;
  currentProjectPath: string | null;
}

export function filterServices(
  services: Service[],
  options: ServiceFilterOptions
): Service[] {
  return services
    .filter((service) => inScope(service, options))
    .filter((service) => inStatus(service, options.status));
}

function inScope(service: Service, options: ServiceFilterOptions): boolean {
  if (options.showAll || options.currentProjectPath === null) return true;
  return service.projectPath === options.currentProjectPath;
}

function inStatus(service: Service, status: ServiceStatusFilter): boolean {
  if (status === "running") return service.status === "running";
  if (status === "stopped") return service.status !== "running";
  return service.status === "running" || service.kept;
}
