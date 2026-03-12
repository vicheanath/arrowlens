import React, { createContext, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  suggestion?: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastStore | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...toast, id }]);

    if (toast.duration !== undefined && toast.duration > 0) {
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, toast.duration);
    }
  };

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearAll: () => setToasts([]),
    }),
    [toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastStore() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToastStore must be used within ToastProvider");
  }
  return context;
}

export function useToast() {
  const { addToast } = useToastStore();

  return {
    success: (message: string, title?: string, duration = 5000) => {
      addToast({ type: "success", message, title, duration });
    },
    error: (message: string, title?: string, suggestion?: string, duration = 7000) => {
      addToast({ type: "error", message, title, suggestion, duration });
    },
    warning: (message: string, title?: string, duration = 6000) => {
      addToast({ type: "warning", message, title, duration });
    },
    info: (message: string, title?: string, duration = 5000) => {
      addToast({ type: "info", message, title, duration });
    },
  };
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getBgColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "bg-green-900/20 border-green-500/30";
      case "error":
        return "bg-red-900/20 border-red-500/30";
      case "warning":
        return "bg-yellow-900/20 border-yellow-500/30";
      case "info":
        return "bg-blue-900/20 border-blue-500/30";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border ${getBgColor(toast.type)} p-4 shadow-lg animate-in fade-in slide-in-from-left`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0">{getIcon(toast.type)}</div>
            <div className="flex-1">
              {toast.title && (
                <p className="font-semibold text-slate-100">{toast.title}</p>
              )}
              <p className="text-sm text-slate-300">{toast.message}</p>
              {toast.suggestion && (
                <p className="mt-2 text-xs text-slate-400 italic">{toast.suggestion}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-200"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
