export function UnassignedNotice() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6">
      <section className="max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.12em] text-a uppercase">
          Not yet assigned
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold">
          You&apos;re not on a team yet
        </h1>
        <p className="mt-3 leading-6 text-dim">
          Your account is signed in, but no team owns it right now. Ask an
          organization admin to assign you to a team.
        </p>
      </section>
    </main>
  );
}
