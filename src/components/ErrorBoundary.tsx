import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({
      errorInfo,
    });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-4">
          <div className="max-w-2xl rounded-lg border border-red-500/30 bg-slate-900 p-8 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
            </div>

            <div className="mb-6 space-y-2">
              <p className="text-sm text-slate-300">{this.state.error?.message}</p>
              {this.state.errorInfo && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
                    View error details
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-400">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.resetError}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
