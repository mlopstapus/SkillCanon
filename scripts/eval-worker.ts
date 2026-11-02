/**
 * Separate eval worker process (017/003 1b, PDR-020). Polls the eval_runs queue and executes runs
 * against each org's provider pool. Run with `pnpm eval-worker`; set DATABASE_URL (skillcanon_app role)
 * and JWT_SECRET (needed to decrypt provider keys). Scale by starting more processes.
 */
import { evalWorkerTick } from "@/bcs/prompt-registry";
import { db, withTenantContext } from "@/shared/db";
import { getLogger } from "@/shared/logging";

const POLL_MS = Number(process.env.EVAL_WORKER_POLL_MS ?? 3000);
const logger = getLogger("eval-worker");
const inFlight = new Set<string>();
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  logger.info({ pollMs: POLL_MS }, "eval worker started");
  while (!stopping) {
    try {
      await evalWorkerTick({
        db,
        inFlight,
        scopeFor: (orgId) => (fn) => withTenantContext(db, orgId, fn),
        log: (msg, extra) => logger.info(extra ?? {}, msg),
      });
    } catch (err) {
      logger.error({ err }, "queue poll failed");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  while (inFlight.size > 0) await new Promise((r) => setTimeout(r, 500)); // drain
  process.exit(0);
}
void main();
