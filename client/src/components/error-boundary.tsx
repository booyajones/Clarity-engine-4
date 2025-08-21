import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    try {
      fetch("/api/log-client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: error.toString(),
          info: errorInfo.componentStack,
        }),
      });
    } catch (logError) {
      console.error("Failed to report client error", logError);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-semibold">Something went wrong.</h1>
          <Button onClick={this.handleReload}>Reload Page</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
