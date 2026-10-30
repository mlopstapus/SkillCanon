import Link from "next/link";

export interface CheckRowView {
  id: string;
  repo: string;
  prNumber: number;
  status: "pass" | "fail" | "neutral";
  headSha: string;
  evaluatedAt: string;
  satisfied: string[];
  missing: string[];
  error: string | null;
}

export interface ProjectChecksViewProps {
  projectId: string;
  projectName: string;
  windowDays: number;
  /** Org-level state, to choose the right empty state. */
  hasInstallation: boolean;
  linkedRepos: string[];
  summary: { totalEvaluated: number; passed: number; failed: number; neutral: number; rate: number | null };
  checks: CheckRowView[];
}

const STATUS_LABEL = { pass: "Passed", fail: "Failed", neutral: "Could not evaluate" } as const;

export function ProjectChecksView({ projectId, projectName, windowDays, hasInstallation, linkedRepos, summary, checks }: ProjectChecksViewProps) {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header>
        <p className="text-sm text-muted">
          <Link href={`/projects/${projectId}`} className="underline">{projectName}</Link> / GitHub checks
        </p>
        <h1 className="font-display text-2xl">Required-skill checks</h1>
        <p className="text-sm text-muted">
          Which required skills ran on each pull request. Informational only; it never blocks a merge.{" "}
          <Link href="/settings/integrations/github" className="underline">Manage GitHub connection and repositories</Link>.
        </p>
      </header>

      {!hasInstallation ? (
        <section aria-labelledby="no-install">
          <h2 id="no-install" className="text-lg">SkillCanon is not installed on GitHub</h2>
          <Link href="/settings/integrations/github" className="underline">Install SkillCanon on GitHub</Link>
        </section>
      ) : linkedRepos.length === 0 && checks.length === 0 ? (
        <section aria-labelledby="no-repos">
          <h2 id="no-repos" className="text-lg">No repositories linked to this project</h2>
          <p className="text-sm text-muted">Link a repository to start checking its pull requests.</p>
          <Link href="/settings/integrations/github" className="underline">Link a repository</Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="repos-heading">
            <h2 id="repos-heading" className="text-lg">Linked repositories</h2>
            {linkedRepos.length === 0 ? (
              <p className="text-sm text-muted">No repositories are linked right now; earlier checks are kept below.</p>
            ) : (
              <ul aria-label="Linked repositories" className="text-sm">
                {linkedRepos.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </section>

          <section aria-labelledby="rate-heading">
            <h2 id="rate-heading" className="text-lg">Compliance, last {windowDays} days</h2>
            {summary.totalEvaluated === 0 ? (
              <p className="text-sm text-muted">No pull requests were evaluated in the last {windowDays} days.</p>
            ) : summary.rate === null ? (
              <p className="text-sm text-muted">
                {summary.neutral} check{summary.neutral === 1 ? "" : "s"} could not be evaluated, so there is no rate yet.
              </p>
            ) : (
              <p className="text-sm">
                <strong>{Math.round(summary.rate * 100)}%</strong> passed ({summary.passed} of {summary.passed + summary.failed} evaluated
                {summary.neutral > 0 ? `; ${summary.neutral} could not be evaluated and are not counted` : ""}).
              </p>
            )}
          </section>

          <section aria-labelledby="prs-heading" className="flex flex-col gap-2">
            <h2 id="prs-heading" className="text-lg">Pull requests</h2>
            {checks.length === 0 ? (
              <p className="text-sm text-muted">No pull requests have been evaluated yet. Open or update a pull request on a linked repository.</p>
            ) : (
              <ul aria-label="Pull request checks" className="flex flex-col gap-3">
                {checks.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{c.repo}#{c.prNumber}</span>
                      <span>{STATUS_LABEL[c.status]}</span>
                      <span className="text-muted">{c.evaluatedAt}</span>
                    </div>
                    {c.status === "neutral" ? (
                      <p className="text-muted">{c.error ?? "Evaluation failed."}</p>
                    ) : (
                      <p className="text-muted">
                        {c.satisfied.length > 0 ? `ran: ${c.satisfied.join(", ")}` : ""}
                        {c.satisfied.length > 0 && c.missing.length > 0 ? " · " : ""}
                        {c.missing.length > 0 ? `missing: ${c.missing.join(", ")}` : ""}
                        {c.satisfied.length === 0 && c.missing.length === 0 ? "No required skills." : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-sm text-muted">
            Who ran which skills is on the project&apos;s <Link href={`/projects/${projectId}`} className="underline">Metrics tab</Link>.
          </p>
        </>
      )}
    </div>
  );
}
