import React from "react";
import { ToastProvider } from "../utils/toast";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { DebugProvider } from "../state/debugStore";
import { UiProvider } from "../state/uiStore";
import { DatasetProvider } from "../state/datasetStore";
import { DatabaseProvider } from "../state/databaseStore";
import { QueryProvider } from "../state/queryStore";
import { AiProvider } from "../state/aiStore";
import { WorkspaceSessionProvider } from "../features/workspace-session";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <DebugProvider>
          <UiProvider>
            <DatasetProvider>
              <DatabaseProvider>
                <QueryProvider>
                  <AiProvider>
                    <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>
                  </AiProvider>
                </QueryProvider>
              </DatabaseProvider>
            </DatasetProvider>
          </UiProvider>
        </DebugProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
