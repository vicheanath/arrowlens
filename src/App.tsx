import React from "react";
import { MainLayout } from "./views/MainLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { DebugPanel } from "./components/DebugPanel";
import { ToastContainer } from "./utils/toast";

export default function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
      <DebugPanel />
      <ToastContainer />
    </ErrorBoundary>
  );
}
