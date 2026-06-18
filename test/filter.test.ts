import { describe, expect, it } from "vitest";
import { filterServices } from "../src/core/filter.js";
import type { Service } from "../src/types.js";

describe("filterServices", () => {
  it("scopes to the current project by default", () => {
    expect(
      filterServices(
        [
          service({ id: "svc_local", projectPath: "/abs/localapp" }),
          service({ id: "svc_other", projectPath: "/abs/other" })
        ],
        { showAll: false, status: "default", currentProjectPath: "/abs/localapp" }
      ).map((entry) => entry.id)
    ).toEqual(["svc_local"]);
  });

  it("falls back to global scope when the current directory is not a project", () => {
    expect(
      filterServices(
        [
          service({ id: "svc_a", projectPath: "/abs/a" }),
          service({ id: "svc_b", projectPath: "/abs/b" })
        ],
        { showAll: false, status: "default", currentProjectPath: null }
      ).map((entry) => entry.id)
    ).toEqual(["svc_a", "svc_b"]);
  });

  it("keeps only running plus kept non-running services in the default status view", () => {
    expect(
      filterServices(
        [
          service({ id: "svc_running", status: "running", kept: false }),
          service({ id: "svc_kept", status: "stopped", kept: true }),
          service({ id: "svc_hidden", status: "stale", kept: false })
        ],
        { showAll: true, status: "default", currentProjectPath: "/abs/localapp" }
      ).map((entry) => entry.id)
    ).toEqual(["svc_running", "svc_kept"]);
  });

  it("supports explicit running and stopped status views", () => {
    const services = [
      service({ id: "svc_running", status: "running" }),
      service({ id: "svc_stopped", status: "stopped" }),
      service({ id: "svc_stale", status: "stale" })
    ];

    expect(
      filterServices(services, {
        showAll: true,
        status: "running",
        currentProjectPath: "/abs/localapp"
      }).map((entry) => entry.id)
    ).toEqual(["svc_running"]);
    expect(
      filterServices(services, {
        showAll: true,
        status: "stopped",
        currentProjectPath: "/abs/localapp"
      }).map((entry) => entry.id)
    ).toEqual(["svc_stopped", "svc_stale"]);
  });
});

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc_local",
    status: "running",
    projectPath: "/abs/localapp",
    projectName: "localapp",
    command: "npm run dev",
    port: 5173,
    url: "http://localhost:5173",
    pid: 21416,
    source: "unknown",
    note: "local dev",
    branch: null,
    kept: false,
    health: "unknown",
    duplicateOf: null,
    startedAt: "2026-06-07T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}
