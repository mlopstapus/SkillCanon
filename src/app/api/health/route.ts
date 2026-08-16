// Liveness/readiness check for orchestrators (e.g. a k8s httpGet probe —
// see charts/skillcanon/templates/deployment.yaml). Deliberately has no
// dependencies beyond the Next.js runtime itself — no auth, no DB
// round-trip — so it can't fail from a downstream outage it isn't
// actually reporting on. `force-dynamic` keeps it from being statically
// optimized at build time, so it always reflects the live server process.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok" });
}
