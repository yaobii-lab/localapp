import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { liveListeningPort } from "../src/core/liveness.js";

describe("liveListeningPort", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  });

  it("does not trust a live stored port that belongs to another pid", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");

    const runCommand = async (command: string): Promise<string> => {
      if (command === "pgrep") throw new Error("no children");
      return "p101\ncnode\nLyaobii\nn*:9999\n";
    };

    await expect(liveListeningPort(101, address.port, runCommand)).resolves.toBe(9999);
  });
});
