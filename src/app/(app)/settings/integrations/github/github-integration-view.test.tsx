import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GithubIntegrationView } from "./github-integration-view";

const noop = async () => {};
const base: ComponentProps<typeof GithubIntegrationView> = {
  configured: true,
  isAdmin: true,
  installations: [],
  selectedInstallationId: null,
  repos: [],
  repoError: false,
  projects: [],
  links: [],
  notice: null,
  errorMessage: null,
  installAction: noop,
  linkAction: noop,
  unlinkAction: noop,
};
const render = (over: Partial<ComponentProps<typeof GithubIntegrationView>>) => renderToStaticMarkup(<GithubIntegrationView {...base} {...over} />);
const inst = [{ id: "i1", login: "acme", type: "Organization" as const, suspended: false }];

describe("GithubIntegrationView", () => {
  it("says the App is not configured and offers no install", () => {
    const html = render({ configured: false });
    expect(html).toContain("GitHub App not configured");
    expect(html).not.toContain("Install SkillCanon on GitHub");
  });

  it("shows the install call to action when nothing is installed", () => {
    const html = render({});
    expect(html).toContain("not installed on any GitHub account");
    expect(html).toContain("Install SkillCanon on GitHub");
  });

  it("shows no-links and no-projects empty states", () => {
    expect(render({ installations: inst, repos: [{ id: 1, fullName: "acme/api" }] })).toContain("Create a project first");
    expect(render({ installations: inst })).toContain("No repositories are linked");
  });

  it("renders the link form and linked repos with unlink for admins only", () => {
    const props = {
      installations: inst,
      repos: [{ id: 1, fullName: "acme/api" }],
      projects: [{ id: "p", name: "Docs" }],
      links: [{ id: "l1", repo: "acme/api", account: "acme", project: "Docs", projectId: "p" }],
    };
    const admin = render(props);
    expect(admin).toContain("Link repository");
    expect(admin).toContain("/projects/p/checks");
    expect(admin).toContain("Unlink acme/api from Docs");
    const member = render({ ...props, isAdmin: false });
    expect(member).not.toContain("Link repository");
    expect(member).not.toContain("Unlink");
  });
});
