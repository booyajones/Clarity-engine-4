import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, Download, Loader2, X, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle, Activity, ArrowRight, ClipboardList, Sparkles, Eye, Settings, Brain, Package, Database, TrendingUp, Users, Shield, MapPin, Zap, RefreshCw, BarChart3, Search, CreditCard } from "lucide-react";
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
  mastercardActualEnriched?: number;
}

interface FieldPrediction {
  fieldName: string;
  predictedType: string;
  confidence: number;
  reasoning: string;
  dataPattern: string;
  suggestedMapping?: string;
}

interface PredictionResult {
  predictions: FieldPrediction[];
  overallConfidence: number;
  recommendedActions: string[];
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
  google: {
    validationRate: number;
    totalValidated: number;
    avgConfidence: number;
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
    preview?: any[];
    tempFileName: string;
    addressFields?: Record<string, string>;
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

  const [, forceUpdate] = useState({});

  const { data: batches, isLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
    refetchInterval: (query) => {
      // Only poll when there are active processing or enriching batches
      const hasProcessingBatches = query.state.data?.some(
        batch => batch.status === "processing" || (batch.status as string) === "enriching" || 
        batch.status === "pending" || 
        (!batch.completedAt && batch.status !== "failed" && batch.status !== "cancelled")
      );
      return hasProcessingBatches ? 5000 : false; // Poll every 5 seconds only when processing or enriching
    }
  });

  // Force re-render every second for active batches to update duration display
  useEffect(() => {
    const hasActiveBatches = batches?.some(
      batch => batch.status === "processing" || 
      (batch.status as string) === "enriching" ||
      (!batch.completedAt && batch.status !== "failed" && batch.status !== "cancelled")
    );
    
    if (hasActiveBatches) {
      const interval = setInterval(() => {
        forceUpdate({}); // Force re-render to update duration display
      }, 1000); // Update every second
      
      return () => clearInterval(interval);
    }
  }, [batches]);

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
      
