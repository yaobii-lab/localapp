import { describe, expect, it } from "vitest";
import { sourceFromParentChain } from "../src/process/inspect.js";

describe("sourceFromParentChain", () => {
  it("maps known agent names from parent chains", () => {
    expect(sourceFromParentChain(["node:claude", "zsh"])).toBe("claude");
    expect(sourceFromParentChain(["codex", "zsh"])).toBe("codex");
    expect(sourceFromParentChain(["Cursor Helper", "zsh"])).toBe("cursor");
  });

  it("keeps uncertain chains unknown and shell-only chains human", () => {
    expect(sourceFromParentChain(["zsh", "tmux"])).toBe("human");
    expect(sourceFromParentChain(["node", "launchd"])).toBe("unknown");
  });
});
