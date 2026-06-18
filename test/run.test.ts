import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isProcessAlive } from "../src/core/liveness.js";
import { runLocalApp } from "../src/commands/run.js";
import { readProjection } from "../src/registry/projection.js";

describe("runLocalApp detached mode", () => {
  const originalHome = process.env.HOME;
  let home: string | null = null;
  let childPid: number | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (childPid && isProcessAlive(childPid)) {
      try {
        process.kill(-childPid, "SIGTERM");
      } catch {
        process.kill(childPid, "SIGTERM");
      }
    }
    if (home) await rm(home, { recursive: true, force: true });
    process.env.HOME = originalHome;
  });

  it(
    "returns while the service is alive and preserves its identity and recipe",
    async () => {
      home = await mkdtemp(join(tmpdir(), "localapp-run-test-"));
      process.env.HOME = home;
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const startedAt = Date.now();

      const exitCode = await runLocalApp({
        commandArgs: [
          process.execPath,
          "-e",
          "const http=require('node:http');const s=http.createServer((_,r)=>r.end('ok'));s.listen(0);setTimeout(()=>s.close(),3000)"
        ],
        projectPath: home,
        source: "human",
        note: "detached test",
        noReuse: true,
        serviceId: "svc_panel",
        recordedCommand: "node server.js",
        detached: true
      });

      const [annotation] = await readProjection();
      childPid = annotation?.pid ?? null;
      expect(exitCode).toBe(0);
      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect(annotation).toMatchObject({
        id: "svc_panel",
        status: "running",
        command: "node server.js",
        note: "detached test"
      });
      expect(childPid && isProcessAlive(childPid)).toBe(true);
    },
    8000
  );
});
