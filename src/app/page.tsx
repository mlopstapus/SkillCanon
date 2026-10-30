import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInstanceSetUp } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { resolveAuthPageAccess } from "./(auth)/auth-redirect";

// Reads the session cookie and the database, so never prerender.
export const dynamic = "force-dynamic";

/** The root has no page of its own: a visitor goes to the app, to sign-in, or to first-run setup. */
export default async function Home() {
  const access = await resolveAuthPageAccess((await headers()).get("cookie"));
  if (access.status === "authenticated") redirect("/dashboard");
  redirect((await isInstanceSetUp(authDb)) ? "/login" : "/register");
}