      // Auto-populate address fields from server detection
      if (data.addressFields && Object.keys(data.addressFields).length > 0) {
        setAddressColumns({
          address: data.addressFields.address || "",
          city: data.addressFields.city || "",
          state: data.addressFields.state || "",
          zip: data.addressFields.zip || ""
        });
        
        const mappedFields = Object.entries(data.addressFields)
          .filter(([key, value]) => key !== 'country' && value)
          .map(([key]) => key);
        
        if (mappedFields.length > 0) {
          toast({
            title: "Address Fields Auto-Detected",
            description: `Automatically mapped ${mappedFields.length} address fields for Google validation.`,
          });
        }
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
      matchingOptions: {
        ...matchingOptions,
        addressColumns: matchingOptions.enableGoogleAddressValidation ? addressColumns : undefined
      },
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
      case "enriching":
        return (
          <span className="badge-enhanced status-processing border pulse-gentle">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Enriching
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

  const processingBatches = batches?.filter(b => b.status === "processing" || (b.status as string) === "enriching") || [];
  const completedBatches = batches?.filter(b => b.status === "completed") || [];
  const otherBatches = batches?.filter(b => !["processing", "enriching", "completed"].includes(b.status as string)) || [];

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
                onClick={() => setCurrentView("single")}
                className={`flex items-center gap-2 transition-all ${currentView === "single" ? "shadow-lg" : "hover:shadow-md hover:border-purple-300"}`}
              >
                <Sparkles className="h-4 w-4" />
                Quick Classify
              </Button>
              <Button
                variant={currentView === "keywords" ? "default" : "outline"}
                onClick={() => setCurrentView("keywords")}
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
          {/* Latest File Status - Most prominent card */}
          {batches && batches.length > 0 && (
            <Card className="mb-6 hover:shadow-lg transition-shadow border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  Latest File Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const latestBatch = batches[0];
                  const isEnriching = (latestBatch.status as string) === "enriching" || 
                    (latestBatch.processedRecords === latestBatch.totalRecords && latestBatch.status === "processing");
                  
                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-lg">{latestBatch.originalFilename}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(latestBatch.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge 
                          variant={
                            latestBatch.status === "completed" ? "default" :
                            isEnriching ? "secondary" :
                            latestBatch.status === "processing" ? "outline" :
                            latestBatch.status === "failed" ? "destructive" : "outline"
                          }
                        >
                          {isEnriching ? "Enriching" : latestBatch.status}
                        </Badge>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Classification Progress */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Classification</span>
                            <span className="text-muted-foreground">
                              {latestBatch.processedRecords}/{latestBatch.totalRecords} records
                            </span>
                          </div>
                          <div className="bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(100, (latestBatch.processedRecords / latestBatch.totalRecords) * 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{Math.round((latestBatch.processedRecords / latestBatch.totalRecords) * 100)}% complete</span>
                            {latestBatch.processedRecords === latestBatch.totalRecords && (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            )}
                          </div>
                        </div>
                        
                        {/* Finexio Matching */}
                        {latestBatch.processedRecords === latestBatch.totalRecords && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Finexio Matching</span>
                              <span className="text-muted-foreground">
                                {(latestBatch as any).finexioMatchingStatus === "completed" ? 
                                  `${(latestBatch as any).finexioMatchPercentage || 0}% matched` :
                                  (latestBatch as any).finexioMatchingStatus === "in_progress" ? "Processing..." :
                                  (latestBatch as any).finexioMatchingStatus === "skipped" ? "Skipped" :
                                  "Pending"
                                }
                              </span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className={`${
                                  (latestBatch as any).finexioMatchingStatus === "completed" ? "bg-green-600" :
                                  (latestBatch as any).finexioMatchingStatus === "in_progress" ? "bg-green-400" :
                                  "bg-gray-400"
                                } h-2 rounded-full transition-all`}
                                style={{ width: `${(latestBatch as any).finexioMatchingStatus === "completed" ? 100 : (latestBatch as any).finexioMatchingStatus === "in_progress" ? 50 : 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Google Address Validation */}
                        {latestBatch.processedRecords === latestBatch.totalRecords && (latestBatch as any).googleAddressStatus !== "skipped" && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Google Address Validation</span>
                              <span className="text-muted-foreground">
                                {(latestBatch as any).googleAddressStatus === "completed" ? 
                                  `${(latestBatch as any).googleAddressValidated || 0} validated` :
                                  (latestBatch as any).googleAddressStatus === "in_progress" ?
                                  `${(latestBatch as any).googleAddressProgress || 0}%` :
                                  (latestBatch as any).googleAddressStatus === "skipped" ? "Skipped" :
                                  "Pending"
                                }
                              </span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className={`${
                                  (latestBatch as any).googleAddressStatus === "completed" ? "bg-blue-600" :
                                  (latestBatch as any).googleAddressStatus === "in_progress" ? "bg-blue-400" :
                                  "bg-gray-400"
                                } h-2 rounded-full transition-all`}
                                style={{ 
                                  width: `${
                                    (latestBatch as any).googleAddressStatus === "completed" ? 100 :
                                    (latestBatch as any).googleAddressProgress || 0
                                  }%` 
                                }}
                              />
                            </div>
                            {(latestBatch as any).googleAddressStatus === "completed" && (
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Complete</span>
                                <MapPin className="h-3 w-3 text-blue-600" />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Mastercard Enrichment */}
                        {latestBatch.processedRecords === latestBatch.totalRecords && latestBatch.mastercardEnrichmentStatus !== "skipped" && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Mastercard Enrichment</span>
                              <span className="text-muted-foreground">
                                {latestBatch.mastercardEnrichmentStatus === "completed" ? 
                                  `${latestBatch.mastercardActualEnriched || 0} enriched` :
                                  latestBatch.mastercardEnrichmentStatus === "in_progress" ?
                                  `${latestBatch.mastercardEnrichmentProgress || 0}%` :
                                  latestBatch.mastercardEnrichmentStatus === "skipped" ? "Skipped" :
                                  "Pending"
                                }
                              </span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className={`${
                                  latestBatch.mastercardEnrichmentStatus === "completed" ? "bg-purple-600" :
                                  latestBatch.mastercardEnrichmentStatus === "in_progress" ? "bg-purple-400" :
                                  "bg-gray-400"
                                } h-2 rounded-full transition-all`}
                                style={{ 
                                  width: `${
                                    latestBatch.mastercardEnrichmentStatus === "completed" ? 100 :
                                    latestBatch.mastercardEnrichmentProgress || 0
                                  }%` 
                                }}
                              />
                            </div>
                            {latestBatch.mastercardEnrichmentStatus === "completed" && (
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Complete</span>
                                <CreditCard className="h-3 w-3 text-purple-600" />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Akkio Predictions */}
                        {latestBatch.processedRecords === latestBatch.totalRecords && (latestBatch as any).akkioPredictionStatus !== "skipped" && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Akkio ML Predictions</span>
                              <span className="text-muted-foreground">
                                {(latestBatch as any).akkioPredictionStatus === "completed" ? 
                                  `${(latestBatch as any).akkioPredictionSuccessful || 0} predicted` :
                                  (latestBatch as any).akkioPredictionStatus === "in_progress" ?
                                  `${(latestBatch as any).akkioPredictionProgress || 0}%` :
                                  (latestBatch as any).akkioPredictionStatus === "skipped" ? "Skipped" :
                                  "Pending"
                                }
                              </span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className={`${
                                  (latestBatch as any).akkioPredictionStatus === "completed" ? "bg-orange-600" :
                                  (latestBatch as any).akkioPredictionStatus === "in_progress" ? "bg-orange-400" :
                                  "bg-gray-400"
                                } h-2 rounded-full transition-all`}
                                style={{ 
                                  width: `${
                                    (latestBatch as any).akkioPredictionStatus === "completed" ? 100 :
                                    (latestBatch as any).akkioPredictionProgress || 0
                                  }%` 
                                }}
                              />
                            </div>
                            {(latestBatch as any).akkioPredictionStatus === "completed" && (
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Complete</span>
                                <Brain className="h-3 w-3 text-orange-600" />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Overall Status Message */}
                        <div className="pt-2 border-t">
                          <p className="text-sm text-muted-foreground">
                            {latestBatch.progressMessage || 
                              (isEnriching ? "Enriching data with external sources..." : "Processing payee data...")
                            }
                          </p>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewBatch(latestBatch.id)}
                          className="flex-1"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View Results
                        </Button>
                        {latestBatch.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadBatch(latestBatch.id)}
                            className="flex-1"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
          
          {/* System Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Jobs Today */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  Today's Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const todayJobs = batches?.filter(b => new Date(b.createdAt) >= today) || [];
                    return todayJobs.length;
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Jobs submitted
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const todayJobs = batches?.filter(b => new Date(b.createdAt) >= today) || [];
                      const totalRecords = todayJobs.reduce((sum, b) => sum + b.totalRecords, 0);
                      return `${totalRecords.toLocaleString()} records`;
                    })()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Average Job Size */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4 text-purple-600" />
                  Avg Job Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    if (!completedBatches?.length) return "0";
                    const avg = completedBatches.reduce((sum, b) => sum + b.totalRecords, 0) / completedBatches.length;
                    return Math.round(avg).toLocaleString();
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Records per job
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {completedBatches?.length || 0} total jobs
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Job Success Rate */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    const successfulJobs = completedBatches?.filter(b => b.status === 'completed').length || 0;
                    const totalJobs = batches?.length || 0;
                    if (totalJobs === 0) return "N/A";
                    return `${Math.round((successfulJobs / totalJobs) * 100)}%`;
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Jobs completed
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {completedBatches?.length || 0} complete
                  </Badge>
                  {(() => {
                    const failedJobs = batches?.filter(b => b.status === 'failed').length || 0;
                    if (failedJobs > 0) {
                      return <Badge variant="destructive" className="text-xs">{failedJobs} failed</Badge>;
                    }
                    return null;
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Processing Queue */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-orange-600" />
                  Queue Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {processingBatches.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Jobs processing
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {processingBatches.length > 0 ? (
                    <>
                      <Badge variant="default" className="text-xs animate-pulse">
                        Active
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {processingBatches.map(b => 
                          (b.status as string) === "enriching" ? "Enriching..." : `${b.totalRecords - b.processedRecords} pending`
                        ).join(", ")}
                      </span>
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Idle
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Job Performance Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Job Breakdown */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  Job Performance (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const recentJobs = batches?.filter(b => new Date(b.createdAt) >= sevenDaysAgo) || [];
                    const avgProcessingTime = recentJobs.filter(b => b.completedAt).reduce((sum, b) => {
                      const duration = new Date(b.completedAt!).getTime() - new Date(b.createdAt).getTime();
                      return sum + duration;
                    }, 0) / (recentJobs.filter(b => b.completedAt).length || 1);
                    const avgMinutes = Math.round(avgProcessingTime / 60000);
                    
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Jobs Processed</span>
                          <span className="text-sm font-medium">{recentJobs.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Total Records</span>
                          <span className="text-sm font-medium">
                            {recentJobs.reduce((sum, b) => sum + b.totalRecords, 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Avg Processing Time</span>
                          <span className="text-sm font-medium">{avgMinutes} min</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Avg Exclusion Rate</span>
                          <span className="text-sm font-medium">
                            {(() => {
                              const totalRecords = recentJobs.reduce((sum, b) => sum + b.totalRecords, 0);
                              const totalSkipped = recentJobs.reduce((sum, b) => sum + (b.skippedRecords || 0), 0);
                              return totalRecords > 0 ? `${Math.round((totalSkipped / totalRecords) * 100)}%` : "0%";
                            })()}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Current Activity */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-600" />
                  Current Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {processingBatches.length > 0 ? (
                    processingBatches.slice(0, 3).map(batch => (
                      <div key={batch.id} className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium truncate">{batch.originalFilename}</p>
                          <div className="space-y-1 mt-1">
                            {batch.status === "processing" && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Classification:</span>
                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${(batch.processedRecords / batch.totalRecords) * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round((batch.processedRecords / batch.totalRecords) * 100)}%
                                </span>
                              </div>
                            )}
                            {(batch.status as string) === "enriching" && (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Classification:</span>
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  <span className="text-xs text-green-600">Complete</span>
                                </div>
                                {batch.mastercardEnrichmentStatus === "in_progress" && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Mastercard:</span>
                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                      <div 
                                        className="bg-orange-600 h-2 rounded-full transition-all"
                                        style={{ width: `${batch.mastercardEnrichmentProgress || 0}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {batch.mastercardEnrichmentProgress || 0}%
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-2">No active jobs</p>
                      <Badge variant="secondary">System Ready</Badge>
                    </div>
                  )}
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
                          batch.status === "completed" ? "default" : 
                          (batch.status as string) === "enriching" ? "secondary" :
                          batch.status === "processing" ? "outline" : 
                          batch.status === "failed" ? "destructive" : "outline"
                        }
                        className={(batch.status as string) === "enriching" ? "animate-pulse" : ""}
                      >
                        {(batch.status as string) === "enriching" ? "Enriching" : batch.status}
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
                
                {/* Enrichment Options */}
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                  <div className="text-sm font-medium mb-2">Enrichment Services</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-green-600" />
                        <Label htmlFor="finexio-toggle" className="text-sm cursor-pointer">
                          Finexio Network Matching
                        </Label>
                      </div>
                      <Switch
                        id="finexio-toggle"
                        checked={matchingOptions.enableFinexio}
                        onCheckedChange={(checked) =>
                          setMatchingOptions((prev) => ({ ...prev, enableFinexio: checked }))
                        }
                        className="data-[state=checked]:bg-green-600"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <Label htmlFor="google-address-toggle" className="text-sm cursor-pointer">
                          Google Address Validation
                        </Label>
                      </div>
                      <Switch
                        id="google-address-toggle"
                        checked={matchingOptions.enableGoogleAddressValidation}
                        onCheckedChange={(checked) =>
                          setMatchingOptions((prev) => ({ ...prev, enableGoogleAddressValidation: checked }))
                        }
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-orange-600" />
                        <Label htmlFor="mastercard-toggle" className="text-sm cursor-pointer">
                          Mastercard Merchant Data
                          {matchingOptions.enableGoogleAddressValidation && (
                            <span className="text-xs text-muted-foreground ml-1">(Enhanced)</span>
                          )}
                        </Label>
                      </div>
                      <Switch
                        id="mastercard-toggle"
                        checked={matchingOptions.enableMastercard}
                        onCheckedChange={(checked) =>
                          setMatchingOptions((prev) => ({ ...prev, enableMastercard: checked }))
                        }
                        className="data-[state=checked]:bg-orange-600"
                      />
                    </div>
                    {matchingOptions.enableGoogleAddressValidation && (
                      <div className="flex items-center justify-between pl-6 opacity-90">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3 w-3 text-purple-600" />
                          <Label htmlFor="address-norm-toggle" className="text-xs cursor-pointer">
                            Smart Address Enhancement
                          </Label>
                        </div>
                        <Switch
                          id="address-norm-toggle"
                          checked={matchingOptions.enableAddressNormalization}
                          onCheckedChange={(checked) =>
                            setMatchingOptions((prev) => ({ ...prev, enableAddressNormalization: checked }))
                          }
                          className="data-[state=checked]:bg-purple-600 scale-90"
                        />
                      </div>
                    )}
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
                  <TableHead>Finexio Match</TableHead>
                  <TableHead>Mastercard Enriched</TableHead>
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
                      <div className="space-y-1">
                        <div className="text-sm">
                          Classification: {batch.processedRecords}/{batch.totalRecords}
                        </div>
                        {(batch.status as string) === "enriching" && (
                          <div className="text-xs text-muted-foreground">
                            Enriching data...
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {batch.status === "completed" 
                        ? `${Math.round(batch.accuracy * 100)}%`
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      {batch.status === "completed" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {(batch as any).finexioMatchPercentage !== undefined ? `${(batch as any).finexioMatchPercentage}%` : "0%"}
                        </span>
                      ) : "-"}
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
                              {batch.mastercardActualEnriched || 0} enriched / {batch.mastercardEnrichmentTotal || batch.processedRecords} processed
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
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">
                          {batch.status === "completed" || batch.status === "failed" || batch.status === "cancelled"
                            ? formatDuration(batch.createdAt, batch.completedAt)
                            : formatDuration(batch.createdAt)
                          }
                        </span>
                        {batch.mastercardEnrichmentCompletedAt && batch.completedAt && (
                          <span className="text-xs text-gray-500">
                            Classification: {formatDuration(batch.createdAt, batch.completedAt)} | 
                            MC: {formatDuration(batch.mastercardEnrichmentStartedAt || batch.completedAt, batch.mastercardEnrichmentCompletedAt)}
                          </span>
                        )}
                      </div>
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