import React from "react";
import { QueryTabsProvider } from "./QueryTabsContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <QueryTabsProvider>{children}</QueryTabsProvider>;
}
