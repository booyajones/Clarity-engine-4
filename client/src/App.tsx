import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useIsFetching } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/error-boundary";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import { AkkioModels } from "@/pages/akkio-models";
import MastercardMonitor from "@/pages/mastercard-monitor";
import { BatchJobMonitor } from "@/pages/batch-job-monitor";

function Router() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 transition-colors duration-300">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/akkio-models" component={AkkioModels} />
        <Route path="/mastercard-monitor" component={MastercardMonitor} />
        <Route path="/batch-jobs" component={BatchJobMonitor} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function LoadingIndicator() {
  const isFetching = useIsFetching();

  if (!isFetching) return null;

  return (
    <div
      role="progressbar"
      aria-label="Content loading"
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed top-0 left-0 right-0 z-50 h-1 bg-primary animate-pulse"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

function AppContent() {
  return (
    <>
      <LoadingIndicator />
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
