import React from "react";
import { MainLayout } from "./views/MainLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastContainer } from "./utils/toast";

export default function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
      <ToastContainer />
    </ErrorBoundary>
  );
}
