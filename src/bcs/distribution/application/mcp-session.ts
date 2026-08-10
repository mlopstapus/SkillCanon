import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { authenticateApiKey, type UserSummary } from "@/bcs/identity-access";

export type Db = PostgresJsDatabase<Record<string, never>>;

export interface McpCaller {
  user: UserSummary;
  scopes: string[];
}

export interface McpSessionState {
  sessionId: string;
  caller: McpCaller | null;
  contextDelivered: boolean;
  createdAt: Date;
  lastSeenAt: Date;
}

export class McpSessionManager {
  private readonly sessions = new Map<string, McpSessionState>();

  getOrCreate(sessionId: string, now: Date = new Date()): McpSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastSeenAt = now;
      return existing;
    }

    const state: McpSessionState = {
      sessionId,
      caller: null,
      contextDelivered: false,
      createdAt: now,
      lastSeenAt: now,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  get(sessionId: string): McpSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  reset(): void {
    this.sessions.clear();
  }

  markContextDelivered(sessionId: string): void {
    this.getOrCreate(sessionId).contextDelivered = true;
  }

  cleanupStale(maxAgeMs: number, now: Date = new Date()): number {
    let removed = 0;
    for (const [sessionId, state] of this.sessions.entries()) {
      if (now.getTime() - state.lastSeenAt.getTime() > maxAgeMs) {
        this.sessions.delete(sessionId);
        removed += 1;
      }
    }
    return removed;
  }

  get activeCount(): number {
    return this.sessions.size;
  }
}

export const mcpSessionManager = new McpSessionManager();

// A stale MCP session (no activity for this long) is reclaimed regardless of
// whether its transport ever sent an explicit close — covers a crashed
// client, a dropped connection, or the fresh-random-id fallback bucket
// created for a brand-new session's first request. 24 hours comfortably
// exceeds any realistic reconnect/continuation window for a self-hosted,
// interactive dev tool (no MCP client documents a specific session-timeout
// assumption to confirm against), while still bounding worst-case growth to
// roughly one day of unclosed sessions rather than the lifetime of the
// process.
export const DEFAULT_MCP_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MCP_SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface McpSessionCleanupOptions {
  maxAgeMs?: number;
  intervalMs?: number;
}

/**
 * Starts a recurring sweep that reclaims stale sessions from `sessionManager`.
 * Returns a `stop()` function to cancel it. The timer is `unref()`'d so it
 * never keeps the Node process alive on its own (a graceful shutdown or a
 * test process can still exit cleanly with the interval pending).
 */
export function startMcpSessionCleanup(
  sessionManager: McpSessionManager = mcpSessionManager,
  options: McpSessionCleanupOptions = {},
): () => void {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MCP_SESSION_MAX_AGE_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_MCP_SESSION_CLEANUP_INTERVAL_MS;

  const timer = setInterval(() => {
    sessionManager.cleanupStale(maxAgeMs);
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}

export function extractBearerApiKey(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function resolveMcpCaller(
  authDb: Db,
  rawApiKey: string,
  sessionId: string,
  sessionManager: McpSessionManager = mcpSessionManager,
): Promise<McpCaller | null> {
  const state = sessionManager.getOrCreate(sessionId);
  if (state.caller) {
    return state.caller;
  }

  const resolved = await authenticateApiKey(authDb, rawApiKey);
  if (!resolved) {
    return null;
  }

  const caller = { user: resolved.user, scopes: resolved.scopes };
  state.caller = caller;
  return caller;
}
