import { authenticateSession } from "@/bcs/identity-access";
import { completeInstall, getGithubAppConfig } from "@/bcs/vcs-integration";
import { authDb, db, withTenantContext } from "@/shared/db";

const PAGE = "/settings/integrations/github";

/**
 * GitHub sends the user back here after the install. Needs the signed-in
 * admin's session, so a stranger hitting the URL (or a replayed link for
 * someone else) records nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (query: string) => Response.redirect(new URL(`${PAGE}?${query}`, url), 303);

  const user = await authenticateSession(authDb, request.headers.get("cookie"));
  if (!user) return Response.redirect(new URL("/login", url), 303);
  const config = getGithubAppConfig();
  if (!config || user.role !== "admin") return back("error=unavailable");

  const githubInstallationId = Number(url.searchParams.get("installation_id"));
  if (!Number.isInteger(githubInstallationId) || githubInstallationId <= 0) return back("error=invalid");

  try {
    await withTenantContext(db, user.orgId, (tx) =>
      completeInstall(tx, config, { organizationId: user.orgId, userId: user.id }, {
        state: url.searchParams.get("state"),
        githubInstallationId,
      }),
    );
    return back("installed=1");
  } catch {
    return back("error=failed");
  }
}
