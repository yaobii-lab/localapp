import { homedir } from "node:os";
import { join } from "node:path";

export function servicesPath(): string {
  return join(process.env.HOME || homedir(), ".localapp", "services.json");
}

export function eventsPath(): string {
  return join(process.env.HOME || homedir(), ".localapp", "events.jsonl");
}
