#!/usr/bin/env node
import { runAdd, type AddOptions } from "./commands/add.js";
import { runAdopt, type AdoptOptions } from "./commands/adopt.js";
import { runOpen, type OpenOptions } from "./commands/open.js";
import { runLocalApp, type RunOptions } from "./commands/run.js";
import { runStatus, type StatusOptions } from "./commands/status.js";
import { runInit, type AgentName, type InitOptions } from "./commands/init.js";
import { readPackageInfo, runSetup, type SetupOptions } from "./commands/setup.js";
import { filterServices, type ServiceStatusFilter } from "./core/filter.js";
import { joinServices } from "./core/join.js";
import { renderHuman } from "./output/human.js";
import { renderJson } from "./output/json.js";
import { resolveProject, scanListeningPorts } from "./process/inspect.js";
import { readProjection } from "./registry/projection.js";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

type CliOptions =
  | HelpOptions
  | LsOptions
  | RunCliOptions
  | AddCliOptions
  | AdoptCliOptions
  | OpenCliOptions
  | StatusCliOptions
  | InitCliOptions
  | SetupCliOptions
  | VersionOptions;

interface HelpOptions {
  command: "help";
  topic: "root" | "ls" | "run" | "add" | "adopt" | "open" | "status" | "init" | "setup";
}

interface LsOptions {
  command: "ls";
  json: boolean;
  all: boolean;
  status: ServiceStatusFilter;
}

interface RunCliOptions extends RunOptions {
  command: "run";
}

interface AddCliOptions extends AddOptions {
  command: "add";
}

interface AdoptCliOptions extends AdoptOptions {
  command: "adopt";
}

interface OpenCliOptions extends OpenOptions {
  command: "open";
}

interface StatusCliOptions extends StatusOptions {
  command: "status";
}

interface InitCliOptions extends Omit<InitOptions, "home"> {
  command: "init";
}

interface SetupCliOptions extends Omit<SetupOptions, "home"> {
  command: "setup";
}

interface VersionOptions {
  command: "version";
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.command === "help") {
    process.stdout.write(renderHelp(options.topic));
    return;
  }

  if (options.command === "version") {
    process.stdout.write(`${(await readPackageInfo()).version}\n`);
    return;
  }

  if (options.command === "init") {
    const result = await runInit(
      { ...options, home: process.env.HOME ?? homedir() },
      { confirm: confirmAction }
    );
    renderIntegrationResults(result.results, result.detected.length === 0);
    process.exitCode = result.exitCode;
    return;
  }

  if (options.command === "setup") {
    const result = await runSetup(
      { ...options, home: process.env.HOME ?? homedir() },
      { confirm: confirmAction }
    );
    process.stdout.write(`cli: ${result.cli.outcome} - ${result.cli.detail}\n`);
    renderIntegrationResults(result.integrations, result.integrations.length === 0);
    process.exitCode = result.exitCode;
    return;
  }

  if (options.command === "run") {
    process.exitCode = await runLocalApp(options);
    return;
  }

  if (options.command === "add") {
    process.exitCode = await runAdd(options);
    return;
  }

  if (options.command === "adopt") {
    process.exitCode = await runAdopt(options);
    return;
  }

  if (options.command === "open") {
    process.exitCode = await runOpen(options, await readProjection());
    return;
  }

  if (options.command === "status") {
    process.exitCode = await runStatus(options, { scanListeningPorts, readProjection });
    return;
  }

  const [osScan, annotations, currentProject] = await Promise.all([
    scanListeningPorts(),
    readProjection(),
    resolveProject(process.cwd())
  ]);
  const allServices = joinServices(osScan, annotations);
  const services = filterServices(allServices, {
    showAll: options.all,
    status: options.status,
    currentProjectPath: currentProject.path
  });

  process.stdout.write(
    options.json
      ? `${renderJson(services)}\n`
      : `${renderHuman(services, {
          emptyReason: allServices.length === 0 ? "no_services" : "filtered"
        })}\n`
  );
}

