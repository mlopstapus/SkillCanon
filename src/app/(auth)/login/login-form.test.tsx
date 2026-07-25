import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginFormView } from "./login-form";

describe("LoginForm", () => {
  it("renders email and password fields, submit button, and register link without a default error", () => {
    const markup = renderToStaticMarkup(<LoginFormView state={{}} action={vi.fn()} />);

    expect(markup).toContain("Welcome back.");
    expect(markup).toContain('name="email"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain("Sign in");
    expect(markup).toContain('href="/register"');
    expect(markup).not.toContain('role="alert"');
  });
});
