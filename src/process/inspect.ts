import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import type { ListeningPort, RunCommand } from "../types.js";

const execFileAsync = promisify(execFile);

export const defaultRunCommand: RunCommand = async (command, args) => {
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  return stdout;
};

export async function scanListeningPorts(
  runCommand: RunCommand = defaultRunCommand
): Promise<ListeningPort[]> {
  const raw = await runCommand("lsof", [
    "-iTCP",
    "-sTCP:LISTEN",
    "-P",
    "-n",
    "-FpcnL"
  ]);
  const ports = parseLsof(raw);

  return Promise.all(
    ports.map(async (entry) => {
      const cwd = await getCwd(entry.pid, runCommand);
      const project = await resolveProject(cwd);
      return {
        ...entry,
        cwd,
        projectPath: project.path,
        projectName: project.name
      };
    })
  );
}

export async function listeningPortsForPidTree(
  rootPid: number,
  runCommand: RunCommand = defaultRunCommand
): Promise<ListeningPort[]> {
  const pids = await collectPidTree(rootPid, runCommand);
  if (pids.length === 0) return [];

  const raw = await runCommand("lsof", [
    "-a",
    "-iTCP",
    "-sTCP:LISTEN",
    "-P",
    "-n",
    "-FpcnL",
    "-p",
    pids.join(",")
  ]);
  return parseLsof(raw);
}

export async function detectSource(
  pid: number,
  runCommand: RunCommand = defaultRunCommand
): Promise<{ source: string; parentChain: string[] }> {
  const parentChain = await parentProcessChain(pid, runCommand);
  return { source: sourceFromParentChain(parentChain), parentChain };
}

export function sourceFromParentChain(parentChain: string[]): string {
  const normalized = parentChain.map((entry) => entry.toLowerCase());

  if (normalized.some((entry) => entry.includes("codex"))) return "codex";
  if (normalized.some((entry) => entry.includes("claude"))) return "claude";
  if (normalized.some((entry) => entry.includes("cursor"))) return "cursor";
  if (normalized.some((entry) => entry.includes("cline"))) return "cline";
  if (normalized.some((entry) => entry.includes("aider"))) return "aider";
  if (
    normalized.length > 0 &&
    normalized.every((entry) => /\b(zsh|bash|fish|sh|tmux|screen)\b/.test(entry))
  ) {
    return "human";
  }

  return "unknown";
}

export async function gitBranch(
  cwd: string,
  runCommand: RunCommand = defaultRunCommand
): Promise<string | null> {
  try {
    const raw = await runCommand("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = raw.trim();
    if (!branch || branch === "HEAD") return null;
    return branch;
  } catch {
    return null;
  }
}

export async function processCommandLine(
  pid: number,
  runCommand: RunCommand = defaultRunCommand
): Promise<string | null> {
  try {
    const raw = await runCommand("ps", ["-ww", "-o", "args=", "-p", String(pid)]);
    const command = raw.trim();
    return command || null;
  } catch {
    return null;
  }
}

export function parseLsof(raw: string): ListeningPort[] {
  const results: ListeningPort[] = [];
  const seen = new Set<string>();
  let pid: number | null = null;
  let command: string | null = null;
  let user: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const field = line[0];
    const value = line.slice(1);

    if (field === "p") {
      pid = parsePositiveInteger(value);
      command = null;
      user = null;
      continue;
    }
    if (field === "c") {
      command = value || null;
      continue;
    }
    if (field === "L") {
      user = value || null;
      continue;
    }
    if (field !== "n" || pid === null) continue;

    const port = parsePortFromName(value);
    if (port === null) continue;

    const key = `${pid}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ port, pid, command, user });
  }

  return results.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

export async function getCwd(
  pid: number,
  runCommand: RunCommand = defaultRunCommand
): Promise<string | null> {
  try {
    const raw = await runCommand("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    return parseCwd(raw);
  } catch {
    return null;
  }
}

export function parseCwd(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("n") && line.length > 1) return line.slice(1);
  }
  return null;
}

export function parseParentProcess(raw: string): { ppid: number; command: string } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  const ppid = parsePositiveInteger(match[1]);
  if (ppid === null) return null;
  return { ppid, command: match[2].trim() };
}

export async function resolveProject(
  cwd: string | null | undefined
): Promise<{ path: string | null; name: string | null }> {
  if (!cwd) return { path: null, name: null };

  const start = resolve(cwd);
  const home = resolve(homedir());
  let current = start;

  while (true) {
    // Home is never a project root (avoids ~/package.json false hits) and we do
    // not look above it. Reaching home without a marker means "no project".
    if (current === home) return { path: null, name: null };

    if ((await pathExists(`${current}/.git`)) || (await pathExists(`${current}/package.json`))) {
      return { path: current, name: basename(current) };
    }

    const parent = dirname(current);
    // Filesystem root reached with no marker (typical for system/app processes
    // whose cwd lives outside home). Do NOT fabricate a project from
    // basename(cwd) — an honest null beats a misleading "MacOS"/"Data" name.
    if (parent === current) return { path: null, name: null };
    current = parent;
  }
}

function parsePortFromName(name: string): number | null {
  const match = name.match(/:(\d+)(?:\s|$|\))/);
  if (!match) return null;
  return parsePositiveInteger(match[1]);
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectPidTree(rootPid: number, runCommand: RunCommand): Promise<number[]> {
  const seen = new Set<number>();
  const queue = [rootPid];

  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);

    try {
      const raw = await runCommand("pgrep", ["-P", String(pid)]);
      for (const line of raw.split(/\r?\n/)) {
        const childPid = parsePositiveInteger(line.trim());
        if (childPid !== null && !seen.has(childPid)) queue.push(childPid);
      }
    } catch {
      // A process with no children makes pgrep exit non-zero. That is normal.
    }
  }

  return [...seen];
}

async function parentProcessChain(pid: number, runCommand: RunCommand): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<number>();
  let currentPid = pid;

  while (currentPid > 1 && !seen.has(currentPid) && chain.length < 24) {
    seen.add(currentPid);
    let raw: string;
    try {
      raw = await runCommand("ps", ["-o", "ppid=,comm=", "-p", String(currentPid)]);
    } catch {
      break;
    }

    const parsed = parseParentProcess(raw);
    if (!parsed) break;
    chain.push(parsed.command);
    currentPid = parsed.ppid;
  }

  return chain;
}
