"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession, logout } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { setSessionCookie } from "@/app/_lib/session-cookie";

/**
 * Ends the current session and returns to `/login` (011-logout-ui-wiring).
 * Resolves the acting user from the session cookie itself, never a
 * client-supplied id — mirrors every other Server Action's pattern in this
 * app. `authenticateSession`/`logout` both require `authDb` per
 * `bcs/identity-access/CONTRACT.md`'s Connection Requirements (no
 * organization context exists yet at this point).
 */
export async function logoutAction() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (user) {
    const { cookie } = await logout(authDb, user.id);
    await setSessionCookie(cookie);
  }
  redirect("/login");
}
