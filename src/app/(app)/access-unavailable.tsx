import { AppState } from "@/shared/ui";

export function AccessUnavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6">
      <AppState
        variant="error"
        title="This workspace is not enabled"
        description="Your account is still signed in, but this organization does not currently have access to the application."
        className="max-w-md rounded-card border border-border bg-surface p-8"
      />
    </main>
  );
}
