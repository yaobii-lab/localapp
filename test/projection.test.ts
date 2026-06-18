import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEvents, rebuildProjection } from "../src/registry/projection.js";
import type { Event } from "../src/types.js";

describe("rebuildProjection", () => {
  it("rebuilds annotations from service events", () => {
    const events: Event[] = [
      {
        type: "service_started",
        serviceId: "svc_abc12",
        projectPath: "/abs/web-app",
        command: "npm run dev",
        pid: 48217,
        source: "codex",
        note: "checkout redesign",
        branch: "feat/checkout",
        parentChain: ["codex", "zsh"],
        at: "2026-06-07T00:00:00.000Z"
      },
      {
        type: "port_detected",
        serviceId: "svc_abc12",
        port: 5173,
        url: "http://localhost:5173",
        method: "stdout",
        at: "2026-06-07T00:00:01.000Z"
      },
      {
        type: "service_reused",
        serviceId: "svc_abc12",
        requestedBy: "claude",
        reason: ["same_project_path", "same_command", "process_alive", "port_probed_live"],
        at: "2026-06-07T00:00:02.000Z"
      }
    ];

    expect(rebuildProjection(events)).toEqual([
      {
        id: "svc_abc12",
        status: "running",
        projectPath: "/abs/web-app",
        command: "npm run dev",
        port: 5173,
        url: "http://localhost:5173",
        pid: 48217,
        source: "codex",
        note: "checkout redesign",
        branch: "feat/checkout",
        kept: false,
        health: "unknown",
        startedAt: "2026-06-07T00:00:00.000Z",
        lastSeenAt: "2026-06-07T00:00:02.000Z"
      }
    ]);
  });

  it("marks stopped services without trusting stale pid state", () => {
    const events: Event[] = [
      {
        type: "service_started",
        serviceId: "svc_stop",
        projectPath: "/abs/web-app",
        command: "npm run dev",
        pid: 10,
        source: "codex",
        parentChain: [],
        at: "2026-06-07T00:00:00.000Z"
      },
      {
        type: "service_stopped",
        serviceId: "svc_stop",
        pid: 10,
        exitCode: 0,
        signal: null,
        at: "2026-06-07T00:00:03.000Z"
      }
    ];

    expect(rebuildProjection(events)[0]).toMatchObject({
      id: "svc_stop",
      status: "stopped",
      pid: null,
      lastSeenAt: "2026-06-07T00:00:03.000Z"
    });
  });

  it("rebuilds adopted services and re-adopts the same id in place", () => {
    const events: Event[] = [
      {
        type: "service_adopted",
        serviceId: "svc_panel",
        projectPath: "/abs/panel",
        command: "python3 server.py",
        pid: 21416,
        port: 8765,
        url: "http://localhost:8765",
        source: "unknown",
        note: "panel",
        branch: null,
        kept: true,
        parentChain: ["Python", "launchd"],
        at: "2026-06-07T00:00:00.000Z"
      },
      {
        type: "service_adopted",
        serviceId: "svc_panel",
        projectPath: "/abs/panel",
        command: "python3 server.py",
        pid: 21416,
        port: 8765,
        url: "http://localhost:8765",
        source: "unknown",
        note: "panel renamed",
        branch: "main",
        kept: false,
        parentChain: ["Python", "launchd"],
        at: "2026-06-07T00:00:01.000Z"
      }
    ];

    expect(rebuildProjection(events)).toEqual([
      {
        id: "svc_panel",
        status: "running",
        projectPath: "/abs/panel",
        command: "python3 server.py",
        port: 8765,
        url: "http://localhost:8765",
        pid: 21416,
        source: "unknown",
        note: "panel renamed",
        branch: "main",
        kept: false,
        health: "unknown",
        startedAt: "2026-06-07T00:00:01.000Z",
        lastSeenAt: "2026-06-07T00:00:01.000Z"
      }
    ]);
  });

  it("round-trips service_adopted events and rejects missing pid or port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "localapp-projection-"));
    const eventsPath = join(dir, "events.jsonl");
    await writeFile(
      eventsPath,
      [
        JSON.stringify({
          type: "service_adopted",
          serviceId: "svc_panel",
          projectPath: "/abs/panel",
          command: "python3 server.py",
          pid: 21416,
          port: 8765,
          url: "http://localhost:8765",
          source: "unknown",
          note: "panel",
          branch: null,
          kept: true,
          parentChain: ["Python", "launchd"],
          at: "2026-06-07T00:00:00.000Z"
        }),
        JSON.stringify({
          type: "service_adopted",
          serviceId: "svc_missing_port",
          pid: 21416,
          url: "http://localhost:8765",
          source: "unknown",
          kept: true,
          parentChain: [],
          at: "2026-06-07T00:00:00.000Z"
        }),
        JSON.stringify({
          type: "service_adopted",
          serviceId: "svc_missing_pid",
          port: 8765,
          url: "http://localhost:8765",
          source: "unknown",
          kept: true,
          parentChain: [],
          at: "2026-06-07T00:00:00.000Z"
        })
      ].join("\n") + "\n",
      "utf8"
    );

    expect(await readEvents(eventsPath)).toEqual([
      {
        type: "service_adopted",
        serviceId: "svc_panel",
        projectPath: "/abs/panel",
        command: "python3 server.py",
        pid: 21416,
        port: 8765,
        url: "http://localhost:8765",
        source: "unknown",
        note: "panel",
        branch: null,
        kept: true,
        parentChain: ["Python", "launchd"],
        at: "2026-06-07T00:00:00.000Z"
      }
    ]);
  });
});
