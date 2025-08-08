import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
