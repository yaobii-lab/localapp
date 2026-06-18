import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { detectAgents } from "../integrations/agents.js";
import type { AgentName, InitOptions, IntegrationResult } from "../integrations/types.js";
import { runInit } from "./init.js";

const execFileAsync = promisify(execFile);

export interface PackageInfo {
  name: string;
  version: string;
  private?: boolean;
}

export interface SetupOptions {
  home: string;
  agents?: AgentName[];
  yes?: boolean;
  dryRun?: boolean;
  testMode?: boolean;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SetupDeps {
  packageInfo: PackageInfo;
  exec: (command: string, args: string[]) => Promise<CommandResult>;
  confirm: (message: string) => Promise<boolean>;
  onIntegrations: (options: InitOptions) => Promise<IntegrationResult[]>;
}

export interface SetupResult {
  exitCode: number;
  cli: { outcome: "installed" | "preview" | "skipped" | "failed"; detail: string };
  integrations: IntegrationResult[];
}

export async function runSetup(
  options: SetupOptions,
  overrides: Partial<SetupDeps> = {}
): Promise<SetupResult> {
  const packageInfo = overrides.packageInfo ?? (await readPackageInfo());
  const exec = overrides.exec ?? execute;
  const selected = options.agents ?? (await detectAgents(options.home));
  if (!options.yes && !options.dryRun) {
    const approved = await overrides.confirm?.(
      `Install LocalApp ${packageInfo.version} and configure: ${selected.join(", ") || "no detected agents"}?`
    );
    if (!approved) {
      return {
        exitCode: 0,
        cli: { outcome: "skipped", detail: "not approved" },
        integrations: selected.map((agent) => ({ agent, outcome: "skipped", detail: "not approved" }))
      };
    }
  }

  const developmentBuild = packageInfo.private === true || packageInfo.version === "0.0.0";
  if (developmentBuild && !options.dryRun && !options.testMode) {
    return {
      exitCode: 1,
      cli: { outcome: "failed", detail: "refused self-installation from a private development build" },
      integrations: []
    };
  }

  const spec = `${packageInfo.name}@${packageInfo.version}`;
  if (!options.dryRun) {
    const installed = await exec("npm", ["install", "--global", spec]);
    if (installed.exitCode !== 0) {
      return {
        exitCode: 1,
        cli: { outcome: "failed", detail: installed.stderr || `failed to install ${spec}` },
        integrations: []
      };
    }
    const verified = await exec("localapp", ["--version"]);
    if (verified.exitCode !== 0 || verified.stdout.trim() !== packageInfo.version) {
      return {
        exitCode: 1,
        cli: { outcome: "failed", detail: verified.stderr || "persistent CLI version verification failed" },
        integrations: []
      };
    }
  }

  const initOptions: InitOptions = {
    home: options.home,
    agents: selected,
    yes: true,
    dryRun: options.dryRun
  };
  const integrations = overrides.onIntegrations
    ? await overrides.onIntegrations(initOptions)
    : (await runInit(initOptions)).results;
  const integrationFailed = integrations.some(
    (result) => result.outcome === "failed" || result.outcome === "conflicted"
  );
  return {
    exitCode: integrationFailed ? 1 : 0,
    cli: {
      outcome: options.dryRun ? "preview" : "installed",
      detail: options.dryRun ? `would install ${spec}` : `installed and verified ${spec}`
    },
    integrations
  };
}

export async function readPackageInfo(): Promise<PackageInfo> {
  const raw = await readFile(new URL("../../package.json", import.meta.url), "utf8");
  return JSON.parse(raw) as PackageInfo;
}

async function execute(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message
    };
  }
}
