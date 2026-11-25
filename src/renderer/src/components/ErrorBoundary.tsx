import { Component, ErrorInfo, ReactNode } from "react";
import { PageErrorFallback } from "./PageErrorFallback";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  componentName?: string;
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export function createInitialErrorBoundaryState(): ErrorBoundaryState {
  return { hasError: false, error: undefined };
}

export function createErrorState(error: Error): ErrorBoundaryState {
  return { hasError: true, error };
}

export function resolveErrorFallbackMessage(
  error: unknown,
  fallback: string = "Unknown error",
): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === "string" && msg.trim().length > 0) {
      return msg;
    }
  }
  return fallback;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = createInitialErrorBoundaryState();

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return createErrorState(error);
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    console.error(
      `[ErrorBoundary:${this.props.componentName || "root"}] Uncaught error:`,
      error,
      errorInfo,
    );
  }

  public reset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      const error = this.state.error || new Error("Unknown error");

      if (typeof this.props.fallback === "function") {
        return this.props.fallback(error, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <PageErrorFallback
          page={this.props.componentName || "application"}
          error={error}
          onRetry={this.reset}
        />
      );
    }

    return this.props.children;
  }
}
