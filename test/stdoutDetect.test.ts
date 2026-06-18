import { describe, expect, it } from "vitest";
import { detectPortFromLine } from "../src/detect/stdout.js";

describe("detectPortFromLine", () => {
  it.each([
    ["Vite", "  Local:   http://localhost:5173/", 5173],
    ["Next", " - Local:        http://localhost:3000", 3000],
    ["Astro", "┃ Local    http://localhost:4321/", 4321],
    ["CRA", "Local:            http://localhost:3001", 3001],
    ["python http.server", "Serving HTTP on :: port 18080 (http://[::]:18080/) ...", 18080],
    ["started server", "started server on 0.0.0.0:4000", 4000]
  ])("detects %s output", (_name, line, port) => {
    expect(detectPortFromLine(line)).toEqual({
      port,
      url: `http://localhost:${port}`
    });
  });
});
