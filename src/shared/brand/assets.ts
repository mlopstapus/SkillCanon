import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

/**
 * Tribe's fonts and logos are licensed / trademarked and this repository is
 * public (decision D5), so they are never committed. An operator points
 * `BRAND_ASSETS_DIR` at a private copy of the tribe-design skill's
 * `brand/assets` folder (`fonts/`, `logos/`); without it everything falls
 * back to system fonts and the SkillCanon mark.
 */
export function brandAssetsDir(env: Record<string, string | undefined> = process.env): string | null {
  const dir = env.BRAND_ASSETS_DIR?.trim();
  return dir && existsSync(dir) ? resolve(dir) : null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
};

/** Resolves `fonts/…` or `logos/…` inside the assets dir; anything else (traversal, other extensions, missing) is null. */
export function resolveBrandFile(
  parts: string[],
  dir: string | null = brandAssetsDir(),
): { path: string; contentType: string } | null {
  if (!dir || parts.length < 2 || !["fonts", "logos"].includes(parts[0] as string)) return null;
  const type = CONTENT_TYPES[extname(parts[parts.length - 1] as string).toLowerCase()];
  if (!type) return null;
  const path = resolve(join(dir, ...parts));
  if (!path.startsWith(dir + sep) || !existsSync(path) || !statSync(path).isFile()) return null;
  return { path, contentType: type };
}

export function readBrandFile(path: string): Buffer {
  return readFileSync(path);
}

type Face = { family: string; file: string; weight: number; style?: "italic" };

const FACES: Face[] = [
  { family: "TribeSerif", file: "TribeSerif-Light.otf", weight: 300 },
  { family: "TribeSerif", file: "TribeSerif-Book.otf", weight: 400 },
  { family: "TribeSans", file: "TribeSans-Light.woff2", weight: 300 },
  { family: "TribeSans", file: "TribeSans-LightItalic.woff2", weight: 300, style: "italic" },
  { family: "TribeSans", file: "TribeSans-Regular.woff2", weight: 400 },
  { family: "TribeSans", file: "TribeSans-Italic.woff2", weight: 400, style: "italic" },
  { family: "TribeSans", file: "TribeSans-Medium.woff2", weight: 500 },
  { family: "TribeSans", file: "TribeSans-DemiBold.woff2", weight: 600 },
  { family: "TribeCaption", file: "TribeCaption-Regular.woff2", weight: 400 },
];

/** `@font-face` rules for the faces actually present in the assets dir, or null with no assets. */
export function brandFontFaceCss(dir: string | null = brandAssetsDir()): string | null {
  if (!dir) return null;
  const rules = FACES.filter((f) => existsSync(join(dir, "fonts", f.file))).map(
    (f) =>
      `@font-face{font-family:"${f.family}";src:url("/brand/fonts/${f.file}");font-weight:${f.weight};${
        f.style ? `font-style:${f.style};` : ""
      }font-display:swap}`,
  );
  return rules.length > 0 ? rules.join("\n") : null;
}

/** True when the Tribe symbol is available, which switches the logo (and favicon) over. */
export function hasBrandSymbol(dir: string | null = brandAssetsDir()): boolean {
  return !!dir && existsSync(join(dir, "logos", "symbol.svg")) && existsSync(join(dir, "logos", "symbol-inverted.svg"));
}
