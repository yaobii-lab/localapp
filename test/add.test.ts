import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { readProjection } from "../src/registry/projection.js";

describe("runAdd", () => {
  const originalHome = process.env.HOME;
  let home: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (home) await rm(home, { recursive: true, force: true });
    process.env.HOME = originalHome;
  });

  it("registers a service without spawning anything", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-add-test-"));
    process.env.HOME = home;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runAdd({
      commandArgs: ["npm", "run", "dev"],
      projectPath: home,
      source: "human",
      note: "shelf-only"
    });

    expect(exitCode).toBe(0);

    const annotations = await readProjection();
    expect(annotations).toHaveLength(1);
    const registered = annotations[0];
    expect(registered.status).toBe("stopped");
    expect(registered.kept).toBe(true);
    expect(registered.pid).toBeNull();
    expect(registered.port).toBeNull();
    expect(registered.url).toBeNull();
    expect(registered.command).toBe("npm run dev");
    expect(registered.note).toBe("shelf-only");
    expect(registered.source).toBe("human");
    expect(registered.startedAt).toBeNull();
    expect(registered.lastSeenAt).not.toBeNull();
  });

  it("rejects empty command args", async () => {
    await expect(
      runAdd({
        commandArgs: [],
        projectPath: process.cwd()
      })
    ).rejects.toThrow(/Missing command/);
  });

  it("quotes command args that contain shell-significant characters", async () => {
    home = await mkdtemp(join(tmpdir(), "localapp-add-quote-test-"));
    process.env.HOME = home;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runAdd({
      commandArgs: ["sh", "-c", "python3 server.py --port 5000"],
      projectPath: home,
      source: "human"
    });

    const annotations = await readProjection();
    expect(annotations[0].command).toBe("sh -c 'python3 server.py --port 5000'");
  });
});
