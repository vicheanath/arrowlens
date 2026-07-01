import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

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
        <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
          <div className="max-w-2xl rounded-lg border border-destructive/30 bg-card p-8 shadow-[var(--shadow-panel)]">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <h1 className="text-xl font-bold text-destructive">Something went wrong</h1>
            </div>

            <div className="mb-6 space-y-2">
              <p className="text-sm text-foreground/80">{this.state.error?.message}</p>
              {this.state.errorInfo && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    View error details
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-background p-3 font-mono text-xs text-muted-foreground">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={this.resetError}>Try Again</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload App
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
