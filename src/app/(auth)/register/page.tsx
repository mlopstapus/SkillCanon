import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInstanceSetUp } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { resolveAuthPageAccess } from "../auth-redirect";
import { InviteOnlyNotice, RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const cookieHeader = (await headers()).get("cookie");
  const access = await resolveAuthPageAccess(cookieHeader);

  if (access.status === "authenticated") {
    redirect("/dashboard");
  }

  if (await isInstanceSetUp(authDb)) {
    return <InviteOnlyNotice />;
  }

  return <RegisterForm />;
}
