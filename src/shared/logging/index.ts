import pino from "pino";

/** `env` defaults to `process.env` and is only overridden in tests, matching `shared/config`'s getter pattern. */
export function createLogger(env: Record<string, string | undefined> = process.env) {
  return pino({ level: env.LOG_LEVEL ?? "info" });
}

export const logger = createLogger();

/**
 * The only way to obtain a logger for a bounded context or cross-cutting
 * module (docs/context/api-conventions.md) — a `pino` child logger with
 * `bc` set once, so every line it emits carries that field without each
 * call site having to remember to pass it.
 */
export function getLogger(bc: string) {
  return logger.child({ bc });
}
