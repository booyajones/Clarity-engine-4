import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Upload from "@/pages/upload";
import Classifications from "@/pages/classifications";
import Review from "@/pages/review";
import Downloads from "@/pages/downloads";
import Sidebar from "@/components/layout/sidebar";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Clarity - Loading Test</h1>
        <p>If you can see this, React is working!</p>
        <button 
          onClick={() => alert('React is working!')} 
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Button
        </button>
      </div>
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
