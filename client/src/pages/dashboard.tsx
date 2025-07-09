import Header from "@/components/layout/header";
import KpiCards from "@/components/dashboard/kpi-cards";
import ClassificationChart from "@/components/dashboard/classification-chart";
import UploadWidget from "@/components/dashboard/upload-widget";
import ReviewQueue from "@/components/dashboard/review-queue";
import BusinessInsights from "@/components/dashboard/business-insights";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ClassificationStats, BusinessCategory, ActivityItem } from "@/lib/types";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<ClassificationStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  // Mock data for chart and insights (in a real app, this would come from APIs)
  const chartData = {
    business: 68.2,
    individual: 28.7,
    government: 3.1
  };

  const businessCategories: BusinessCategory[] = [
    { name: "Professional Services", percentage: 32, color: "bg-primary-500" },
    { name: "Retail Trade", percentage: 24, color: "bg-success-500" },
    { name: "Construction", percentage: 18, color: "bg-warning-500" },
    { name: "Technology", percentage: 15, color: "bg-indigo-500" },
    { name: "Healthcare", percentage: 11, color: "bg-emerald-500" },
  ];

  const recentActivities: ActivityItem[] = [
    {
      id: "1",
      description: 'Processed <span class="font-medium">vendor_payments_october.csv</span>',
      details: "2,847 payees classified • 98.2% accuracy",
      time: "2 hours ago",
      type: "success"
    },
    {
      id: "2",
      description: 'Manual review completed for <span class="font-medium">contractors_q3.xlsx</span>',
      details: "45 classifications updated",
      time: "5 hours ago",
      type: "warning"
    },
    {
      id: "3",
      description: 'Export generated for <span class="font-medium">September_Classifications</span>',
      details: "Downloaded by Sarah Wilson",
      time: "1 day ago",
      type: "info"
    },
    {
      id: "4",
      description: "AI model retrained with user feedback",
      details: "Accuracy improved by 1.2%",
      time: "2 days ago",
      type: "info"
    },
  ];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-exclamation-triangle text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-500">Failed to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Dashboard" 
        subtitle="High-accuracy payee classification with OpenAI (95%+ confidence only)"
      >
        <div className="flex gap-2">
          <Link href="/upload">
            <Button>
              Upload File
            </Button>
          </Link>
          <Link href="/downloads">
            <Button variant="outline">
              Downloads
            </Button>
          </Link>
        </div>
      </Header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded p-4">
              <div className="text-2xl font-bold">{stats.totalPayees}</div>
              <div className="text-sm text-gray-600">Total Payees</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-2xl font-bold">{Math.round(stats.accuracy)}%</div>
              <div className="text-sm text-gray-600">Accuracy</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-2xl font-bold">95%+</div>
              <div className="text-sm text-gray-600">Min Confidence</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-2xl font-bold">{stats.filesProcessed}</div>
              <div className="text-sm text-gray-600">Files Processed</div>
            </div>
          </div>

          {/* No review queue - only 95%+ confidence results */}
        </div>
      </main>
    </div>
  );
}
