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
        <p className="font-mono text-xs uppercase text-a">Instance ready</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Welcome, {displayName}.</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-dim">
          {organization.name} is ready. You are signed in as the admin and can enter the authenticated app.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-tile border border-border bg-surface px-4 py-4 text-center">
            <p className="font-mono text-[11px] uppercase text-faint">{stat.label}</p>
            <p className="mt-2 break-words font-display text-lg font-semibold text-text">{stat.value}</p>
          </div>
        ))}
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
