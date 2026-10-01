import type { ReactNode } from "react";
import SideMenu from "./side-menu";

// Standard owner layout: fixed sticky sidebar (desktop) / bottom bar (mobile) + offset content.
export default function OwnerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50/50 dark:bg-stone-950">
      <SideMenu />
      <div className="min-w-0 flex-1 pb-28 md:ml-64 md:pb-12">
        {children}
      </div>
    </div>
  );
}

