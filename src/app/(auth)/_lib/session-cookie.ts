import { cookies } from "next/headers";
import type { SessionCookieDescriptor } from "@/bcs/identity-access";

export async function setSessionCookie(cookie: SessionCookieDescriptor) {
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    ...(cookie.maxAge === undefined ? {} : { maxAge: cookie.maxAge }),
  });
}
