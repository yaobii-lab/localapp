import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

export interface ForegroundChild {
  child: ChildProcessByStdio<null, Readable, Readable>;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  dispose(): void;
}

export interface DetachedChild {
  child: ChildProcess;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export function spawnForeground(
  commandArgs: string[],
  cwd: string,
  handlers: {
    stdout?: (chunk: string) => void;
    stderr?: (chunk: string) => void;
  } = {}
): ForegroundChild {
  const [command, ...args] = commandArgs;
  const child = spawn(command, args, {
    cwd,
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    handlers.stdout?.(chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    handlers.stderr?.(chunk.toString("utf8"));
  });

  const forwardSigint = () => child.kill("SIGINT");
  const forwardSigterm = () => child.kill("SIGTERM");
  process.on("SIGINT", forwardSigint);
  process.on("SIGTERM", forwardSigterm);

  return {
    child,
    exit: new Promise((resolve) => {
      child.on("error", () => resolve({ code: 1, signal: null }));
      child.on("exit", (code, signal) => resolve({ code, signal }));
    }),
    dispose() {
      process.off("SIGINT", forwardSigint);
      process.off("SIGTERM", forwardSigterm);
    }
  };
}

export function spawnDetached(commandArgs: string[], cwd: string): DetachedChild {
  const [command, ...args] = commandArgs;
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore"
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("error", () => resolve({ code: 1, signal: null }));
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  child.unref();
  return { child, exit };
}
