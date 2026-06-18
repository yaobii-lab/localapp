import { setTimeout as sleep } from "node:timers/promises";
import { evaluateReuse } from "../core/dedup.js";
import {
  isProcessAlive,
  liveListeningPort,
  probePort,
  realProjectPath,
  sameRealpath
} from "../core/liveness.js";
import { createStdoutPortDetector, type StdoutPortDetection } from "../detect/stdout.js";
import {
  detectSource,
  gitBranch,
  listeningPortsForPidTree
} from "../process/inspect.js";
import { spawnDetached, spawnForeground } from "../process/spawn.js";
import { readProjection, recordEvent } from "../registry/projection.js";
import type { Annotation, PortDetectionMethod } from "../types.js";

export interface RunOptions {
  commandArgs: string[];
  projectPath?: string | null;
  source?: string | null;
  note?: string | null;
  noReuse: boolean;
  serviceId?: string | null;
  recordedCommand?: string | null;
  detached?: boolean;
  onPortDetected?: (detection: PortDetectionResult) => void;
  onExit?: (exit: ProcessExit) => void;
}

export interface PortDetectionResult {
  port: number | null;
  url: string | null;
  method: PortDetectionMethod;
}

export interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export async function runLocalApp(options: RunOptions): Promise<number> {
  if (options.commandArgs.length === 0) {
    throw new Error("Missing command after --");
  }

  const projectPath = await realProjectPath(options.projectPath ?? process.cwd());
  const command = options.recordedCommand ?? formatCommand(options.commandArgs);
  const detectedSource = await detectSource(process.pid);
  const source = options.source ?? detectedSource.source;
  const branch = await gitBranch(projectPath);
  const annotations = await readProjection();

  if (!options.noReuse) {
    const reusable = await findReusableService(annotations, projectPath, command);
    if (reusable) {
      await recordEvent({
        type: "service_reused",
        serviceId: reusable.annotation.id,
        requestedBy: source,
        reason: reusable.reason,
        at: new Date().toISOString()
      });
      printReused(reusable.annotation, reusable.reason);
      return 0;
    }
  }

  const serviceId =
    options.serviceId ?? generateServiceId(new Set(annotations.map((annotation) => annotation.id)));
  if (options.detached) {
    return runDetachedLocalApp({
      ...options,
      projectPath,
      command,
      serviceId,
      source,
      branch,
      parentChain: detectedSource.parentChain
    });
  }
  const detector = createStdoutPortDetector();
  let resolveStdoutDetection: (detection: StdoutPortDetection) => void = () => {};
  let stdoutDetected = false;
  const stdoutDetection = new Promise<StdoutPortDetection>((resolveDetection) => {
    resolveStdoutDetection = resolveDetection;
  });
  const onChunk = (chunk: string) => {
    if (stdoutDetected) return;
    const detection = detector.push(chunk);
    if (!detection) return;
    stdoutDetected = true;
    resolveStdoutDetection(detection);
  };

  const foreground = spawnForeground(options.commandArgs, projectPath, {
    stdout: onChunk,
    stderr: onChunk
  });
  const childPid = foreground.child.pid;
  if (!childPid) throw new Error("Failed to start child process");

  await recordEvent({
    type: "service_started",
    serviceId,
    projectPath,
    command,
    pid: childPid,
    source,
    note: options.note ?? null,
    branch,
    parentChain: detectedSource.parentChain,
    at: new Date().toISOString()
  });

  const detectionTask = detectPort(childPid, stdoutDetection, detector, foreground.exit).then(
    async (detection) => {
      await recordEvent({
        type: "port_detected",
        serviceId,
        port: detection.port,
        url: detection.url,
        method: detection.method,
        at: new Date().toISOString()
      });
      options.onPortDetected?.(detection);
      printStarted({
        id: serviceId,
        projectPath,
        command,
        pid: childPid,
        source,
        note: options.note ?? null,
        branch,
        detached: false,
        ...detection
      });
    }
  );

  const exit = await foreground.exit;
  options.onExit?.(exit);
  await detectionTask;
  foreground.dispose();
  await recordEvent({
    type: "service_stopped",
    serviceId,
    pid: childPid,
    exitCode: exit.code,
    signal: exit.signal,
    at: new Date().toISOString()
  });

  return exit.code ?? (exit.signal ? 1 : 0);
}

async function runDetachedLocalApp(options: RunOptions & {
  projectPath: string;
  command: string;
  serviceId: string;
  source: string;
  branch: string | null;
  parentChain: string[];
}): Promise<number> {
  const detached = spawnDetached(options.commandArgs, options.projectPath);
  const childPid = detached.child.pid;
  if (!childPid) throw new Error("Failed to start child process");

  await recordEvent({
    type: "service_started",
    serviceId: options.serviceId,
    projectPath: options.projectPath,
    command: options.command,
    pid: childPid,
    source: options.source,
    note: options.note ?? null,
    branch: options.branch,
    parentChain: options.parentChain,
    at: new Date().toISOString()
  });

  const detector = createStdoutPortDetector();
  const stdoutDetection = new Promise<StdoutPortDetection>(() => {});
  const detection = await detectPort(childPid, stdoutDetection, detector, detached.exit);
  await recordEvent({
    type: "port_detected",
    serviceId: options.serviceId,
    port: detection.port,
    url: detection.url,
    method: detection.method,
    at: new Date().toISOString()
  });
  options.onPortDetected?.(detection);
  printStarted({
    id: options.serviceId,
    projectPath: options.projectPath,
    command: options.command,
    pid: childPid,
    source: options.source,
    note: options.note ?? null,
    branch: options.branch,
    detached: true,
    ...detection
  });

  const immediateExit = await Promise.race([
    detached.exit.then((exit) => ({ exit })),
    sleep(0).then(() => null)
  ]);
  if (!immediateExit) return 0;

  options.onExit?.(immediateExit.exit);
  await recordEvent({
    type: "service_stopped",
    serviceId: options.serviceId,
    pid: childPid,
    exitCode: immediateExit.exit.code,
    signal: immediateExit.exit.signal,
    at: new Date().toISOString()
  });
  return immediateExit.exit.code ?? (immediateExit.exit.signal ? 1 : 0);
}

