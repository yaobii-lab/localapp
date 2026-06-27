import { describe, expect, it } from "vitest";
import { resolvePortStatus } from "../src/commands/status.js";
import { renderPortStatusHuman, renderPortStatusJson } from "../src/output/status.js";
import type { Annotation, ListeningPort } from "../src/types.js";

describe("resolvePortStatus", () => {
  it("reports a localapp-managed listener", () => {
    const status = resolvePortStatus(
      8030,
      [listener({ port: 8030, pid: 101 })],
      [
        annotation({
          id: "svc_live",
          port: 8030,
          pid: 101,
          command: "npm run dev",
          projectPath: "/abs/resume",
          source: "codex"
        })
      ]
    );

    expect(status).toMatchObject({
      port: 8030,
      state: "managed_running",
      listener: { pid: 101 },
      service: { id: "svc_live", command: "npm run dev", source: "codex" },
      recentRecords: [],
      suggestedActions: []
    });
  });

  it("reports a listening port that localapp does not manage", () => {
    const status = resolvePortStatus(8030, [listener({ port: 8030, pid: 101 })], []);

    expect(status).toMatchObject({
      state: "unmanaged_running",
      listener: { pid: 101 },
      service: { id: null, status: "running" },
      recentRecords: [],
      suggestedActions: ['localapp adopt 8030 --note "..."']
    });
  });

  it("reports a free port with no registry record", () => {
    expect(resolvePortStatus(8030, [], [])).toEqual({
      port: 8030,
      state: "free",
      listener: null,
      service: null,
      recentRecords: [],
      suggestedActions: []
    });
  });

  it("reports recent records and a recovery command when nothing is listening", () => {
    const status = resolvePortStatus(
      8030,
      [],
      [
        annotation({
          id: "svc_resume",
          status: "stopped",
          port: 8030,
          projectPath: "/abs/resume",
          command: "npm run dev",
          lastSeenAt: "2026-06-07T00:00:00.000Z"
        })
      ]
    );

    expect(status).toMatchObject({
      state: "not_listening_with_record",
      recentRecords: [{ id: "svc_resume", projectName: "resume", status: "stopped" }],
      suggestedActions: ["localapp run resume"]
    });
  });

  it("keeps stale same-port records visible when a different process reuses the port", () => {
    const status = resolvePortStatus(
      8030,
      [listener({ port: 8030, pid: 202 })],
      [
        annotation({
          id: "svc_old",
          port: 8030,
          pid: 101,
          command: "npm run dev",
          projectPath: "/abs/resume",
          lastSeenAt: "2026-06-07T00:00:00.000Z"
        })
      ]
    );

    expect(status).toMatchObject({
      state: "unmanaged_running",
      listener: { pid: 202 },
      service: { id: null, pid: 202 },
      recentRecords: [{ id: "svc_old", pid: null, status: "stale" }],
      suggestedActions: ['localapp adopt 8030 --note "..."']
    });
  });

  it("does not treat pid-less same-port records as managed ownership", () => {
    const status = resolvePortStatus(
      8030,
      [listener({ port: 8030, pid: 202 })],
      [
        annotation({
          id: "svc_stopped",
          status: "stopped",
          port: 8030,
          pid: null,
          command: "npm run dev",
          projectPath: "/abs/resume",
          lastSeenAt: "2026-06-07T00:00:00.000Z"
        })
      ]
    );

    expect(status).toMatchObject({
      state: "unmanaged_running",
      listener: { pid: 202 },
      service: { id: null, pid: 202 },
      recentRecords: [{ id: "svc_stopped", pid: null, status: "stopped" }],
      suggestedActions: ['localapp adopt 8030 --note "..."']
    });
  });
});

describe("status output", () => {
  it("renders JSON for agents", () => {
    const parsed = JSON.parse(
      renderPortStatusJson(resolvePortStatus(8030, [listener({ port: 8030, pid: 101 })], []))
    );

    expect(parsed).toMatchObject({
      port: 8030,
      state: "unmanaged_running",
      suggestedActions: ['localapp adopt 8030 --note "..."']
    });
  });

  it("renders a compact human explanation", () => {
    const output = renderPortStatusHuman(
      resolvePortStatus(8030, [listener({ port: 8030, pid: 101 })], [])
    );

    expect(output).toContain("Port 8030: unmanaged_running");
    expect(output).toContain("Listener: pid 101");
    expect(output).toContain('Try: localapp adopt 8030 --note "..."');
  });

  it("falls back to started time when last-seen time is missing", () => {
    const output = renderPortStatusHuman(
      resolvePortStatus(8030, [], [
        annotation({
          status: "stopped",
          pid: null,
          lastSeenAt: null,
          startedAt: "2026-06-07T00:00:00.000Z"
        })
      ])
    );

    expect(output).toContain("started 2026-06-07T00:00:00.000Z");
  });
});

function listener(overrides: Partial<ListeningPort> = {}): ListeningPort {
  return {
    port: 8030,
    pid: 101,
    command: "node",
    user: "yaobii",
    projectPath: "/abs/resume",
    projectName: "resume",
    ...overrides
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "svc_test",
    status: "running",
    projectPath: "/abs/resume",
    command: "npm run dev",
    port: 8030,
    url: "http://localhost:8030",
    pid: 101,
    source: "codex",
    note: null,
    branch: null,
    kept: false,
    health: "unknown",
    startedAt: "2026-06-07T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}