function parseArgs(argv: string[]): CliOptions {
  const [command = "ls", ...flags] = argv;
  if (command === "--version" || command === "-v" || command === "version") {
    if (flags.length > 0) throw new CliError(`Unknown argument: ${flags[0]}`);
    return { command: "version" };
  }
  if (isHelpFlag(command)) return { command: "help", topic: "root" };
  if (command === "help") return parseHelpArgs(flags);
  if (command === "run") return parseRunArgs(flags);
  if (command === "add") return parseAddArgs(flags);
  if (command === "adopt") return parseAdoptArgs(flags);
  if (command === "open") return parseOpenArgs(flags);
  if (command === "status") return parseStatusArgs(flags);
  if (command === "init") return parseInitArgs(flags);
  if (command === "setup") return parseSetupArgs(flags);
  if (command !== "ls" && command !== "list") {
    throw new CliError(`Unknown command: ${command}`);
  }

  if (flags.some(isHelpFlag)) return { command: "help", topic: "ls" };

  const options: LsOptions = {
    command: "ls",
    json: false,
    all: false,
    status: "default"
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--json") {
      options.json = true;
      continue;
    }

    if (flag === "--all") {
      options.all = true;
      continue;
    }

    if (flag === "--running") {
      setLsStatus(options, "running", flag);
      continue;
    }

    if (flag === "--stopped") {
      setLsStatus(options, "stopped", flag);
      continue;
    }

    if (flag === "--status") {
      const value = readFlagValue(flags, index, flag);
      if (value !== "running" && value !== "stopped") {
        throw new CliError(`Invalid status: ${value}`);
      }
      setLsStatus(options, value, flag);
      index += 1;
      continue;
    }

    throw new CliError(`Unknown option: ${flag}`);
  }

  return options;
}

function parseHelpArgs(args: string[]): HelpOptions {
  const [topic = "root", ...rest] = args;
  if (rest.length > 0) throw new CliError(`Unknown help topic: ${rest[0]}`);
  if (
    topic === "root" ||
    topic === "ls" ||
    topic === "list" ||
    topic === "run" ||
    topic === "add" ||
    topic === "adopt" ||
    topic === "open" ||
    topic === "status" ||
    topic === "init" ||
    topic === "setup"
  ) {
    return { command: "help", topic: topic === "list" ? "ls" : topic };
  }
  throw new CliError(`Unknown help topic: ${topic}`);
}

function parseInitArgs(args: string[]): InitCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "init" };
  const common = parseAgentFlags(args, true);
  return { command: "init", ...common };
}

function parseSetupArgs(args: string[]): SetupCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "setup" };
  const common = parseAgentFlags(args, false);
  return {
    command: "setup",
    agents: common.agents,
    yes: common.yes,
    dryRun: common.dryRun
  };
}

function parseAgentFlags(
  args: string[],
  allowLifecycle: boolean
): Omit<InitCliOptions, "command"> {
  const options: Omit<InitCliOptions, "command"> = {
    agents: undefined,
    yes: false,
    dryRun: false,
    status: false,
    uninstall: false
  };
  const agents: AgentName[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--yes" || flag === "-y") {
      options.yes = true;
      continue;
    }
    if (flag === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (allowLifecycle && flag === "--status") {
      options.status = true;
      continue;
    }
    if (allowLifecycle && flag === "--uninstall") {
      options.uninstall = true;
      continue;
    }
    if (flag === "--agent") {
      const value = readFlagValue(args, index, flag);
      for (const name of value.split(",")) agents.push(parseAgentName(name));
      index += 1;
      continue;
    }
    throw new CliError(`Unknown option: ${flag}`);
  }
  if (options.status && options.uninstall) throw new CliError("Cannot combine --status and --uninstall");
  options.agents = agents.length > 0 ? [...new Set(agents)] : undefined;
  return options;
}

function parseAgentName(value: string): AgentName {
  if (value === "claude" || value === "codex" || value === "cursor") return value;
  throw new CliError(`Unsupported agent: ${value}`);
}

function parseOpenArgs(args: string[]): OpenCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "open" };
  const [app, ...flags] = args;
  if (!app) throw new CliError("Missing app");
  let foreground = false;
  for (const flag of flags) {
    if (flag === "--foreground") {
      foreground = true;
      continue;
    }
    throw new CliError(`Unknown option: ${flag}`);
  }
  return { command: "open", app, foreground };
}

function parseStatusArgs(args: string[]): StatusCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "status" };
  const [rawPort, ...flags] = args;
  if (!rawPort) throw new CliError("Missing port");
  const port = parsePositiveInteger(rawPort);
  if (port === null) throw new CliError(`Invalid port: ${rawPort}`);

  const options: StatusCliOptions = {
    command: "status",
    port,
    json: false
  };

  for (const flag of flags) {
    if (flag === "--json") {
      options.json = true;
      continue;
    }
    throw new CliError(`Unknown option: ${flag}`);
  }

  return options;
}