async function detectPort(
  childPid: number,
  stdoutDetection: Promise<StdoutPortDetection>,
  detector: ReturnType<typeof createStdoutPortDetector>,
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
): Promise<PortDetectionResult> {
  const cancel = { done: false };
  const deadline = Date.now() + 5000;
  // Poll the PID tree alongside stdout. Block-buffered servers (e.g. python's
  // http.server) never flush their startup line to a pipe, so stdout detection
  // alone would stall until the deadline; polling the OS closes that gap fast.
  const pidScan = pollPidTreePort(childPid, exit, deadline, cancel);

  const first = await Promise.race([
    stdoutDetection.then((detection) => ({ type: "stdout" as const, detection })),
    pidScan.then((port) => ({ type: "scan" as const, port })),
    exit.then(() => ({ type: "exit" as const }))
  ]);
  cancel.done = true;

  if (first.type === "stdout") {
    return { ...first.detection, method: "stdout" };
  }

  const flushed = detector.flush();
  if (flushed) return { ...flushed, method: "stdout" };

  if (first.type === "scan" && first.port !== null) {
    return {
      port: first.port,
      url: `http://localhost:${first.port}`,
      method: "process_scan"
    };
  }

  process.stdout.write("port not detected yet\n");
  return { port: null, url: null, method: "unknown" };
}

async function pollPidTreePort(
  childPid: number,
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
  deadline: number,
  cancel: { done: boolean }
): Promise<number | null> {
  let exited = false;
  void exit.then(() => {
    exited = true;
  });

  while (!cancel.done && !exited && Date.now() < deadline) {
    try {
      const ports = await listeningPortsForPidTree(childPid);
      if (ports[0]) return ports[0].port;
    } catch {
      // Keep polling; a transient lsof failure is not fatal.
    }
    await sleep(400);
  }

  return null;
}

async function findReusableService(
  annotations: Annotation[],
  projectPath: string,
  command: string
): Promise<{ annotation: Annotation; reason: string[] } | null> {
  for (const annotation of annotations) {
    const sameProjectPath =
      annotation.projectPath !== null &&
      annotation.projectPath !== undefined &&
      (await sameRealpath(annotation.projectPath, projectPath));
    const sameCommand = annotation.command === command;
    const processAlive = annotation.pid ? isProcessAlive(annotation.pid) : false;

    // OS-first reuse: do not trust the stored port. A freshly started service is
    // registered with port:null until detection lands, which would otherwise make
    // a quick second `run` miss the reuse and stack a duplicate. Once identity and
    // liveness match, ask the OS what the live PID is actually listening on.
    let livePort: number | null = null;
    if (sameProjectPath && sameCommand && processAlive && annotation.pid) {
      livePort = await liveListeningPort(annotation.pid, annotation.port ?? null);
    }
    const portProbedLive = livePort !== null && (await probePort(livePort));

    const decision = evaluateReuse({ sameProjectPath, sameCommand, processAlive, portProbedLive });
    if (decision.reuse) {
      return { annotation: withLivePort(annotation, livePort), reason: decision.reason };
    }
  }

  return null;
}

function withLivePort(annotation: Annotation, livePort: number | null): Annotation {
  if (livePort === null || annotation.port === livePort) return annotation;
  return { ...annotation, port: livePort, url: `http://localhost:${livePort}` };
}

function formatCommand(commandArgs: string[]): string {
  return commandArgs.map(formatCommandArg).join(" ");
}

function formatCommandArg(arg: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

function generateServiceId(existing: Set<string>): string {
  while (true) {
    const id = `svc_${Math.random().toString(36).slice(2, 7)}`;
    if (!existing.has(id)) return id;
  }
}

function printReused(annotation: Annotation, reason: string[]): void {
  process.stdout.write(
    [
      "Reused existing service",
      `ID: ${annotation.id}`,
      `Project: ${annotation.projectPath ?? "-"}`,
      `Command: ${annotation.command ?? "-"}`,
      `URL: ${annotation.url ?? (annotation.port ? `http://localhost:${annotation.port}` : "-")}`,
      `PID: ${annotation.pid ?? "-"}`,
      `Source: ${annotation.source ?? "unknown"}`,
      `Reason: ${reason.join(", ")}`,
      ""
    ].join("\n")
  );
}

function printStarted(service: {
  id: string;
  projectPath: string;
  command: string;
  pid: number;
  source: string;
  note: string | null;
  branch: string | null;
  detached: boolean;
  port: number | null;
  url: string | null;
  method: PortDetectionMethod;
}): void {
  const lines = [
    "Started service",
    `ID: ${service.id}`,
    `Project: ${service.projectPath}`,
    `Command: ${service.command}`,
    `URL: ${service.url ?? "-"}`,
    `PID: ${service.pid}`,
    `Source: ${service.source}`,
    `Branch: ${service.branch ?? "-"}`,
    `Note: ${service.note ?? "-"}`,
    `Port detection: ${service.method}`,
    service.detached ? "Mode: detached" : "Stop: Ctrl-C",
    ""
  ];

  process.stdout.write(lines.join("\n"));
}
