import { basename } from "node:path";
import { isProcessAlive, liveListeningPort, probePort } from "../core/liveness.js";
import { runLocalApp, type RunOptions } from "./run.js";
import type { Annotation } from "../types.js";

export interface OpenOptions {
  app: string;
  foreground?: boolean;
}

interface OpenDeps {
  runLocalApp: (options: RunOptions) => Promise<number>;
  livePortForAnnotation: (annotation: Annotation) => Promise<number | null>;
}

export async function runOpen(
  options: OpenOptions,
  annotations: Annotation[],
  deps: Partial<OpenDeps> = {}
): Promise<number> {
  const matches = resolveOpenTargets(annotations, options.app);
  if (matches.length === 0) {
    process.stderr.write(
      `no registered service matching '${options.app}'\nTry: localapp ls --all\n`
    );
    return 1;
  }

  const targets = await resolveLiveOpenTargets(
    matches,
    deps.livePortForAnnotation ?? livePortForAnnotation
  );
  if (targets.length > 1) {
    process.stderr.write(renderOpenCandidates(targets.map(renderableAnnotation)));
    return 1;
  }

  const target = targets[0] as OpenTarget;
  const { annotation, livePort } = target;
  if (livePort !== null) {
    const url =
      annotation.port === livePort && annotation.url
        ? annotation.url
        : `http://localhost:${livePort}`;
    const name = projectBasename(annotation) ?? annotation.id ?? "service";
    process.stdout.write(`✓ ${name} alive at ${url}\n`);
    return 0;
  }

  if (!annotation.command || !annotation.projectPath) {
    process.stderr.write("no launch recipe recorded for this service\n");
    return 1;
  }

  const command = canonicalReplayCommand(annotation.command);
  let replayDetectedPort = false;
  let replayStoppedBySignal = false;
  const exitCode = await (deps.runLocalApp ?? runLocalApp)({
    commandArgs: ["sh", "-c", command],
    projectPath: annotation.projectPath,
    note: annotation.note,
    source: null,
    noReuse: true,
    serviceId: annotation.id,
    recordedCommand: command,
    detached: options.foreground !== true,
    onPortDetected: (detection) => {
      replayDetectedPort = detection.port !== null;
    },
    onExit: (exit) => {
      replayStoppedBySignal = exit.signal !== null;
    }
  });

  if (shouldPrintRecipeFailure(exitCode, replayDetectedPort, replayStoppedBySignal)) {
    process.stderr.write(
      "recipe failed to start - likely the project's own environment (venv / deps / env vars), not localapp's to fix\n"
    );
  }

  return exitCode;
}

interface OpenTarget {
  annotation: Annotation;
  livePort: number | null;
}

async function resolveLiveOpenTargets(
  annotations: Annotation[],
  getLivePort: OpenDeps["livePortForAnnotation"]
): Promise<OpenTarget[]> {
  const targets = await Promise.all(
    annotations.map(async (annotation) => ({
      annotation,
      livePort: await getLivePort(annotation)
    }))
  );
  const targetsByRecipe = new Map<string, OpenTarget[]>();
  for (const target of targets) {
    const key = recipeIdentity(target.annotation);
    targetsByRecipe.set(key, [...(targetsByRecipe.get(key) ?? []), target]);
  }

  return [...targetsByRecipe.values()].flatMap((recipeTargets) => {
    const liveTargets = recipeTargets.filter((target) => target.livePort !== null);
    if (liveTargets.length > 0) return liveTargets;
    return recipeTargets.reduce((latest, target) =>
      lastSeen(target.annotation) >= lastSeen(latest.annotation) ? target : latest
    );
  });
}

function recipeIdentity(annotation: Annotation): string {
  return `${annotation.projectPath ?? ""}\0${canonicalReplayCommand(annotation.command ?? "")}`;
}

function lastSeen(annotation: Annotation): string {
  return annotation.lastSeenAt ?? annotation.startedAt ?? "";
}

function renderableAnnotation(target: OpenTarget): Annotation {
  if (target.livePort !== null) return { ...target.annotation, status: "running" };
  return {
    ...target.annotation,
    status: target.annotation.status === "stopped" ? "stopped" : "stale",
    pid: null
  };
}

export function shouldPrintRecipeFailure(
  exitCode: number,
  replayDetectedPort: boolean,
  replayStoppedBySignal: boolean
): boolean {
  return exitCode !== 0 && !replayDetectedPort && !replayStoppedBySignal;
}

export function resolveOpenTargets(annotations: Annotation[], app: string): Annotation[] {
  const exactId = annotations.filter((annotation) => annotation.id === app);
  if (exactId.length > 0) return exactId;

  const exactBasename = annotations.filter((annotation) => projectBasename(annotation) === app);
  if (exactBasename.length > 0) return exactBasename;

  return annotations.filter((annotation) => {
    const name = projectBasename(annotation);
    return name !== null && name.includes(app);
  });
}

export function canonicalReplayCommand(command: string): string {
  let current = command;
  while (current.startsWith("sh -c ")) {
    const decoded = decodeFormattedCommandArg(current.slice("sh -c ".length));
    if (decoded === null) break;
    current = decoded;
  }
  return current;
}

function decodeFormattedCommandArg(value: string): string | null {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  if (!value.startsWith("'") || !value.endsWith("'")) return null;

  const inner = value.slice(1, -1);
  const escapedQuote = "'\\''";
  if (inner.split(escapedQuote).join("").includes("'")) return null;
  return inner.split(escapedQuote).join("'");
}

async function livePortForAnnotation(annotation: Annotation): Promise<number | null> {
  if (!annotation.pid || !isProcessAlive(annotation.pid)) return null;
  const livePort = await liveListeningPort(annotation.pid, annotation.port ?? null);
  if (livePort === null) return null;
  if (!(await probePort(livePort))) return null;
  return livePort;
}

function renderOpenCandidates(annotations: Annotation[]): string {
  return [
    "multiple registered services match; choose one with: localapp open <id>",
    ...annotations.map((annotation) =>
      [
        annotation.id,
        projectBasename(annotation) ?? "-",
        annotation.command ?? "-",
        annotation.branch ?? "-",
        annotation.note ?? "-",
        annotation.lastSeenAt ?? "-",
        annotation.status ?? "unknown"
      ].join(" · ")
    ),
    ""
  ].join("\n");
}

function projectBasename(annotation: Annotation): string | null {
  return annotation.projectPath ? basename(annotation.projectPath) : null;
}
