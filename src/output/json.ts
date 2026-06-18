import type { Service } from "../types.js";

export function renderJson(services: Service[]): string {
  return JSON.stringify({ services }, null, 2);
}

