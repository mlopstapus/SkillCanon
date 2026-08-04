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
