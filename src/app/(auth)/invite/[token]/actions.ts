"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, login } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { setSessionCookie } from "@/app/_lib/session-cookie";

export type InviteTerminalKind = "invalid" | "expired" | "accepted" | "revoked";

export type InviteFormState =
  | { status: "idle"; error?: string }
  | { status: "field-error"; error: string }
  | { status: "terminal"; terminal: InviteTerminalKind };


function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isNamedError(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}

function terminalForError(err: unknown): InviteTerminalKind | null {
  if (isNamedError(err, "InvalidInvitationTokenError")) {
    return "invalid";
  }
  if (isNamedError(err, "InvitationExpiredError")) {
    return "expired";
  }
  if (isNamedError(err, "InvitationAlreadyAcceptedError")) {
    return "accepted";
  }
  if (isNamedError(err, "InvitationRevokedError")) {
    return "revoked";
  }
  return null;
}

export async function acceptInviteAction(
  token: string,
  _state: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const displayName = formString(formData, "displayName");
  const username = formString(formData, "username");
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { status: "field-error", error: "Choose a username and password before continuing." };
  }

  let result: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    result = await acceptInvitation(authDb, token, {
      username,
      password,
      ...(displayName ? { displayName } : {}),
    });
  } catch (err) {
    const terminal = terminalForError(err);
    if (terminal) {
      return { status: "terminal", terminal };
    }
    if (isNamedError(err, "WeakPasswordError") || isNamedError(err, "DuplicateUserError")) {
      return { status: "field-error", error: err.message };
    }
    throw err;
  }

  const session = await login(authDb, result.user.email, password);
  if (!session) {
    return {
      status: "field-error",
      error: "Your account was created, but automatic sign in failed. Use the sign in page to continue.",
    };
  }

  await setSessionCookie(session.cookie);
  redirect("/dashboard");
}
