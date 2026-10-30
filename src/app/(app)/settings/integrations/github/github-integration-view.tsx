export interface InstallationRowView {
  id: string;
  login: string;
  type: "Organization" | "User";
  suspended: boolean;
}

export function GithubIntegrationView({
  configured,
  isAdmin,
  installations,
  notice,
  installAction,
}: {
  configured: boolean;
  isAdmin: boolean;
  installations: InstallationRowView[];
  notice: "installed" | "error" | null;
  installAction: () => Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header>
        <h1 className="font-display text-2xl">GitHub</h1>
        <p className="text-sm text-muted">Connect SkillCanon to GitHub so pull requests can be checked against a project&apos;s required skills.</p>
      </header>

      {notice === "installed" && <p role="status" className="text-sm">SkillCanon was installed on GitHub.</p>}
      {notice === "error" && <p role="alert" className="text-sm">The GitHub install could not be completed. Start it again from here.</p>}

      {!configured ? (
        <section aria-labelledby="not-configured">
          <h2 id="not-configured" className="text-lg">GitHub App not configured</h2>
          <p className="text-sm text-muted">
            This instance has no GitHub App settings. An administrator needs to register the App and set
            GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY and GITHUB_APP_WEBHOOK_SECRET (see the README).
          </p>
        </section>
      ) : (
        <>
          {installations.length === 0 ? (
            <p className="text-sm text-muted">SkillCanon is not installed on any GitHub account yet.</p>
          ) : (
            <ul aria-label="GitHub installations" className="flex flex-col gap-2">
              {installations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{i.login}</span>
                  <span className="text-muted">{i.type}</span>
                  {i.suspended && <span className="text-muted">suspended</span>}
                </li>
              ))}
            </ul>
          )}
          {isAdmin ? (
            <form action={installAction}>
              <button type="submit" className="rounded border px-3 py-1.5 text-sm">Install SkillCanon on GitHub</button>
            </form>
          ) : (
            <p className="text-sm text-muted">Only an organization admin can install SkillCanon on GitHub.</p>
          )}
        </>
      )}
    </div>
  );
}
