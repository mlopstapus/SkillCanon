import {
  authenticateSession as authenticateIdentitySession,
  type AppSessionUser,
} from "@/bcs/identity-access";
import { authDb } from "@/shared/db";

type AuthPageAccessDependencies = {
  authenticateSession(cookieHeader: string | null | undefined): Promise<AppSessionUser | null>;
};

export type AuthPageAccess =
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AppSessionUser };

const productionDependencies: AuthPageAccessDependencies = {
  authenticateSession: (cookieHeader) => authenticateIdentitySession(authDb, cookieHeader),
};

export async function resolveAuthPageAccess(
  cookieHeader: string | null | undefined,
  dependencies: AuthPageAccessDependencies = productionDependencies,
): Promise<AuthPageAccess> {
  const user = await dependencies.authenticateSession(cookieHeader);
  return user ? { status: "authenticated", user } : { status: "unauthenticated" };
}
