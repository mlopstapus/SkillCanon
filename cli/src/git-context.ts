import { execFileSync } from "node:child_process";

export interface GitContext {
  gitRemoteUrl: string | null;
  gitBranch: string | null;
  gitCommitSha: string | null;
}

function git(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", args, { cwd, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out || null;
  } catch {
    return null; // not a repo, no git, no remote, detached/empty repo: all just "no context"
  }
}

/** Drops `user:password@` from an http(s) remote so credentials never leave the machine. */
function withoutCredentials(remote: string): string {
  try {
    const url = new URL(remote);
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.username = "";
      url.password = "";
      return url.toString();
    }
  } catch {
    // scp-style (git@host:owner/repo) is not a URL; the server normalizes it
  }
  return remote;
}

/**
 * The local repo's remote, branch and commit, tagged onto a skill invocation
 * so the server can later match it to a PR (PDR-013). Best-effort: any
 * failure yields nulls, never an error.
 */
export function readGitContext(cwd: string): GitContext {
  const remote = git(cwd, ["config", "--get", "remote.origin.url"]);
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    gitRemoteUrl: remote ? withoutCredentials(remote) : null,
    gitBranch: branch && branch !== "HEAD" ? branch : null,
    gitCommitSha: git(cwd, ["rev-parse", "HEAD"]),
  };
}
