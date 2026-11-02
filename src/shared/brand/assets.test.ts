import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brandAssetsDir, brandFontFaceCss, hasBrandSymbol, resolveBrandFile } from "./assets";

describe("brand assets (BRAND_ASSETS_DIR)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brand-"));
    mkdirSync(join(dir, "fonts"));
    mkdirSync(join(dir, "logos"));
    writeFileSync(join(dir, "fonts", "TribeSans-Regular.woff2"), "f");
    writeFileSync(join(dir, "logos", "symbol.svg"), "<svg/>");
    writeFileSync(join(dir, "logos", "symbol-inverted.svg"), "<svg/>");
    writeFileSync(join(dir, "secret.txt"), "nope");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is off without the env var or with a missing directory", () => {
    expect(brandAssetsDir({})).toBeNull();
    expect(brandAssetsDir({ BRAND_ASSETS_DIR: join(dir, "nope") })).toBeNull();
    expect(brandAssetsDir({ BRAND_ASSETS_DIR: dir })).toBe(dir);
    expect(hasBrandSymbol(null)).toBe(false);
    expect(brandFontFaceCss(null)).toBeNull();
  });

  it("serves only fonts/ and logos/ files with a known type, never outside the directory", () => {
    expect(resolveBrandFile(["logos", "symbol.svg"], dir)).toMatchObject({ contentType: "image/svg+xml" });
    expect(resolveBrandFile(["fonts", "TribeSans-Regular.woff2"], dir)).toMatchObject({ contentType: "font/woff2" });
    expect(resolveBrandFile(["secret.txt"], dir)).toBeNull();
    expect(resolveBrandFile(["fonts", "..", "secret.txt"], dir)).toBeNull();
    expect(resolveBrandFile(["logos", "..", "..", "etc", "passwd"], dir)).toBeNull();
    expect(resolveBrandFile(["logos", "missing.svg"], dir)).toBeNull();
    expect(resolveBrandFile(["logos", "symbol.svg"], null)).toBeNull();
  });

  it("generates @font-face only for the faces that exist, and detects the symbol pair", () => {
    const css = brandFontFaceCss(dir) ?? "";
    expect(css).toContain('font-family:"TribeSans"');
    expect(css).toContain("/brand/fonts/TribeSans-Regular.woff2");
    expect(css).not.toContain("TribeSerif");
    expect(hasBrandSymbol(dir)).toBe(true);
    rmSync(join(dir, "logos", "symbol-inverted.svg"));
    expect(hasBrandSymbol(dir)).toBe(false);
  });
});
