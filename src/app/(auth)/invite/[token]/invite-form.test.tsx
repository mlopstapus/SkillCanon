import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InvitationPreview } from "@/bcs/identity-access";
import { InviteFormView } from "./invite-form";

const preview: InvitationPreview = {
  state: "pending",
  email: "kai@example.com",
  orgName: "Acme Ops",
  teamName: "Platform",
  role: "member",
};

describe("InviteForm", () => {
  it("renders locked email, destination context, and account fields", () => {
    const markup = renderToStaticMarkup(
      <InviteFormView preview={preview} state={{ status: "idle" }} action={vi.fn()} />,
    );

    expect(markup).toContain("Join Acme Ops.");
    expect(markup).toContain("Platform");
    expect(markup).toContain("Member");
    expect(markup).toContain("kai@example.com");
    expect(markup).toContain("Locked to this invitation");
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('name="username"');
    expect(markup).toContain('name="password"');
  });
});
