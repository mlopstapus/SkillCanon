import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthPageAccess } from "../auth-redirect";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const cookieHeader = (await headers()).get("cookie");
  const access = await resolveAuthPageAccess(cookieHeader);

  if (access.status === "authenticated") {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
