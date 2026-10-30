import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { getEvalProviderConfig, getEvalsEnabled } from "@/bcs/prompt-registry";
import { authDb, db, withTenantContext } from "@/shared/db";
import { EvalProviders } from "./eval-providers-view";

export default async function EvalProvidersPage() {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  if (!user) redirect("/login");
  const { config, enabled } = await withTenantContext(db, user.orgId, async (tx) => ({
    config: await getEvalProviderConfig(tx, user.orgId),
    enabled: await getEvalsEnabled(tx, user.orgId),
  }));
  return <EvalProviders isAdmin={user.role === "admin"} config={config} enabled={enabled} />;
}
