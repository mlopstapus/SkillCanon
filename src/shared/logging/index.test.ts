import { describe, expect, it } from "vitest";
import { createLogger, getLogger, logger } from "./index";

describe("createLogger", () => {
  it("defaults to info level when LOG_LEVEL is unset", () => {
    expect(createLogger({}).level).toBe("info");
  });

  it("respects a configured LOG_LEVEL", () => {
    expect(createLogger({ LOG_LEVEL: "debug" }).level).toBe("debug");
  });
});

describe("logger", () => {
  it("exposes the standard pino-style logging methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });
});

describe("getLogger", () => {
  it("returns a child logger with bc bound", () => {
    const log = getLogger("distribution");
    expect(typeof log.info).toBe("function");
    expect(log.bindings()).toMatchObject({ bc: "distribution" });
  });
});
