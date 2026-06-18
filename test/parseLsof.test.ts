import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCwd, parseLsof, processCommandLine } from "../src/process/inspect.js";

describe("parseLsof", () => {
  it("parses listening ports from lsof field output", async () => {
    const raw = await readFile("test-fixtures/lsof-listen.txt", "utf8");

    expect(parseLsof(raw)).toEqual([
      { port: 3000, pid: 103, command: "node", user: "alice" },
      { port: 5173, pid: 101, command: "node", user: "alice" },
      { port: 8000, pid: 102, command: "Python", user: "alice" }
    ]);
  });
});

describe("parseCwd", () => {
  it("returns the cwd name field", () => {
    expect(parseCwd("p101\nn/Users/example/Developer/localapp\n")).toBe(
      "/Users/example/Developer/localapp"
    );
  });
});

describe("processCommandLine", () => {
  it("reads and trims the full ps args output", async () => {
    const command = await processCommandLine(21416, async (cmd, args) => {
      expect(cmd).toBe("ps");
      expect(args).toEqual(["-ww", "-o", "args=", "-p", "21416"]);
      return "python3 outputs/path with spaces/server.py --flag value  \n";
    });

    expect(command).toBe("python3 outputs/path with spaces/server.py --flag value");
  });

  it("returns null when ps fails", async () => {
    const command = await processCommandLine(21416, async () => {
      throw new Error("ps failed");
    });

    expect(command).toBeNull();
  });
});
