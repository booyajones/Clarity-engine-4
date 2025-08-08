import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, Download, Loader2, X, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle, Activity, ArrowRight, ClipboardList, Sparkles, Eye, Settings, Brain, Package, Database, TrendingUp, Users, Shield, MapPin, Zap, RefreshCw, BarChart3, Search } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProgressTracker } from "@/components/progress-tracker";
import { ClassificationViewer } from "@/components/classification-viewer";
import { KeywordManager } from "@/components/keyword-manager";
import { SingleClassification } from "@/components/single-classification";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface UploadBatch {
  id: number;
  filename: string;
  originalFilename: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  totalRecords: number;
  processedRecords: number;
  accuracy: number;
  skippedRecords?: number;
  failedRecords?: number;
  userId: number;
  createdAt: string;
  completedAt?: string;
  currentStep?: string;
  progressMessage?: string;
  // Mastercard enrichment tracking
  mastercardEnrichmentStatus?: string;
  mastercardEnrichmentStartedAt?: string;
  mastercardEnrichmentCompletedAt?: string;
  mastercardEnrichmentProgress?: number;
  mastercardEnrichmentTotal?: number;
  mastercardEnrichmentProcessed?: number;
}

interface DashboardStats {
  supplierCache: {
    total: number;
    lastUpdated: string;
    syncStatus: string;
  };
  classification: {
    totalProcessed: number;
    accuracy: number;
    pendingCount: number;
  };
  finexio: {
    matchRate: number;
    totalMatches: number;
    enabled: boolean;
  };
  mastercard: {
    enrichmentRate: number;
    pendingSearches: number;
    enabled: boolean;
  };
  system: {
    memoryUsage: number;
    activeBatches: number;
    queueLength: number;
  };
}

