import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { allocateLocalPort, listenOnLocalhost, localUrl, parseListenPort } from "../../src/server/listen";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
});

describe("parseListenPort", () => {
  it("treats a missing PORT as OS-assigned", () => {
    expect(parseListenPort(undefined)).toBe(0);
    expect(parseListenPort("")).toBe(0);
    expect(parseListenPort("0")).toBe(0);
  });

  it("keeps an explicit port", () => {
    expect(parseListenPort("4173")).toBe(4173);
  });
});

describe("listenOnLocalhost", () => {
  it("asks the OS for a free port when none is specified", async () => {
    const server = createServer();
    servers.push(server);
    const port = await listenOnLocalhost(server, 0);
    expect(port).toBeGreaterThan(0);
    expect(localUrl(port)).toBe(`http://127.0.0.1:${port}`);
  });

  it("binds an explicit port when free", async () => {
    const taken = await allocateLocalPort();
    const server = createServer();
    servers.push(server);
    const port = await listenOnLocalhost(server, taken);
    expect(port).toBe(taken);
  });

  it("errors when an explicit port is already in use", async () => {
    const blocker = createServer();
    servers.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const used = (blocker.address() as AddressInfo).port;
    const server = createServer();
    servers.push(server);
    await expect(listenOnLocalhost(server, used)).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
