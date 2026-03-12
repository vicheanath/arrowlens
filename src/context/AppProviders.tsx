import React from "react";
import { ToastProvider } from "../utils/toast";
import { DebugProvider } from "../state/debugStore";
import { UiProvider } from "../state/uiStore";
import { DatasetProvider } from "../state/datasetStore";
import { DatabaseProvider } from "../state/databaseStore";
import { QueryProvider } from "../state/queryStore";
import { QueryTabsProvider } from "./QueryTabsContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DebugProvider>
        <UiProvider>
          <DatasetProvider>
            <DatabaseProvider>
              <QueryProvider>
                <QueryTabsProvider>{children}</QueryTabsProvider>
              </QueryProvider>
            </DatabaseProvider>
          </DatasetProvider>
        </UiProvider>
      </DebugProvider>
    </ToastProvider>
  );
}
