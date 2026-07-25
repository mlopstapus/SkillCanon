"use server";

import { redirect } from "next/navigation";
import { login } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";
import { setSessionCookie } from "../_lib/session-cookie";

export type LoginFormState = {
  error?: string;
};


function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function loginAction(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formString(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Incorrect email or password." };
  }

  const result = await login(authDb, email, password);
  if (!result) {
    return { error: "Incorrect email or password." };
  }

  await setSessionCookie(result.cookie);
  redirect("/dashboard");
}