export default function Home() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    filename: string;
    headers: string[];
    tempFileName: string;
  } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "upload" | "keywords" | "single">("dashboard");
  const [matchingOptions, setMatchingOptions] = useState({
    enableFinexio: true,
    enableMastercard: true,
    enableGoogleAddressValidation: false,
    enableAddressNormalization: true,
  });
  const [addressColumns, setAddressColumns] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  const { data: batches, isLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
    refetchInterval: (query) => {
      // Only poll when there are active processing batches
      const hasProcessingBatches = query.state.data?.some(
        batch => batch.status === "processing"
      );
      return hasProcessingBatches ? 5000 : false; // Poll every 5 seconds only when processing
    }
  });

  // Dashboard stats query
  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `${res.status}: ${res.statusText}`);
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setIsUploading(false);
      // Try to auto-select payee column
      const possibleColumns = ["payee", "payee_name", "name", "vendor", "customer_name", "company"];
      const found = data.headers.find((h: string) => 
        possibleColumns.some(col => h.toLowerCase().includes(col))
      );
      if (found) {
        setSelectedColumn(found);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ tempFileName, originalFilename, payeeColumn, matchingOptions }: {
      tempFileName: string;
      originalFilename: string;
      payeeColumn: string;
      matchingOptions?: any;
    }) => {
      const res = await fetch("/api/upload/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tempFileName,
          originalFilename,
          payeeColumn,
          matchingOptions,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `${res.status}: ${res.statusText}`);
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File uploaded successfully. Processing will begin shortly.",
      });
      setSelectedFile(null);
      setPreviewData(null);
      setSelectedColumn("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/upload/batches/${batchId}/cancel`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Cancelled",
        description: "Processing has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/upload/batches/${batchId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Deleted",
        description: "Batch has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setIsUploading(true);
      previewMutation.mutate(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    previewMutation.mutate(selectedFile);
  };

  const handleProcessFile = () => {
    if (!previewData || !selectedColumn) return;
    
    processMutation.mutate({
      tempFileName: previewData.tempFileName,
      originalFilename: previewData.filename,
      payeeColumn: selectedColumn,
      matchingOptions,
    });
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="badge-enhanced status-completed border animate-fade-in-up">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </span>
        );
      case "processing":
        return (
          <span className="badge-enhanced status-processing border pulse-gentle">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="badge-enhanced status-failed border">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="badge-enhanced status-pending border">
            <X className="h-3 w-3 mr-1" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="badge-enhanced status-pending border">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </span>
        );
    }
  };

  const [downloadingBatchId, setDownloadingBatchId] = useState<number | null>(null);
  
  const handleDownload = async (batchId: number, filename: string) => {
    try {
      setDownloadingBatchId(batchId);
      
      // Show initial toast
      toast({
        title: "Preparing Download",
        description: "Generating your CSV file...",
      });
      
      const response = await fetch(`/api/classifications/export/${batchId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Download failed');
      }
      
      // Get file size for progress tracking
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      const blob = await response.blob();
      
      // Validate blob size
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Generate timestamp for unique filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      a.download = `classified_${filename.replace(/\.[^/.]+$/, '')}_${timestamp}.csv`;
      
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      
      toast({
        title: "✓ Download Complete",
        description: `Successfully downloaded ${filename} with classification results.`,
        className: "bg-green-50 border-green-200",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Could not download the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const processingBatches = batches?.filter(b => b.status === "processing") || [];
  const completedBatches = batches?.filter(b => b.status === "completed") || [];
  const otherBatches = batches?.filter(b => !["processing", "completed"].includes(b.status)) || [];

  // If viewing a specific batch, show the classification viewer
  if (viewingBatchId) {
    return (
      <ClassificationViewer 
        batchId={viewingBatchId} 
        onBack={() => setViewingBatchId(null)} 
      />
    );
  }

  // If viewing keyword manager, show that component
  if (currentView === "keywords") {
    return <KeywordManager onBack={() => setCurrentView("upload")} />;
  }

  // If viewing single classification, show that component
  if (currentView === "single") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-8 py-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-light text-gray-900 tracking-wide">
                  <span className="font-normal">CLARITY ENGINE</span>
                </h1>
                <p className="text-sm text-gray-500 mt-2 tracking-wide uppercase">Quick Single Payee Classification</p>
              </div>
            </div>
            
            {/* Navigation */}
            <div className="mt-6 border-t border-gray-200 pt-6">
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentView("upload")}
                  className="flex items-center gap-2"
                >
                  <UploadIcon className="h-4 w-4" />
                  Upload & Process
                </Button>
                <Button
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Quick Classify
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentView("keywords")}
                  className="flex items-center gap-2"
                >
                  <ClipboardList className="h-4 w-4" />
                  Keyword Management
                </Button>
                <Link href="/akkio-models">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Brain className="h-4 w-4" />
                    Akkio Models
                  </Button>
                </Link>
                <Link href="/mastercard-monitor">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Activity className="h-4 w-4" />
                    Mastercard Monitor
                  </Button>
                </Link>
                <Link href="/batch-jobs">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Package className="h-4 w-4" />
                    Batch Jobs
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-8 max-w-7xl mx-auto">
          <SingleClassification />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="animate-fade-in-up">
              <h1 className="text-4xl font-light text-gray-900 dark:text-gray-100 tracking-wide">
                <span className="font-normal gradient-text">CLARITY ENGINE</span>
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 tracking-wide uppercase">Intelligent Payee Classification</p>
            </div>
            <div className="flex items-center gap-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="text-right">
                <p className="text-2xl font-light text-gray-900 dark:text-gray-100">95%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Accuracy Target</p>
              </div>
              <div className="h-12 w-px bg-gray-200 dark:bg-gray-600"></div>
              <div className="text-right">
                <p className="text-2xl font-light text-gray-900 dark:text-gray-100">6</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Categories</p>
              </div>
            </div>
          </div>
          
          {/* Navigation */}
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex gap-4">
              <Button
                variant={currentView === "dashboard" ? "default" : "outline"}
                onClick={() => setCurrentView("dashboard")}
                className={`flex items-center gap-2 transition-all ${currentView === "dashboard" ? "shadow-lg" : "hover:shadow-md hover:border-indigo-300"}`}
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant={currentView === "upload" ? "default" : "outline"}
                onClick={() => setCurrentView("upload")}
                className={`flex items-center gap-2 transition-all ${currentView === "upload" ? "shadow-lg" : "hover:shadow-md hover:border-blue-300"}`}
              >
                <UploadIcon className="h-4 w-4" />
                Upload & Process
              </Button>
              <Button
                variant={currentView === "single" ? "default" : "outline"}
                onClick={() => setCurrentView("single" as any)}
                className={`flex items-center gap-2 transition-all ${currentView === "single" ? "shadow-lg" : "hover:shadow-md hover:border-purple-300"}`}
              >
                <Sparkles className="h-4 w-4" />
                Quick Classify
              </Button>
              <Button
                variant={currentView === "keywords" ? "default" : "outline"}
                onClick={() => setCurrentView("keywords" as any)}
                className={`flex items-center gap-2 transition-all ${currentView === "keywords" ? "shadow-lg" : "hover:shadow-md hover:border-amber-300"}`}
              >
                <ClipboardList className="h-4 w-4" />
                Keyword Management
              </Button>
              <Link href="/akkio-models">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 hover:shadow-md hover:border-orange-300 transition-all"
                >
                  <Brain className="h-4 w-4" />
                  Akkio Models
                </Button>
              </Link>
              <Link href="/mastercard-monitor">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 hover:shadow-md hover:border-green-300 transition-all"
                >
                  <Activity className="h-4 w-4" />
                  Mastercard Monitor
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 max-w-7xl mx-auto">

      {/* Dashboard View */}
      {currentView === "dashboard" && (
        <div className="space-y-6 animate-fade-in-up">
          {/* System Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Supplier Cache Status */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  Supplier Cache
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboardStats?.supplierCache?.total.toLocaleString() || "120,000"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardStats?.supplierCache?.syncStatus === "syncing" ? (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Syncing...
                    </span>
                  ) : (
                    "Last updated: 2 hours ago"
                  )}
                </p>
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs">
                    387,283 Total Available
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Classification Performance */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  Classification Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboardStats?.classification?.accuracy || 97.4}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Average accuracy
                </p>
                <div className="mt-2 flex gap-1">
                  <Badge variant="success" className="text-xs">
                    {dashboardStats?.classification?.totalProcessed || "6,791"} Processed
                  </Badge>
                  {(dashboardStats?.classification?.pendingCount || 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {dashboardStats?.classification?.pendingCount} Pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Finexio Match Status */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-600" />
                  Finexio Matching
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboardStats?.finexio?.matchRate || 31}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Match rate
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge 
                    variant={dashboardStats?.finexio?.enabled ? "success" : "secondary"} 
                    className="text-xs"
                  >
                    {dashboardStats?.finexio?.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {dashboardStats?.finexio?.totalMatches || "120K"} matches
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Mastercard Enrichment */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-600" />
                  Mastercard Enrichment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboardStats?.mastercard?.enrichmentRate || 78}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enrichment rate
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge 
                    variant={dashboardStats?.mastercard?.enabled ? "success" : "secondary"} 
                    className="text-xs"
                  >
                    {dashboardStats?.mastercard?.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {(dashboardStats?.mastercard?.pendingSearches || 0) > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {dashboardStats?.mastercard?.pendingSearches} pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Processing Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active Processing */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Active Processing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {batches?.filter(b => b.status === "processing").slice(0, 3).map(batch => (
                    <div key={batch.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{batch.originalFilename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${(batch.processedRecords / batch.totalRecords) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {batch.processedRecords}/{batch.totalRecords}
                          </span>
                        </div>
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No active processing</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* System Health */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-600" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Memory Usage</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            (dashboardStats?.system?.memoryUsage || 82) > 90 ? 'bg-red-600' : 
                            (dashboardStats?.system?.memoryUsage || 82) > 75 ? 'bg-yellow-600' : 'bg-green-600'
                          }`}
                          style={{ width: `${dashboardStats?.system?.memoryUsage || 82}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{dashboardStats?.system?.memoryUsage || 82}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active Batches</span>
                    <Badge variant="outline">{dashboardStats?.system?.activeBatches || batches?.filter(b => b.status === "processing").length || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Queue Length</span>
                    <Badge variant="outline">{dashboardStats?.system?.queueLength || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Daily Sync</span>
                    <Badge variant="success" className="text-xs">Scheduled 2 AM EST</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {batches?.slice(0, 5).map(batch => (
                  <div key={batch.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{batch.originalFilename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(batch.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          batch.status === "completed" ? "success" : 
                          batch.status === "processing" ? "default" : 
                          batch.status === "failed" ? "destructive" : "secondary"
                        }
                      >
                        {batch.status}
                      </Badge>
                      <span className="text-sm font-medium">
                        {batch.totalRecords} records
                      </span>
                    </div>
                  </div>
                )) || (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="flex gap-4">
            <Button 
              onClick={() => setCurrentView("upload")} 
              className="flex items-center gap-2"
            >
              <UploadIcon className="h-4 w-4" />
              Process New File
            </Button>
            <Button 
              onClick={() => setCurrentView("single")} 
              variant="outline"
              className="flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Single Lookup
            </Button>
            <Link href="/mastercard-monitor">
              <Button 
                variant="outline"
                className="flex items-center gap-2"
              >
                <Activity className="h-4 w-4" />
                View Mastercard Queue
              </Button>
            </Link>
            <Link href="/batch-jobs">
              <Button 
                variant="outline"
                className="flex items-center gap-2"
              >
                <Package className="h-4 w-4" />
                View All Batches
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {currentView === "upload" && (
        <Card className="mb-8 animate-fade-in-up">
        <CardHeader>
          <CardTitle className="section-header">
            Upload New File
          </CardTitle>
          <CardDescription className="section-subtitle">
            Upload a CSV or Excel file containing payee data for AI classification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="btn-hover-lift"
              >
                <UploadIcon className="mr-2 h-4 w-4" />
                Choose File
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{selectedFile.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {selectedFile && !previewData && isUploading && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing file structure...</span>
              </div>
            )}
            
            {/* Column Selection */}
            {previewData && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select the column containing payee names:</label>
                  <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {previewData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Matching Options */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Matching Options</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-2" />
                          Configure
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <h4 className="font-medium leading-none">Matching Tools</h4>
                            <p className="text-sm text-muted-foreground">
                              Enable or disable matching tools for classification
                            </p>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="finexio-toggle" className="text-sm">
                                Finexio Matching
                              </Label>
                              <Switch
                                id="finexio-toggle"
                                checked={matchingOptions.enableFinexio}
                                onCheckedChange={(checked) =>
                                  setMatchingOptions((prev) => ({ ...prev, enableFinexio: checked }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="mastercard-toggle" className="text-sm">
                                Mastercard Enrichment
                                {matchingOptions.enableGoogleAddressValidation && (
                                  <span className="text-xs text-muted-foreground ml-1">(After Address Validation)</span>
                                )}
                              </Label>
                              <Switch
                                id="mastercard-toggle"
                                checked={matchingOptions.enableMastercard}
                                onCheckedChange={(checked) =>
                                  setMatchingOptions((prev) => ({ ...prev, enableMastercard: checked }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="google-address-toggle" className="text-sm">
                                Google Address Validation
                              </Label>
                              <Switch
                                id="google-address-toggle"
                                checked={matchingOptions.enableGoogleAddressValidation}
                                onCheckedChange={(checked) =>
                                  setMatchingOptions((prev) => ({ ...prev, enableGoogleAddressValidation: checked }))
                                }
                              />
                            </div>
                            {matchingOptions.enableGoogleAddressValidation && (
                              <div className="flex items-center justify-between pl-4">
                                <Label htmlFor="address-norm-toggle" className="text-sm text-muted-foreground">
                                  Enable Address Normalization
                                </Label>
                                <Switch
                                  id="address-norm-toggle"
                                  checked={matchingOptions.enableAddressNormalization}
                                  onCheckedChange={(checked) =>
                                    setMatchingOptions((prev) => ({ ...prev, enableAddressNormalization: checked }))
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                {/* Address Column Mapping */}
                {matchingOptions.enableGoogleAddressValidation && previewData && (
                  <div className="space-y-2 border-t pt-4">
                    <label className="text-sm font-medium">Map address columns (optional):</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Address</label>
                        <Select 
                          value={addressColumns.address || "_none"} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, address: value === "_none" ? "" : value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select address column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {previewData.headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">City</label>
                        <Select 
                          value={addressColumns.city || "_none"} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, city: value === "_none" ? "" : value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select city column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {previewData.headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">State</label>
                        <Select 
                          value={addressColumns.state || "_none"} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, state: value === "_none" ? "" : value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select state column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {previewData.headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Zip Code</label>
                        <Select 
                          value={addressColumns.zip || "_none"} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, zip: value === "_none" ? "" : value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select zip column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {previewData.headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleProcessFile}
                    disabled={!selectedColumn || processMutation.isPending}
                    className="btn-hover-lift bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    {processMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Process File
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewData(null);
                      setSelectedColumn("");
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Active Jobs */}
      {processingBatches.length > 0 && (
        <Card className="mb-8 border border-orange-200 shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-r from-orange-50 to-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Clock className="h-5 w-5 text-orange-600" />
                <div className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full animate-pulse" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Active Jobs
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {processingBatches.map((batch) => (
                <div key={batch.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium">{batch.originalFilename}</h3>
                      <p className="text-sm text-gray-600">
                        Running for: {formatDuration(batch.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate(batch.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                  <ProgressTracker batch={batch} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Jobs Table */}
      <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Classification History
              </CardTitle>
              <CardDescription className="mt-1">
                {batches && batches.length > 0 
                  ? `${batches.length} batch${batches.length !== 1 ? 'es' : ''} processed`
                  : 'No batches processed yet'
                }
              </CardDescription>
            </div>
            {batches && batches.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completedBatches.length} completed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!batches || batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileSpreadsheet className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No classification history</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Upload a CSV or Excel file above to start classifying payees with AI
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Enrichment</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...completedBatches, ...otherBatches].map((batch) => (
                  <TableRow key={batch.id} className="hover:bg-gray-50 transition-colors animate-fade-in">
                    <TableCell className="font-medium">{batch.originalFilename}</TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>
                      {batch.processedRecords}/{batch.totalRecords}
                    </TableCell>
                    <TableCell>
                      {batch.status === "completed" 
                        ? `${Math.round(batch.accuracy * 100)}%`
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      {batch.status === "completed" && batch.mastercardEnrichmentStatus && (
                        <div className="flex items-center gap-2">
                          {batch.mastercardEnrichmentStatus === "pending" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </span>
                          )}
                          {batch.mastercardEnrichmentStatus === "in_progress" && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 w-20">
                                <div 
                                  className="bg-blue-500 h-2 rounded-full transition-all"
                                  style={{ width: `${batch.mastercardEnrichmentProgress || 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-600">
                                {batch.mastercardEnrichmentProgress || 0}%
                              </span>
                            </div>
                          )}
                          {batch.mastercardEnrichmentStatus === "completed" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Enriched
                            </span>
                          )}
                          {batch.mastercardEnrichmentStatus === "failed" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </span>
                          )}
                          {batch.mastercardEnrichmentStatus === "skipped" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                              Skipped
                            </span>
                          )}
                        </div>
                      )}
                      {(!batch.mastercardEnrichmentStatus || batch.status !== "completed") && "-"}
                    </TableCell>
                    <TableCell>
                      {batch.status === "completed" || batch.status === "failed" || batch.status === "cancelled"
                        ? formatDuration(batch.createdAt, batch.completedAt)
                        : formatDuration(batch.createdAt)
                      }
                    </TableCell>
                    <TableCell>
                      {new Date(batch.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {batch.status === "completed" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingBatchId(batch.id)}
                              title="View Results"
                              className="hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(batch.id, batch.originalFilename)}
                              disabled={downloadingBatchId === batch.id}
                              title="Download CSV"
                              className="hover:bg-green-50 hover:text-green-600 transition-all hover:shadow-md active:scale-95"
                            >
                              {downloadingBatchId === batch.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(batch.id)}
                          title="Delete"
                          className="hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}