function parseRunArgs(args: string[]): RunCliOptions | OpenCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "run" };

  const separatorIndex = args.indexOf("--");
  if (separatorIndex < 0) {
    // `run <name>` (no `--`) is the alias for `open <name>`: take a previously
    // registered service off the shelf and bring it back up.
    const [app, ...rest] = args;
    if (!app) {
      throw new CliError("Missing service name. Use: localapp run <name>  or  localapp run -- <cmd>");
    }
    let foreground = false;
    for (const flag of rest) {
      if (flag === "--foreground") {
        foreground = true;
        continue;
      }
      throw new CliError(`Unknown option: ${flag}`);
    }
    return { command: "open", app, foreground };
  }

  const flags = args.slice(0, separatorIndex);
  const commandArgs = args.slice(separatorIndex + 1);
  if (commandArgs.length === 0) throw new CliError("Missing command after --");

  const options: RunCliOptions = {
    command: "run",
    commandArgs,
    projectPath: null,
    source: null,
    note: null,
    noReuse: false
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--no-reuse") {
      options.noReuse = true;
      continue;
    }

    if (flag === "--source") {
      options.source = readFlagValue(flags, index, flag);
      if (!isSourceValue(options.source)) throw new CliError(`Invalid source: ${options.source}`);
      index += 1;
      continue;
    }

    if (flag === "--project") {
      options.projectPath = readFlagValue(flags, index, flag);
      index += 1;
      continue;
    }

    if (flag === "--note") {
      options.note = readFlagValue(flags, index, flag);
      index += 1;
      continue;
    }

    throw new CliError(`Unknown option: ${flag}`);
  }

  return options;
}

function parseAddArgs(args: string[]): AddCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "add" };

  const separatorIndex = args.indexOf("--");
  if (separatorIndex < 0) throw new CliError("Missing -- before command");

  const flags = args.slice(0, separatorIndex);
  const commandArgs = args.slice(separatorIndex + 1);
  if (commandArgs.length === 0) throw new CliError("Missing command after --");

  const options: AddCliOptions = {
    command: "add",
    commandArgs,
    projectPath: null,
    source: null,
    note: null
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--source") {
      options.source = readFlagValue(flags, index, flag);
      if (!isSourceValue(options.source)) throw new CliError(`Invalid source: ${options.source}`);
      index += 1;
      continue;
    }

    if (flag === "--project") {
      options.projectPath = readFlagValue(flags, index, flag);
      index += 1;
      continue;
    }

    if (flag === "--note") {
      options.note = readFlagValue(flags, index, flag);
      index += 1;
      continue;
    }

    throw new CliError(`Unknown option: ${flag}`);
  }

  return options;
}

function parseAdoptArgs(args: string[]): AdoptCliOptions | HelpOptions {
  if (args.some(isHelpFlag)) return { command: "help", topic: "adopt" };
  const [rawPort, ...flags] = args;
  if (!rawPort) throw new CliError("Missing port");
  const port = parsePositiveInteger(rawPort);
  if (port === null) throw new CliError(`Invalid port: ${rawPort}`);

  const options: AdoptCliOptions = {
    command: "adopt",
    port,
    note: null,
    keep: null,
    source: null
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--keep") {
      if (options.keep === false) throw new CliError("Cannot combine --keep and --no-keep");
      options.keep = true;
      continue;
    }

    if (flag === "--no-keep") {
      if (options.keep === true) throw new CliError("Cannot combine --keep and --no-keep");
      options.keep = false;
      continue;
    }

    if (flag === "--source") {
      options.source = readFlagValue(flags, index, flag);
      if (!isSourceValue(options.source)) throw new CliError(`Invalid source: ${options.source}`);
      index += 1;
      continue;
    }

    if (flag === "--note") {
      options.note = readFlagValue(flags, index, flag);
      index += 1;
      continue;
    }

    throw new CliError(`Unknown option: ${flag}`);
  }

  return options;
}

