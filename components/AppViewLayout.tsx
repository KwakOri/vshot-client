"use client";

import { ReactNode } from "react";

interface AppViewLayoutProps {
  children: ReactNode;
}

/**
 * Full-screen app-like layout that prevents scrolling.
 * Uses viewport height to fill the entire screen.
 */
export function AppViewLayout({ children }: AppViewLayoutProps) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-light text-dark flex flex-col">
      {children}
    </div>
  );
}
