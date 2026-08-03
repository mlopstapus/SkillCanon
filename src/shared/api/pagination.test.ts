import { ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { paginate, parsePageParams } from "./pagination";

describe("parsePageParams", () => {
  it("defaults to page 1, pageSize 20 when unset", () => {
    expect(parsePageParams(new URL("http://x/y"))).toEqual({ page: 1, pageSize: 20 });
  });

  it("parses provided page/pageSize", () => {
    expect(parsePageParams(new URL("http://x/y?page=3&pageSize=50"))).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it("rejects a pageSize above the 100 cap", () => {
    expect(() => parsePageParams(new URL("http://x/y?pageSize=101"))).toThrow(ZodError);
  });

  it("rejects a non-positive page", () => {
    expect(() => parsePageParams(new URL("http://x/y?page=0"))).toThrow(ZodError);
  });

  it("rejects a non-numeric page", () => {
    expect(() => parsePageParams(new URL("http://x/y?page=abc"))).toThrow(ZodError);
  });
});

describe("paginate", () => {
  it("slices items and reports total against the full array", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const result = paginate(items, { page: 2, pageSize: 10 });
    expect(result).toEqual({ items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], page: 2, pageSize: 10, total: 25 });
  });

  it("returns an empty items array past the end", () => {
    const result = paginate([1, 2, 3], { page: 5, pageSize: 10 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(3);
  });
});
