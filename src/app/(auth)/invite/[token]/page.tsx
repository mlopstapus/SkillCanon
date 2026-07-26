import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { previewInvitation } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { resolveAuthPageAccess } from "../../auth-redirect";
import { InviteForm, InviteTerminalState } from "./invite-form";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const cookieHeader = (await headers()).get("cookie");
  const access = await resolveAuthPageAccess(cookieHeader);

  if (access.status === "authenticated") {
    redirect("/dashboard");
  }

  const { token } = await params;
  const preview = await previewInvitation(authDb, token);

  if (!preview) {
    return <InviteTerminalState kind="invalid" />;
  }
  if (preview.state !== "pending") {
    return <InviteTerminalState kind={preview.state} />;
  }

  return <InviteForm token={token} preview={preview} />;
}
