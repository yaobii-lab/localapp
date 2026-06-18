import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

describe("localapp init", () => {
  let home: string | null = null;

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("installs Claude Code instructions without changing existing content", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-init-test-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(join(home, ".claude", "CLAUDE.md"), "# My instructions\n", "utf8");

    const result = await runInit({ home, agents: ["claude"], yes: true });

    expect(result.exitCode).toBe(0);
    expect(result.results).toEqual([
      expect.objectContaining({ agent: "claude", outcome: "configured" })
    ]);
    const entry = await readFile(join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(entry.startsWith("# My instructions\n")).toBe(true);
    expect(entry).toContain(`@${join(home, ".localapp", "integrations", "claude.md")}`);
    const generated = await readFile(
      join(home, ".localapp", "integrations", "claude.md"),
      "utf8"
    );
    expect(generated).toContain("localapp ls --all --json");
    expect(generated).toContain("localapp run --note");
    expect(generated).toContain("reuse");
    expect(generated).toContain("fall back");
  });

  it("is idempotent and reports complete status", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-init-repeat-test-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await runInit({ home, agents: ["claude"], yes: true });

    const repeated = await runInit({ home, agents: ["claude"], yes: true });
    const status = await runInit({ home, agents: ["claude"], status: true });
    const entry = await readFile(join(home, ".claude", "CLAUDE.md"), "utf8");

    expect(repeated.results[0].outcome).toBe("unchanged");
    expect(status.results[0].detail).toBe("complete");
    expect(entry.match(/<!-- localapp:start -->/g)).toHaveLength(1);
  });

  it("does not overwrite a modified generated instruction", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-init-conflict-test-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await runInit({ home, agents: ["claude"], yes: true });
    const generatedPath = join(home, ".localapp", "integrations", "claude.md");
    await writeFile(generatedPath, "my edited rules\n", "utf8");

    const result = await runInit({ home, agents: ["claude"], yes: true });

    expect(result.exitCode).toBe(1);
    expect(result.results[0].outcome).toBe("conflicted");
    expect(await readFile(generatedPath, "utf8")).toBe("my edited rules\n");
  });

  it("previews without writing and uninstalls only owned content", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-init-lifecycle-test-"));
    await mkdir(join(home, ".codex"), { recursive: true });
    const entryPath = join(home, ".codex", "AGENTS.md");
    await writeFile(entryPath, "keep this exactly\n", "utf8");

    const preview = await runInit({ home, agents: ["codex"], dryRun: true });
    expect(preview.results[0].detail).toContain("would configure");
    await expect(access(join(home, ".localapp", "integrations", "codex.md"))).rejects.toThrow();
    expect(await readFile(entryPath, "utf8")).toBe("keep this exactly\n");

    await runInit({ home, agents: ["codex"], yes: true });
    const removed = await runInit({ home, agents: ["codex"], uninstall: true });
    expect(removed.results[0].outcome).toBe("removed");
    expect(await readFile(entryPath, "utf8")).toBe("keep this exactly\n");
  });

  it("detects all agents, reports Cursor's unsupported global surface, and isolates failures", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-init-mixed-test-"));
    await Promise.all(
      [".claude", ".codex", ".cursor"].map((directory) =>
        mkdir(join(home as string, directory), { recursive: true })
      )
    );
    await writeFile(join(home, ".localapp"), "blocks claude output", "utf8");

    const result = await runInit({ home, agents: ["claude", "cursor"], yes: true });

    expect(result.detected).toEqual(["claude", "codex", "cursor"]);
    expect(result.results).toEqual([
      expect.objectContaining({ agent: "claude", outcome: "failed" }),
      expect.objectContaining({ agent: "cursor", outcome: "conflicted" })
    ]);
    await expect(access(join(home, ".cursor", "rules", "localapp.mdc"))).rejects.toThrow();
  });
});
