import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthPageAccess } from "../auth-redirect";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const cookieHeader = (await headers()).get("cookie");
  const access = await resolveAuthPageAccess(cookieHeader);

  if (access.status === "authenticated") {
    redirect("/dashboard");
  }

  return <RegisterForm />;
}
