import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RegisterFormView } from "./register-form";

describe("RegisterForm", () => {
  it("renders organization and admin account field groups with password guidance", () => {
    const markup = renderToStaticMarkup(
      <RegisterFormView state={{ status: "idle" }} action={vi.fn()} />,
    );

    expect(markup).toContain("Organization");
    expect(markup).toContain('name="orgName"');
    expect(markup).toContain('name="teamName"');
    expect(markup).toContain("Admin account");
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('name="username"');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain("Minimum 8 characters");
  });
});
