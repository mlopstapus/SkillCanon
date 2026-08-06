import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { authDb as defaultAuthDb, db as defaultDb } from "@/shared/db";
import { getLogger } from "@/shared/logging";
import {
  MCP_TOOL_NAMES,
  invokeMcpTool,
  toolDescriptions,
  toolInputSchemas,
  type Db,
  type McpToolContext,
  type McpToolName,
} from "@/bcs/distribution";
import {
  extractBearerApiKey,
  mcpSessionManager,
  resolveMcpCaller,
  type McpCaller,
} from "@/bcs/distribution";

const log = getLogger("distribution");

interface McpAuthExtra {
  caller: McpCaller;
  db: Db;
  sourceIp: string | null;
}

interface McpTransportBundle {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
}

const transports = new Map<string, McpTransportBundle>();

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });
}

function extraToContext(extra: RequestHandlerExtra<ServerRequest, ServerNotification>): McpToolContext {
  const authExtra = extra.authInfo?.extra as Partial<McpAuthExtra> | undefined;
  if (!authExtra?.caller || !authExtra.db) {
    throw new Error("MCP request missing authenticated caller context.");
  }
  return {
    db: authExtra.db,
    caller: authExtra.caller,
    sessionId: extra.sessionId ?? "stateless",
    auditContext: { transport: "api", sourceIp: authExtra.sourceIp ?? null },
    sessionManager: mcpSessionManager,
  };
}

export function createSkillCanonMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "SkillCanon",
      version: "0.1.0",
    },
    {
      instructions:
        "SkillCanon is a prompt registry. Use sh-list to see available prompts, sh-search to find prompts by tag or name, and sh-run to expand a specific prompt with your input. Use sh-workflow-list and sh-workflow-run for legacy workflow-compatible skill chains.",
    },
  );

  for (const name of MCP_TOOL_NAMES) {
    server.registerTool(
      name,
      {
        description: toolDescriptions[name],
        inputSchema: toolInputSchemas[name],
      },
      async (args: unknown, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => invokeMcpTool(name, args, extraToContext(extra)),
    );
  }

  return server;
}

function getSessionId(request: Request): string | null {
  return request.headers.get("mcp-session-id");
}

async function parseBody(request: Request): Promise<unknown> {
  if (request.method !== "POST") {
    return undefined;
  }
  return request.clone().json().catch(() => undefined);
}

async function getOrCreateTransport(request: Request, parsedBody: unknown): Promise<WebStandardStreamableHTTPServerTransport | Response> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    const bundle = transports.get(sessionId);
    if (!bundle) {
      return jsonRpcError(404, -32001, "Session not found");
    }
    return bundle.transport;
  }

  if (request.method !== "POST" || !isInitializeRequest(parsedBody)) {
    return jsonRpcError(400, -32000, "Bad Request: No valid session ID provided");
  }

  let transport!: WebStandardStreamableHTTPServerTransport;
  transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (initializedSessionId) => {
      transports.set(initializedSessionId, { transport, server });
      mcpSessionManager.getOrCreate(initializedSessionId);
    },
    onsessionclosed: (closedSessionId) => {
      transports.delete(closedSessionId);
      mcpSessionManager.remove(closedSessionId);
    },
  });

  const server = createSkillCanonMcpServer();
  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
      mcpSessionManager.remove(transport.sessionId);
    }
  };
  await server.connect(transport);
  return transport;
}

async function handleMcpRequest(request: Request, deps: { authDb?: Db; db?: Db } = {}): Promise<Response> {
  const start = Date.now();
  const rawApiKey = extractBearerApiKey(request);
  if (!rawApiKey) {
    log.info({ path: "/mcp", method: request.method, durationMs: Date.now() - start }, "unauthenticated MCP request rejected");
    return jsonRpcError(401, -32001, "Authentication required");
  }

  const parsedBody = await parseBody(request);
  const transportOrResponse = await getOrCreateTransport(request, parsedBody);
  if (transportOrResponse instanceof Response) {
    return transportOrResponse;
  }

  // transportOrResponse.sessionId is only assigned once the SDK actually
  // processes this request's body (inside .handleRequest, called below) —
  // for a brand-new session's very first (initialize) message it is always
  // undefined here. A shared literal fallback (e.g. "pending") would make
  // every such first-message request key into the *same* McpSessionManager
  // bucket, so once any one caller's identity is cached there, every later
  // new session's first message would silently reuse that cached caller
  // instead of validating its own bearer key — a real cross-session
  // authentication bypass, not just a naming nit. A fresh random id per
  // request guarantees this fallback bucket is never shared across two
  // distinct requests.
  const sessionId = transportOrResponse.sessionId ?? getSessionId(request) ?? randomUUID();
  const caller = await resolveMcpCaller(deps.authDb ?? defaultAuthDb, rawApiKey, sessionId, mcpSessionManager);
  if (!caller) {
    log.info({ path: "/mcp", method: request.method, durationMs: Date.now() - start }, "unauthenticated MCP request rejected");
    return jsonRpcError(401, -32001, "Authentication required");
  }

  try {
    const response = await transportOrResponse.handleRequest(request, {
      parsedBody,
      authInfo: {
        token: "validated-api-key",
        clientId: caller.user.id,
        scopes: caller.scopes,
        extra: {
          caller,
          db: deps.db ?? defaultDb,
          sourceIp: request.headers.get("x-forwarded-for"),
        },
      },
    });
    log.info(
      {
        path: "/mcp",
        method: request.method,
        orgId: caller.user.orgId,
        userId: caller.user.id,
        status: response.status,
        durationMs: Date.now() - start,
      },
      "MCP request completed",
    );
    return response;
  } catch (err) {
    log.warn(
      {
        path: "/mcp",
        method: request.method,
        orgId: caller.user.orgId,
        userId: caller.user.id,
        errorName: err instanceof Error ? err.name : "UnknownError",
        durationMs: Date.now() - start,
      },
      "MCP request failed",
    );
    return jsonRpcError(500, -32603, "Internal server error");
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export const _test = { handleMcpRequest, createSkillCanonMcpServer, transports, log };