function readFlagValue(flags: string[], index: number, flag: string): string {
  const value = flags[index + 1];
  if (!value || value.startsWith("--")) throw new CliError(`Missing value for ${flag}`);
  return value;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isSourceValue(value: string): boolean {
  return ["human", "codex", "claude", "cursor", "cline", "aider", "unknown"].includes(value);
}

function isHelpFlag(value: string): boolean {
  return value === "--help" || value === "-h";
}

function setLsStatus(options: LsOptions, status: ServiceStatusFilter, flag: string): void {
  if (options.status !== "default") throw new CliError(`Cannot combine ${flag} with another status filter`);
  options.status = status;
}

function renderHelp(topic: HelpOptions["topic"]): string {
  if (topic === "init") {
    return [
      "Usage: localapp init [options]",
      "",
      "Connect detected coding agents to the LocalApp localhost workflow.",
      "",
      "Options:",
      "  --agent <names>     Target claude, codex, or cursor (repeat or comma-separate)",
      "  --yes, -y           Apply without prompting",
      "  --dry-run           Preview changes without writing",
      "  --status            Report complete, missing, or conflicted state",
      "  --uninstall         Remove only LocalApp-owned instructions and references",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "setup") {
    return [
      "Usage: localapp setup [options]",
      "",
      "Install or upgrade the persistent CLI, verify it, then configure detected agents.",
      "",
      "Options:",
      "  --agent <names>     Target claude, codex, or cursor (repeat or comma-separate)",
      "  --yes, -y           Apply without prompting",
      "  --dry-run           Preview without installing or writing",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }
  if (topic === "run") {
    return [
      "Usage:",
      "  localapp run <name>                # take a registered service off the shelf",
      "  localapp run [options] -- <cmd>    # start (or reuse) a new dev service",
      "",
      "Without `--`, `run` is an alias for `open` and resurrects a registered service by name.",
      "With `--`, it wraps a dev command, detects the port, and writes registry events.",
      "",
      "Options (for the `-- <cmd>` form):",
      "  --note <text>       One-line intent for agents and humans",
      "  --source <source>   Override source: human, codex, claude, cursor, cline, aider, unknown",
      "  --project <path>    Use a project path other than the current directory",
      "  --no-reuse          Skip conservative reuse checks",
      "",
      "Options (for the `<name>` form):",
      "  --foreground        Keep the service attached; stop it with Ctrl-C",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "add") {
    return [
      "Usage: localapp add [options] -- <command>",
      "",
      "Register a service recipe without starting it. Use this to shelve a tool",
      "you've built once so `localapp run <name>` can resurrect it later.",
      "",
      "Options:",
      "  --note <text>       One-line intent for agents and humans",
      "  --source <source>   Override source: human, codex, claude, cursor, cline, aider, unknown",
      "  --project <path>    Use a project path other than the current directory",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "adopt") {
    return [
      "Usage: localapp adopt <port> [options]",
      "",
      "Annotate an already-listening localhost service without restarting it.",
      "",
      "Options:",
      "  --note <text>       One-line meaning for this service",
      "  --keep              Mark as a kept app label; does not keep it alive",
      "  --no-keep           Clear the kept label (re-adopt otherwise preserves it)",
      "  --source <source>   Override source: human, codex, claude, cursor, cline, aider, unknown",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "open") {
    return [
      "Usage: localapp open <app|service-id> [options]",
      "",
      "Reopen a registered service recipe, or print its URL if it is already running.",
      "`localapp open` and `localapp run <name>` are equivalent — pick whichever reads better.",
      "",
      "Options:",
      "  --foreground       Keep the service attached; stop it with Ctrl-C",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "status") {
    return [
      "Usage: localapp status <port> [options]",
      "",
      "Explain who owns one localhost port and how to recover or adopt it.",
      "This reports listener and registry facts only; it does not probe HTTP health.",
      "",
      "Options:",
      "  --json              Print valid JSON for agents",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  if (topic === "ls") {
    return [
      "Usage: localapp ls [options]",
      "",
      "List localhost services joined with LocalApp registry annotations.",
      "",
      "Options:",
      "  --json              Print valid JSON for agents",
      "  --all               Show services outside the current project",
      "  --running           Show only running services",
      "  --stopped           Show stopped/stale services, including non-kept records",
      "  --status <status>   Filter status: running, stopped",
      "  -h, --help          Show this help",
      ""
    ].join("\n");
  }

  return [
    "Usage: localapp <command> [options]",
    "",
    "Commands:",
    "  ls                  List local services (default)",
    "  run <name>          Take a registered service off the shelf and run it",
    "  run -- <cmd>        Start (or reuse) a new dev service, register it on the shelf",
    "  add -- <cmd>        Register a service without starting it",
    "  open <name>         Same as `run <name>` — kept as a familiar alias",
    "  adopt <port>        Annotate an already-listening local service in place",
    "  status <port>       Explain one port's listener, registry record, and next action",
    "  init                Connect supported coding agents to LocalApp",
    "  setup               Install the CLI and connect detected agents",
    "",
    "Examples:",
    "  localapp ls --json",
    "  localapp run memory",
    "  localapp run --note \"checkout redesign\" -- npm run dev",
    "  localapp add --note \"个人记忆库\" -- npm run dev",
    "  localapp adopt 8765 --note \"SakuraCat patch panel\" --keep",
    "  localapp status 8765 --json",
    "  localapp init --status",
    "",
    "Use localapp <command> --help for command-specific help.",
    ""
  ].join("\n");
}

async function confirmAction(message: string): Promise<boolean> {
  if (!stdin.isTTY) return false;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await readline.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    readline.close();
  }
}

function renderIntegrationResults(
  results: Array<{ agent: AgentName; outcome: string; detail: string }>,
  empty: boolean
): void {
  if (empty && results.length === 0) {
    process.stdout.write("agents: none detected; use --agent <name> after installing one\n");
    return;
  }
  for (const result of results) {
    process.stdout.write(`${result.agent}: ${result.outcome} - ${result.detail}\n`);
  }
}

class CliError extends Error {}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof CliError) {
    process.stderr.write(`${message}\n`);
  } else {
    process.stderr.write(`localapp ls failed: ${message}\n`);
  }
  process.exitCode = 1;
});
