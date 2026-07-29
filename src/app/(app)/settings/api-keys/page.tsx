import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession, listApiKeys } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { ApiKeysList } from "./api-keys-list";

export default async function ApiKeysPage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const keys = await withTenantContext(db, user.orgId, (tx) => listApiKeys(tx, user));

  return <ApiKeysList currentUser={user} keys={keys} />;
}
