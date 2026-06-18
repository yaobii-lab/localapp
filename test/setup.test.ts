import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSetup } from "../src/commands/setup.js";

describe("localapp setup", () => {
  let home: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("installs and verifies the persistent CLI before configuring agents", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-setup-test-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    const order: string[] = [];
    const exec = vi.fn(async (command: string, args: string[]) => {
      order.push(`${command} ${args.join(" ")}`);
      return { exitCode: 0, stdout: args.includes("--version") ? "1.2.3\n" : "", stderr: "" };
    });

    const result = await runSetup(
      { home, agents: ["claude"], yes: true },
      {
        packageInfo: { name: "@yaobii/localapp", version: "1.2.3" },
        exec,
        onIntegrations: async () => {
          order.push("integrations");
          return [];
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(order).toEqual([
      "npm install --global @yaobii/localapp@1.2.3",
      "localapp --version",
      "integrations"
    ]);
  });

  it("does not write integrations when CLI verification fails", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-setup-fail-test-"));
    const onIntegrations = vi.fn(async () => []);
    const result = await runSetup(
      { home, agents: ["codex"], yes: true },
      {
        packageInfo: { name: "@yaobii/localapp", version: "1.2.3" },
        exec: async (_command, args) => ({
          exitCode: args.includes("--version") ? 1 : 0,
          stdout: "",
          stderr: "not found"
        }),
        onIntegrations
      }
    );

    expect(result.exitCode).toBe(1);
    expect(onIntegrations).not.toHaveBeenCalled();
  });

  it("refuses real self-installation from a private development build", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-setup-private-test-"));
    const exec = vi.fn();
    const result = await runSetup(
      { home, yes: true },
      { packageInfo: { name: "localapp", version: "0.0.0", private: true }, exec }
    );

    expect(result.exitCode).toBe(1);
    expect(result.cli.detail).toContain("private development build");
    expect(exec).not.toHaveBeenCalled();
  });

  it("dry-runs private builds without installation or agent writes", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-setup-dry-test-"));
    const exec = vi.fn();
    const onIntegrations = vi.fn(async (options) => {
      expect(options.dryRun).toBe(true);
      return [];
    });
    const result = await runSetup(
      { home, yes: true, dryRun: true },
      {
        packageInfo: { name: "localapp", version: "0.0.0", private: true },
        exec,
        onIntegrations
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.cli.detail).toContain("would install");
    expect(exec).not.toHaveBeenCalled();
    expect(onIntegrations).toHaveBeenCalledOnce();
  });

  it("asks once for the CLI and all detected integrations", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-setup-confirm-test-"));
    await Promise.all(
      [".claude", ".codex"].map((directory) => mkdir(join(home as string, directory), { recursive: true }))
    );
    const confirm = vi.fn(async () => true);
    const onIntegrations = vi.fn(async () => []);

    const result = await runSetup(
      { home },
      {
        packageInfo: { name: "@yaobii/localapp", version: "1.2.3" },
        confirm,
        exec: async (_command, args) => ({
          exitCode: 0,
          stdout: args.includes("--version") ? "1.2.3\n" : "",
          stderr: ""
        }),
        onIntegrations
      }
    );

    expect(result.exitCode).toBe(0);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("claude, codex");
    expect(onIntegrations).toHaveBeenCalledWith(
      expect.objectContaining({ agents: ["claude", "codex"], yes: true })
    );
  });
});
