import { brandFontFaceCss, readBrandFile, resolveBrandFile } from "@/shared/brand/assets";

export const dynamic = "force-dynamic";

/**
 * Serves the operator-supplied Tribe fonts and logos (BRAND_ASSETS_DIR), plus
 * a generated `fonts.css`. Public on purpose: the sign-in page needs them.
 * Anything outside `fonts/` and `logos/`, or a missing file, is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length === 1 && path[0] === "fonts.css") {
    const css = brandFontFaceCss();
    return css
      ? new Response(css, { headers: { "content-type": "text/css", "cache-control": "public, max-age=3600" } })
      : new Response("Not found", { status: 404 });
  }
  const file = resolveBrandFile(path);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(readBrandFile(file.path)), {
    headers: { "content-type": file.contentType, "cache-control": "public, max-age=3600" },
  });
}
