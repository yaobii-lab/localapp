import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProject } from "../src/process/inspect.js";

describe("resolveProject", () => {
  it("attributes a directory that has a .git marker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "localapp-git-"));
    await mkdir(join(dir, ".git"));
    const res = await resolveProject(dir);
    expect(res.path).not.toBeNull();
    expect(res.name).toBe(res.path!.split("/").filter(Boolean).at(-1));
  });

  it("returns null instead of fabricating a name when no marker exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "localapp-bare-"));
    expect(await resolveProject(dir)).toEqual({ path: null, name: null });
  });

  it("returns null for an empty cwd", async () => {
    expect(await resolveProject(null)).toEqual({ path: null, name: null });
  });
});
