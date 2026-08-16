import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate, isNewerVersion } from "../src/update-check.js";

describe("isNewerVersion", () => {
  it("returns true when the latest version is newer", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(true);
  });

  it("returns false when versions are equal or latest is older", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  let server: Server;
  let registryUrl: string;
  let requestCount: number;
  let respond: (req: IncomingMessage, res: ServerResponse) => void;
  let homeDir: string;
  let cwdDir: string;
  let cacheDir: string;

  beforeEach(async () => {
    requestCount = 0;
    respond = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ "dist-tags": { latest: "0.2.0" } }));
    };
    server = createServer((req, res) => {
      requestCount += 1;
      respond(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address && typeof address === "object") {
      registryUrl = `http://127.0.0.1:${address.port}/@mlopstapus/skillcanon`;
    }

    homeDir = mkdtempSync(join(tmpdir(), "skillcanon-home-"));
    cwdDir = mkdtempSync(join(tmpdir(), "skillcanon-cwd-"));
    cacheDir = mkdtempSync(join(tmpdir(), "skillcanon-cache-"));
    writeFileSync(join(homeDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=ghp_testtoken\n");

    delete process.env.SKILLCANON_DISABLE_UPDATE_CHECK;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwdDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.SKILLCANON_DISABLE_UPDATE_CHECK;
  });

  function options(overrides: Partial<Parameters<typeof checkForUpdate>[0]> = {}) {
    return {
      currentVersion: "0.1.0",
      cacheDir,
      homeDir,
      cwd: cwdDir,
      registryUrl,
      timeoutMs: 200,
      ...overrides,
    };
  }

  it("fetches on a cold cache and returns a notice when a newer version exists", async () => {
    const result = await checkForUpdate(options());
    expect(requestCount).toBe(1);
    expect(result.notice).toContain("0.1.0");
    expect(result.notice).toContain("0.2.0");
    expect(result.notice).toContain("npm install -g @mlopstapus/skillcanon@latest");
  });

  it("returns no notice when already on the latest version", async () => {
    const result = await checkForUpdate(options({ currentVersion: "0.2.0" }));
    expect(result.notice).toBeNull();
  });

  it("writes the cache on a successful check", async () => {
    await checkForUpdate(options());
    const cache = JSON.parse(readFileSync(join(cacheDir, "update-check.json"), "utf8")) as {
      lastCheckedAt: string;
      latestVersion: string | null;
    };
    expect(cache.latestVersion).toBe("0.2.0");
    expect(new Date(cache.lastCheckedAt).getTime()).not.toBeNaN();
  });

  it("skips the network call entirely on a cache hit within the window", async () => {
    const now = new Date();
    await checkForUpdate(options({ now: () => now }));
    expect(requestCount).toBe(1);

    const secondNow = new Date(now.getTime() + 60_000); // 1 minute later, well within 24h
    const result = await checkForUpdate(options({ now: () => secondNow }));
    expect(requestCount).toBe(1); // unchanged — no second network call
    expect(result.notice).toContain("0.2.0");
  });

  it("re-checks once the 24-hour cache window has elapsed", async () => {
    const now = new Date();
    await checkForUpdate(options({ now: () => now }));
    expect(requestCount).toBe(1);

    const later = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours later
    await checkForUpdate(options({ now: () => later }));
    expect(requestCount).toBe(2);
  });

  it("degrades silently and caches the attempt when the request times out", async () => {
    respond = () => {
      /* never respond — simulates a hung connection */
    };
    const result = await checkForUpdate(options({ timeoutMs: 50 }));
    expect(result.notice).toBeNull();

    const cache = JSON.parse(readFileSync(join(cacheDir, "update-check.json"), "utf8")) as {
      lastCheckedAt: string;
      latestVersion: string | null;
    };
    expect(cache.latestVersion).toBeNull();
    expect(new Date(cache.lastCheckedAt).getTime()).not.toBeNaN();
  });

  it("degrades silently on a non-2xx registry response", async () => {
    respond = (_req, res) => {
      res.writeHead(404);
      res.end();
    };
    const result = await checkForUpdate(options());
    expect(result.notice).toBeNull();
    expect(requestCount).toBe(1);
  });

  it("never attempts a network call when no registry token is found", async () => {
    rmSync(join(homeDir, ".npmrc"));
    const result = await checkForUpdate(options());
    expect(requestCount).toBe(0);
    expect(result.notice).toBeNull();

    const cache = JSON.parse(readFileSync(join(cacheDir, "update-check.json"), "utf8")) as {
      lastCheckedAt: string;
      latestVersion: string | null;
    };
    expect(cache.latestVersion).toBeNull();
    expect(new Date(cache.lastCheckedAt).getTime()).not.toBeNaN();
  });

  it("does nothing at all when SKILLCANON_DISABLE_UPDATE_CHECK is set", async () => {
    process.env.SKILLCANON_DISABLE_UPDATE_CHECK = "1";
    const result = await checkForUpdate(options());
    expect(requestCount).toBe(0);
    expect(result.notice).toBeNull();
    expect(() => readFileSync(join(cacheDir, "update-check.json"), "utf8")).toThrow();
  });

  it("does not affect the caller's own exit code or stdout when a notice is returned", async () => {
    const stdoutSpy: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      stdoutSpy.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    const exitCodeBefore = process.exitCode;
    try {
      const result = await checkForUpdate(options());
      expect(result.notice).not.toBeNull();
    } finally {
      process.stdout.write = originalWrite;
    }
    expect(stdoutSpy).toEqual([]); // checkForUpdate itself never writes to stdout
    expect(process.exitCode).toBe(exitCodeBefore); // never touches exitCode
  });
});
