import { realpath } from "node:fs/promises";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { listeningPortsForPidTree } from "../process/inspect.js";
import type { RunCommand } from "../types.js";

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function probePort(port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolveProbe(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
  });
}

export async function liveListeningPort(
  pid: number,
  storedPort: number | null,
  runCommand?: RunCommand
): Promise<number | null> {
  try {
    const ports = await listeningPortsForPidTree(pid, runCommand);
    if (storedPort && ports.some((entry) => entry.port === storedPort)) return storedPort;
    return ports[0]?.port ?? null;
  } catch {
    return null;
  }
}

export async function sameRealpath(left: string, right: string): Promise<boolean> {
  return (await realProjectPath(left)) === (await realProjectPath(right));
}

export async function realProjectPath(path: string): Promise<string> {
  const resolved = resolve(path);
  try {
    return await realpath(resolved);
  } catch {
    return resolved;
  }
}
