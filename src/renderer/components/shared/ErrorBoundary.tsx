import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-zinc-900">
          <div className="max-w-md rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center shadow-xl">
            <h1 className="mb-2 text-xl font-bold text-red-400">Algo deu errado</h1>
            <p className="mb-4 text-sm text-zinc-400">
              {this.state.error?.message ?? 'Um erro inesperado ocorreu.'}
            </p>
            <Button onClick={() => window.location.reload()}>Recarregar</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
