import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readGithubPackagesToken } from "./config/npm-auth.js";

const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REGISTRY_URL = "https://npm.pkg.github.com/@mlopstapus/skillcanon";
const DEFAULT_TIMEOUT_MS = 2000;
const UPGRADE_COMMAND = "npm install -g @mlopstapus/skillcanon@latest";

interface UpdateCheckCache {
  lastCheckedAt: string;
  latestVersion: string | null;
}

export interface UpdateCheckOptions {
  currentVersion: string;
  cacheDir?: string;
  homeDir?: string;
  cwd?: string;
  registryUrl?: string;
  timeoutMs?: number;
  now?: () => Date;
}

export interface UpdateCheckResult {
  notice: string | null;
}

/** Plain major.minor.patch comparison — every version this registry publishes is a bare semver (research.md D7). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => Number(n) || 0);
  const b = current.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function formatNotice(currentVersion: string, latestVersion: string): string {
  return `A new version of skillcanon is available: ${currentVersion} → ${latestVersion}\nRun: ${UPGRADE_COMMAND}`;
}

function readCache(cachePath: string): UpdateCheckCache | null {
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, "utf8")) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function writeCache(cacheDir: string, cachePath: string, cache: UpdateCheckCache): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort — a cache write failure must never surface to the caller (FR-013's spirit).
  }
}

async function fetchLatestVersion(
  homeDir: string,
  cwd: string | undefined,
  registryUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  const token = readGithubPackagesToken(homeDir, cwd);
  if (!token) return null;

  try {
    const response = await fetch(registryUrl, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { "dist-tags"?: { latest?: string } };
    return body["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a newer CLI version has been published, per
 * 039-cli-distribution-publishing FR-010–FR-014. Never throws — every failure
 * mode (no token, network error, timeout, bad response) degrades to
 * `{ notice: null }`. Caller is responsible for printing `notice` (to
 * stderr — see index.ts) and must not let this affect exit code/stdout.
 */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateCheckResult> {
  if (process.env.SKILLCANON_DISABLE_UPDATE_CHECK) {
    return { notice: null };
  }

  const {
    currentVersion,
    cacheDir = join(homedir(), ".skillcanon"),
    homeDir = homedir(),
    cwd = process.cwd(),
    registryUrl = DEFAULT_REGISTRY_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => new Date(),
  } = options;

  const cachePath = join(cacheDir, "update-check.json");
  const cached = readCache(cachePath);
  const nowDate = now();

  let latestVersion: string | null;

  if (cached && nowDate.getTime() - new Date(cached.lastCheckedAt).getTime() < CACHE_WINDOW_MS) {
    latestVersion = cached.latestVersion;
  } else {
    latestVersion = await fetchLatestVersion(homeDir, cwd, registryUrl, timeoutMs);
    writeCache(cacheDir, cachePath, { lastCheckedAt: nowDate.toISOString(), latestVersion });
  }

  if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
    return { notice: formatNotice(currentVersion, latestVersion) };
  }
  return { notice: null };
}
