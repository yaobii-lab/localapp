import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

describe("init and setup CLI", () => {
  let home: string | null = null;

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("reports the package version", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-cli-version-test-"));
    const packageInfo = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
      version: string;
    };
    const { stdout } = await invoke(["--version"], home);
    expect(stdout).toBe(`${packageInfo.version}\n`);
  });

  it("runs init through the CLI with an isolated home", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-cli-init-test-"));
    await mkdir(join(home, ".claude"), { recursive: true });

    const { stdout } = await invoke(["init", "--agent", "claude", "--yes"], home);

    expect(stdout).toContain("claude: configured");
    await expect(access(join(home, ".localapp", "integrations", "claude.md"))).resolves.toBeUndefined();
  });

  it("previews setup for a private build without installing anything", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-cli-setup-test-"));
    const { stdout } = await invoke(["setup", "--dry-run"], home);
    expect(stdout).toContain("cli: preview");
    expect(stdout).toContain("agents: none detected");
  });

  it("shows status help through the CLI", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-cli-status-help-test-"));
    const { stdout } = await invoke(["status", "--help"], home);
    expect(stdout).toContain("Usage: localapp status <port>");
    expect(stdout).toContain("--json");
  });
});

async function invoke(args: string[], home: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd,
    env: { ...process.env, HOME: home },
    encoding: "utf8"
  });
}
