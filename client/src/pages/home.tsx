import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Sparkles, ClipboardList, BarChart3, Brain, Activity } from "lucide-react";
import { Link } from "wouter";
import { ClassificationViewer } from "@/components/classification-viewer";
import DashboardSection from "./home/dashboard-section";
import UploadWorkflow from "./home/upload-workflow";
import KeywordManagementView from "./home/keyword-management-view";
import SingleClassificationView from "./home/single-classification-view";

export default function Home() {
  const [currentView, setCurrentView] = useState<"dashboard" | "upload" | "keywords" | "single">("dashboard");
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);

  if (viewingBatchId) {
    return <ClassificationViewer batchId={viewingBatchId} onBack={() => setViewingBatchId(null)} />;
  }

  if (currentView === "keywords") {
    return <KeywordManagementView onBack={() => setCurrentView("upload")} />;
  }

  if (currentView === "single") {
    return <SingleClassificationView onNavigate={setCurrentView} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-light text-gray-900 dark:text-gray-100 tracking-wide">
                <span className="font-normal gradient-text">CLARITY ENGINE</span>
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 tracking-wide uppercase">
                Intelligent Payee Classification
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex gap-4">
              <Button
                variant={currentView === "dashboard" ? "default" : "outline"}
                onClick={() => setCurrentView("dashboard")}
                className="flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant={currentView === "upload" ? "default" : "outline"}
                onClick={() => setCurrentView("upload")}
                className="flex items-center gap-2"
              >
                <UploadIcon className="h-4 w-4" />
                Upload & Process
              </Button>
              <Button
                variant={currentView === "single" ? "default" : "outline"}
                onClick={() => setCurrentView("single")}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Quick Classify
              </Button>
              <Button
                variant={currentView === "keywords" ? "default" : "outline"}
                onClick={() => setCurrentView("keywords")}
                className="flex items-center gap-2"
              >
                <ClipboardList className="h-4 w-4" />
                Keyword Management
              </Button>
              <Link href="/akkio-models">
                <Button variant="outline" className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Akkio Models
                </Button>
              </Link>
              <Link href="/mastercard-monitor">
                <Button variant="outline" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Mastercard Monitor
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 max-w-7xl mx-auto">
        {currentView === "dashboard" ? (
          <DashboardSection onNavigate={setCurrentView} onViewBatch={setViewingBatchId} />
        ) : (
          <UploadWorkflow onViewBatch={setViewingBatchId} />
        )}
      </div>
    </div>
  );
}
