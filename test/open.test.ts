import { describe, expect, it, vi } from "vitest";
import { resolveOpenTargets, runOpen, shouldPrintRecipeFailure } from "../src/commands/open.js";
import type { Annotation } from "../src/types.js";

describe("resolveOpenTargets", () => {
  it("prefers an exact service id match", () => {
    const annotations = [
      annotation({ id: "svc_panel", projectPath: "/abs/panel" }),
      annotation({ id: "svc_other", projectPath: "/abs/svc_panel" })
    ];

    expect(resolveOpenTargets(annotations, "svc_panel").map((entry) => entry.id)).toEqual([
      "svc_panel"
    ]);
  });

  it("matches an exact project basename", () => {
    expect(
      resolveOpenTargets(
        [
          annotation({ id: "svc_a", projectPath: "/abs/web-app" }),
          annotation({ id: "svc_b", projectPath: "/abs/web-app-api" })
        ],
        "web-app"
      ).map((entry) => entry.id)
    ).toEqual(["svc_a"]);
  });

  it("returns all fuzzy basename matches instead of guessing", () => {
    expect(
      resolveOpenTargets(
        [
          annotation({ id: "svc_web", projectPath: "/abs/web-app-web" }),
          annotation({ id: "svc_api", projectPath: "/abs/web-app-api" })
        ],
        "web-app"
      ).map((entry) => entry.id)
    ).toEqual(["svc_web", "svc_api"]);
  });

  it("returns no match when annotations have no project name hit", () => {
    expect(resolveOpenTargets([annotation({ projectPath: "/abs/panel" })], "web-app")).toEqual([]);
  });
});

describe("shouldPrintRecipeFailure", () => {
  it("prints only when replay exits nonzero before port detection without a signal", () => {
    expect(shouldPrintRecipeFailure(42, false, false)).toBe(true);
    expect(shouldPrintRecipeFailure(0, false, false)).toBe(false);
    expect(shouldPrintRecipeFailure(1, true, false)).toBe(false);
    expect(shouldPrintRecipeFailure(1, false, true)).toBe(false);
  });
});

describe("runOpen", () => {
  it("reuses the service id and canonical recipe in detached mode", async () => {
    let receivedOptions: unknown = null;

    const exitCode = await runOpen(
      { app: "svc_panel" },
      [
        annotation({
          id: "svc_panel",
          command: "sh -c 'python3 server.py'",
          pid: null,
          status: "stopped"
        })
      ],
      {
        runLocalApp: async (options) => {
          receivedOptions = options;
          return 0;
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(receivedOptions).toMatchObject({
      commandArgs: ["sh", "-c", "python3 server.py"],
      recordedCommand: "python3 server.py",
      serviceId: "svc_panel",
      detached: true
    });
  });

  it("uses OS liveness before treating historical records as ambiguous", async () => {
    const runLocalApp = vi.fn(async () => 0);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runOpen(
      { app: "panel" },
      [
        annotation({
          id: "svc_stopped",
          projectPath: "/abs/panel",
          command: "python3 server.py",
          pid: null,
          status: "stopped",
          lastSeenAt: "2026-06-14T00:00:00.000Z"
        }),
        annotation({
          id: "svc_ghost",
          projectPath: "/abs/panel",
          command: "sh -c 'python3 server.py'",
          pid: 101,
          status: "running",
          lastSeenAt: "2026-06-18T05:03:02.000Z"
        }),
        annotation({
          id: "svc_live",
          projectPath: "/abs/panel",
          command: "sh -c 'sh -c '\\''python3 server.py'\\'''",
          pid: 202,
          status: "running",
          lastSeenAt: "2026-06-18T05:49:44.000Z"
        })
      ],
      {
        runLocalApp,
        livePortForAnnotation: async (entry: Annotation) =>
          entry.id === "svc_live" ? 8765 : null
      } as never
    );

    expect(exitCode).toBe(0);
    expect(runLocalApp).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("✓ panel alive at http://localhost:8765\n");
    stdout.mockRestore();
  });

  it("collapses stopped replay history to the latest logical service", async () => {
    const runLocalApp = vi.fn(async () => 0);

    const exitCode = await runOpen(
      { app: "panel", foreground: true },
      [
        annotation({
          id: "svc_old",
          command: "python3 server.py",
          lastSeenAt: "2026-06-14T00:00:00.000Z"
        }),
        annotation({
          id: "svc_latest",
          command: "sh -c 'sh -c '\\''python3 server.py'\\'''",
          lastSeenAt: "2026-06-18T00:00:00.000Z"
        })
      ],
      {
        runLocalApp,
        livePortForAnnotation: async () => null
      }
    );

    expect(exitCode).toBe(0);
    expect(runLocalApp).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "svc_latest",
        commandArgs: ["sh", "-c", "python3 server.py"],
        recordedCommand: "python3 server.py",
        detached: false
      })
    );
  });

  it("keeps distinct recipes ambiguous even when only one is live", async () => {
    const runLocalApp = vi.fn(async () => 0);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const exitCode = await runOpen(
      { app: "panel" },
      [
        annotation({ id: "svc_web", command: "npm run web", pid: 101 }),
        annotation({ id: "svc_api", command: "npm run api", pid: null, status: "stopped" })
      ],
      {
        runLocalApp,
        livePortForAnnotation: async (entry) => (entry.id === "svc_web" ? 5173 : null)
      }
    );

    expect(exitCode).toBe(1);
    expect(runLocalApp).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("multiple registered services"));
    stderr.mockRestore();
  });
});

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "svc_panel",
    status: "stopped",
    projectPath: "/abs/panel",
    command: "npm run dev",
    port: 5173,
    url: "http://localhost:5173",
    pid: null,
    source: "human",
    note: "panel",
    branch: "main",
    kept: false,
    health: "unknown",
    startedAt: "2026-06-07T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}
