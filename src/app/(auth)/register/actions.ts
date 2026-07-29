"use server";

import { redirect } from "next/navigation";
import { login, registerFirstRunAdmin } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { setSessionCookie } from "@/app/_lib/session-cookie";
import { slugify } from "./slugify";

export type RegisterFormState = {
  status: "idle" | "blocked" | "field-error";
  error?: string;
};


function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isNamedError(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}

export async function registerAction(
  _state: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const orgName = formString(formData, "orgName");
  const teamName = formString(formData, "teamName");
  const displayName = formString(formData, "displayName");
  const username = formString(formData, "username");
  const email = formString(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!orgName || !teamName || !displayName || !username || !email || !password) {
    return { status: "field-error", error: "Complete every required field before continuing." };
  }

  try {
    await registerFirstRunAdmin(authDb, {
      organization: { name: orgName, slug: slugify(orgName) },
      team: { name: teamName, slug: slugify(teamName) },
      admin: { username, displayName, email, password },
    });
  } catch (err) {
    if (isNamedError(err, "SecondOrganizationNotAllowedError")) {
      return { status: "blocked" };
    }
    if (isNamedError(err, "WeakPasswordError") || isNamedError(err, "DuplicateUserError")) {
      return { status: "field-error", error: err.message };
    }
    throw err;
  }

  const session = await login(authDb, email, password);
  if (!session) {
    return {
      status: "field-error",
      error: "The instance was created, but automatic sign in failed. Use the sign in page to continue.",
    };
  }

  await setSessionCookie(session.cookie);
  redirect("/welcome");
}
