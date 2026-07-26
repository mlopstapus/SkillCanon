import type { ReactNode } from "react";
import { LogoMark, Wordmark } from "@/shared/ui";
import { AccountFooter, type AccountIdentity } from "./account-footer";

type AppShellProps = {
  children: ReactNode;
  navigation?: ReactNode;
  user: AccountIdentity;
};

export function AppShell({ children, navigation, user }: AppShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-[216px_minmax(0,1fr)] bg-bg text-text">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-panel">
        <div className="flex min-h-14 items-center gap-2.5 border-b border-border px-5">
          <LogoMark size={26} />
          <Wordmark className="text-[16px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{navigation}</div>
        <AccountFooter user={user} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
