import { BrandRail } from "./_components/brand-rail";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_500px_at_75%_-10%,var(--aglow),transparent_60%),linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-[size:auto,52px_52px,52px_52px]"
      />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <BrandRail />
        <main className="grid min-h-screen place-items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[520px] rounded-card border border-border bg-panel/90 p-6 shadow-heavy backdrop-blur sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
