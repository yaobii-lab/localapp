import { describe, expect, it } from "vitest";
import { evaluateReuse, type ReuseChecks } from "../src/core/dedup.js";

describe("evaluateReuse", () => {
  const allPass: ReuseChecks = {
    sameProjectPath: true,
    sameCommand: true,
    processAlive: true,
    portProbedLive: true
  };

  it("reuses only when every conservative check passes", () => {
    expect(evaluateReuse(allPass)).toEqual({
      reuse: true,
      reason: ["same_project_path", "same_command", "process_alive", "port_probed_live"],
      failed: null
    });
  });

  it.each([
    ["sameProjectPath", "different_project_path"],
    ["sameCommand", "different_command"],
    ["processAlive", "process_not_alive"],
    ["portProbedLive", "port_probe_failed"]
  ] as const)("does not reuse when %s fails", (key, failed) => {
    expect(evaluateReuse({ ...allPass, [key]: false })).toEqual({
      reuse: false,
      reason: [],
      failed
    });
  });
});
