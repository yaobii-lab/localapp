import { describe, expect, it } from "vitest";
import { renderHuman } from "../src/output/human.js";
import { renderJson } from "../src/output/json.js";
import type { Service } from "../src/types.js";

describe("renderHuman", () => {
  it("marks kept services in the trailing tag column", () => {
    expect(renderHuman([service({ kept: true })])).toContain("(kept)");
  });

  it("combines duplicate and kept tags", () => {
    expect(renderHuman([service({ kept: true, duplicateOf: "svc_first" })])).toContain(
      "(duplicate) (kept)"
    );
  });

  it("groups running services before not-running services with status symbols", () => {
    const output = renderHuman([
      service({
        id: "svc_old",
        status: "stopped",
        port: null,
        url: null,
        lastSeenAt: "2026-06-07T00:00:00.000Z"
      }),
      service({ id: "svc_live", status: "running", lastSeenAt: "2026-06-06T00:00:00.000Z" })
    ]);

    expect(output.indexOf("Running")).toBeLessThan(output.indexOf("Not running"));
    expect(output).toContain("● running");
    expect(output).toContain("○ stopped");
  });

  it("sorts not-running services by last seen time descending", () => {
    const output = renderHuman([
      service({
        projectName: "old",
        status: "stopped",
        lastSeenAt: "2026-06-06T00:00:00.000Z"
      }),
      service({
        projectName: "new",
        status: "stale",
        lastSeenAt: "2026-06-07T00:00:00.000Z"
      })
    ]);

    expect(output.indexOf("new")).toBeLessThan(output.indexOf("old"));
  });

  it("prints a useful empty state instead of a bare header", () => {
    expect(renderHuman([])).toBe(
      'No services registered yet. Add one with: localapp add --note "..." -- <cmd>'
    );
  });

  it("prints a filtered empty state when the current view hides services", () => {
    expect(renderHuman([], { emptyReason: "filtered" })).toBe(
      "No services match this view. Try: localapp ls --all or localapp ls --stopped"
    );
  });
});

describe("renderJson", () => {
  it("includes kept in the JSON service object", () => {
    expect(JSON.parse(renderJson([service({ kept: true })])).services[0].kept).toBe(true);
  });
});

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc_panel",
    status: "running",
    projectPath: "/abs/panel",
    projectName: "panel",
    command: "python3 server.py",
    port: 8765,
    url: "http://localhost:8765",
    pid: 21416,
    source: "unknown",
    note: "panel",
    branch: null,
    kept: false,
    health: "unknown",
    duplicateOf: null,
    startedAt: "2026-06-07T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}
