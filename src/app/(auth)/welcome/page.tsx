import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AppSessionUser, OrgSummary } from "@/bcs/identity-access";
import { authenticateSession, getOrganization } from "@/bcs/identity-access";
import { authDb } from "@/shared/db";

export function WelcomePageContent({ user, organization }: { user: AppSessionUser; organization: OrgSummary }) {
  const displayName = user.displayName || user.email;
  const stats = [
    { label: "Org name", value: organization.name },
    { label: "Root team", value: user.teamName },
    { label: "You", value: user.role === "admin" ? "Admin" : "Member" },
  ];

  return (
    <section className="grid gap-8">
      <div className="grid gap-3 text-center">
        <div className="relative mx-auto h-16 w-16">
          <div aria-hidden="true" className="absolute -inset-2 rounded-3xl bg-a-glow blur-xl" />
          <div
            aria-hidden="true"
            className="relative grid h-16 w-16 animate-floaty place-items-center rounded-tile bg-gradient-to-br from-a to-a-2 shadow-glow"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--afg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </div>
        </div>
        <p className="font-mono text-xs uppercase text-a">Instance ready</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Welcome, {displayName}.</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-dim">
          {organization.name} is ready. You are signed in as the admin and can enter the authenticated app.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat, index) => {
          const highlighted = index === stats.length - 1;
          return (
            <div
              key={stat.label}
              className={
                highlighted
                  ? "rounded-tile border border-a/35 bg-a-soft px-4 py-4 text-center"
                  : "rounded-tile border border-border bg-surface px-4 py-4 text-center"
              }
            >
              <p className={highlighted ? "font-mono text-[11px] uppercase text-a" : "font-mono text-[11px] uppercase text-faint"}>
                {stat.label}
              </p>
              <p className="mt-2 break-words font-display text-lg font-semibold text-text">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <Link
        href="/dashboard"
        className="inline-flex min-h-12 items-center justify-center rounded-cta bg-a px-5 text-sm font-bold text-a-fg shadow-glow transition hover:bg-a-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-a"
      >
        Enter SkillCanon -&gt;
      </Link>
    </section>
  );
}

export default async function WelcomePage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const organization = await getOrganization(authDb, user.orgId);
  return <WelcomePageContent user={user} organization={organization} />;
}
