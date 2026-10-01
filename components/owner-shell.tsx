import type { ReactNode } from "react";
import SideMenu from "./side-menu";

// Standard owner layout: sidebar (desktop) / bottom bar (mobile) + content.
// Pages keep their own TopBar above this.
export default function OwnerShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl items-start gap-4 px-4 pb-28 pt-4 md:pb-8">
      <SideMenu />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
