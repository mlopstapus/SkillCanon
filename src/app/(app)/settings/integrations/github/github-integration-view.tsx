export interface InstallationRowView {
  id: string;
  login: string;
  type: "Organization" | "User";
  suspended: boolean;
}

export interface RepoLinkView {
  id: string;
  repo: string;
  account: string | null;
  project: string;
}

type Notice = "installed" | "linked" | "unlinked" | "error" | null;
const NOTICE_TEXT: Record<Exclude<Notice, "error" | null>, string> = {
  installed: "SkillCanon was installed on GitHub.",
  linked: "Repository linked.",
  unlinked: "Repository unlinked.",
};

export function GithubIntegrationView({
  configured,
  isAdmin,
  installations,
  selectedInstallationId,
  repos,
  repoError,
  projects,
  links,
  notice,
  errorMessage,
  installAction,
  linkAction,
  unlinkAction,
}: {
  configured: boolean;
  isAdmin: boolean;
  installations: InstallationRowView[];
  selectedInstallationId: string | null;
  repos: Array<{ id: number; fullName: string }>;
  repoError: boolean;
  projects: Array<{ id: string; name: string }>;
  links: RepoLinkView[];
  notice: Notice;
  errorMessage: string | null;
  installAction: () => Promise<void>;
  linkAction: (formData: FormData) => Promise<void>;
  unlinkAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header>
        <h1 className="font-display text-2xl">GitHub</h1>
        <p className="text-sm text-muted">Connect SkillCanon to GitHub so pull requests can be checked against a project&apos;s required skills.</p>
      </header>

      {notice && notice !== "error" && <p role="status" className="text-sm">{NOTICE_TEXT[notice]}</p>}
      {notice === "error" && <p role="alert" className="text-sm">{errorMessage ?? "That did not work. Try again."}</p>}

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

          {installations.length > 0 && (
            <section aria-labelledby="links-heading" className="flex flex-col gap-3">
              <h2 id="links-heading" className="text-lg">Linked repositories</h2>
              {links.length === 0 ? (
                <p className="text-sm text-muted">No repositories are linked to a project yet.</p>
              ) : (
                <ul aria-label="Linked repositories" className="flex flex-col gap-2">
                  {links.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 text-sm">
                      <span className="font-medium">{l.repo}</span>
                      <span className="text-muted">→ {l.project}</span>
                      {isAdmin && (
                        <form action={unlinkAction}>
                          <input type="hidden" name="repoLinkId" value={l.id} />
                          <button type="submit" className="underline" aria-label={`Unlink ${l.repo} from ${l.project}`}>Unlink</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin &&
                (repoError ? (
                  <p role="alert" className="text-sm">GitHub could not be reached to list repositories. Try again shortly.</p>
                ) : repos.length === 0 || projects.length === 0 ? (
                  <p className="text-sm text-muted">
                    {repos.length === 0 ? "This installation has no accessible repositories." : "Create a project first, then link a repository to it."}
                  </p>
                ) : (
                  <form action={linkAction} className="flex flex-wrap items-end gap-3" aria-label="Link a repository">
                    <input type="hidden" name="installationId" value={selectedInstallationId ?? ""} />
                    <label className="flex flex-col gap-1 text-sm">
                      Repository
                      <select name="githubRepoId" required className="rounded border px-2 py-1">
                        {repos.map((r) => (
                          <option key={r.id} value={r.id}>{r.fullName}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Project
                      <select name="projectId" required className="rounded border px-2 py-1">
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="rounded border px-3 py-1.5 text-sm">Link repository</button>
                  </form>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
