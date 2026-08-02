import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getLogger } from "@/shared/logging";
import { resolveCaller, type ResolvedCaller } from "./auth";
import { mapError, type ErrorBody, type MappedError } from "./errors";

const log = getLogger("distribution");

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function mappedErrorResponse(mapped: MappedError): Response {
  return jsonResponse(mapped.status, mapped.body);
}

const UNAUTHENTICATED_BODY: ErrorBody = {
  error: { code: "UNAUTHENTICATED", message: "Authentication required" },
};

interface RouteContext<TParams> {
  params: Promise<TParams>;
}

type RouteHandler<TParams> = (
  request: Request,
  ctx: { caller: ResolvedCaller; params: TParams },
) => Promise<Response>;

/**
 * Every route handler's composition root: resolves the caller (401s if
 * neither a session nor an API key resolves, before any BC call runs —
 * FR-010), invokes `fn`, and maps any thrown error through `mapError`
 * (FR-012/013/014). Does *not* itself call `withTenantContext` — each
 * route wraps its own BC call(s) in that, per research.md, since some
 * routes need more than one call inside the same transaction.
 *
 * `authDbClient` is an optional override forwarded to `resolveCaller`,
 * defaulting to the real singleton — production `route.ts` files never
 * pass it; `route.test.ts` files wrap their raw handler with
 * `withApiRoute(handler, testDb.authDb)` to run against a Testcontainers
 * instance instead (research.md).
 */
export function withApiRoute<TParams = Record<string, string>>(
  fn: RouteHandler<TParams>,
  authDbClient?: PostgresJsDatabase<Record<string, never>>,
): (request: Request, ctx: RouteContext<TParams>) => Promise<Response> {
  return async (request: Request, ctx: RouteContext<TParams>): Promise<Response> => {
    const start = Date.now();
    const params = await ctx.params;
    const url = new URL(request.url);

    const caller = await resolveCaller(request, authDbClient);
    if (!caller) {
      log.info({ path: url.pathname, method: request.method, durationMs: Date.now() - start }, "unauthenticated request rejected");
      return jsonResponse(401, UNAUTHENTICATED_BODY);
    }

    try {
      const response = await fn(request, { caller, params });
      log.info(
        {
          path: url.pathname,
          method: request.method,
          orgId: caller.organizationId,
          userId: caller.actingUser.id,
          status: response.status,
          durationMs: Date.now() - start,
        },
        "request completed",
      );
      return response;
    } catch (err) {
      const mapped = mapError(err);
      log.warn(
        {
          path: url.pathname,
          method: request.method,
          orgId: caller.organizationId,
          userId: caller.actingUser.id,
          code: mapped.body.error.code,
          durationMs: Date.now() - start,
        },
        "request failed",
      );
      return mappedErrorResponse(mapped);
    }
  };
}
