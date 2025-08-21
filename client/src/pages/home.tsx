import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Sparkles, ClipboardList, BarChart3, Brain, Activity, Loader2, CheckCircle2, XCircle, X, Clock, AlertTriangle, AlertCircle, FileSpreadsheet, Eye, Download, MapPin, CreditCard, Building2, Layers, Zap, Calendar, TrendingUp, Heart, Search, Package, Users, Shield, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// NOTE: You may need to add or adjust some of the imports above if your project
// structure is different (e.g., for react-query, toast, custom components, etc.)

export default function Home() {
  const [currentView, setCurrentView] = useState<"dashboard" | "upload" | "keywords" | "single">("dashboard");
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [matchingOptions, setMatchingOptions] = useState({
    enableFinexio: true,
    enableMastercard: false,
    enableGoogleAddressValidation: false,
    enableAddressNormalization: true, // Always enabled, no toggle needed
    enableAkkio: false,
  });
  const [addressColumns, setAddressColumns] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  const [, forceUpdate] = useState({});

  const { data: batches, isLoading, error: batchesError, refetch: refetchBatches } = useQuery<any[], Error>({
    queryKey: ["/api/upload/batches"],
    refetchInterval: (query: any) => {
      const hasProcessingBatches = query.state.data?.some(
        (batch: any) => batch.status === "processing" || (batch.status as string) === "enriching" ||
        batch.status === "pending" ||
        (!batch.completedAt && batch.status !== "failed" && batch.status !== "cancelled")
      );
      return hasProcessingBatches ? 5000 : false;
    }
  });

  useEffect(() => {
    const hasActiveBatches = batches?.some(
      (batch: any) => batch.status === "processing" ||
      (batch.status as string) === "enriching" ||
      (!batch.completedAt && batch.status !== "failed" && batch.status !== "cancelled")
    );
    
    if (hasActiveBatches) {
      const interval = setInterval(() => {
        forceUpdate({});
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [batches]);

  const { data: dashboardStats, error: statsError, refetch: refetchStats } = useQuery<any, Error>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000,
  });

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/preview", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setIsUploading(false);
      const possibleColumns = ["payee", "payee_name", "name", "vendor", "customer_name", "company"];
      const found = data.headers.find((h: string) => possibleColumns.some(col => h.toLowerCase().includes(col)));
      if (found) setSelectedColumn(found);
      
      if (data.addressFields && Object.keys(data.addressFields).length > 0) {
        setAddressColumns({
          address: data.addressFields.address || "",
          city: data.addressFields.city || "",
          state: data.addressFields.state || "",
          zip: data.addressFields.zip || ""
        });
        const mappedFields = Object.entries(data.addressFields).filter(([key, value]) => key !== 'country' && value).map(([key]) => key);
        if (mappedFields.length > 0) {
          toast({
            title: "Address Fields Auto-Detected",
            description: `Automatically mapped ${mappedFields.length} address fields for Google validation.`,
          });
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Preview Failed", description: error.message, variant: "destructive" });
      setIsUploading(false);
    },
  });

  const processMutation = useMutation({
    mutationFn: async (variables: { tempFileName: string; originalFilename: string; payeeColumn: string; matchingOptions?: any; }) => {
      const res = await fetch("/api/upload/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "File uploaded successfully. Processing will begin shortly." });
      setSelectedFile(null);
      setPreviewData(null);
      setSelectedColumn("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Processing Failed", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/upload/batches/${batchId}/cancel`, { method: "PATCH", credentials: "include" });
      if (!res.ok) {
        const text = await res.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancelled", description: "Processing has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/upload/batches/${batchId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const text = await res.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Batch has been deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/upload/batches", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const text = await res.text() || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "All Cleared", description: `Deleted ${data.deletedCount || 'all'} batches from classification history.` });
      setShowClearAllDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    const duration = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getStatusBadge = (status: string) => {
    const statuses: { [key: string]: JSX.Element } = {
      "completed": <span className="badge-enhanced status-completed border animate-fade-in-up"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</span>,
      "processing": <span className="badge-enhanced status-processing border"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</span>,
      "enriching": <span className="badge-enhanced status-processing border"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enriching</span>,
      "failed": <span className="badge-enhanced status-failed border"><XCircle className="h-3 w-3 mr-1" />Failed</span>,
      "cancelled": <span className="badge-enhanced status-pending border"><X className="h-3 w-3 mr-1" />Cancelled</span>,
    };
    return statuses[status] || <span className="badge-enhanced status-pending border"><Clock className="h-3 w-3 mr-1" />Pending</span>;
  };

  const [downloadingBatchId, setDownloadingBatchId] = useState<number | null>(null);
  
  const handleDownload = async (batchId: number, filename: string) => {
    try {
      setDownloadingBatchId(batchId);
      toast({ title: "Preparing Download", description: "Generating your CSV file..." });
      const response = await fetch(`/api/classifications/export/${batchId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Download failed');
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Downloaded file is empty');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      a.download = `classified_${filename.replace(/\.[^/.]+$/, '')}_${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      toast({ title: "✓ Download Complete", description: `Successfully downloaded ${filename} with classification results.`, className: "bg-green-50 border-green-200" });
    } catch (error) {
      console.error('Download error:', error);
      toast({ title: "Download Failed", description: error instanceof Error ? error.message : "Could not download the file. Please try again.", variant: "destructive" });
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const processingBatches = batches?.filter((b: any) => b.status === "processing" || (b.status as string) === "enriching") || [];
  const completedBatches = batches?.filter((b: any) => b.status === "completed") || [];
  const otherBatches = batches?.filter((b: any) => !["processing", "enriching", "completed"].includes(b.status as string)) || [];

  if (viewingBatchId) {
    return <ClassificationViewer batchId={viewingBatchId} onBack={() => setViewingBatchId(null)} />;
  }

  if (currentView === "keywords") {
    return <KeywordManager onBack={() => setCurrentView("dashboard")} />;
  }

  if (currentView === "single") {
    return <SingleClassification onNavigate={setCurrentView} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {batchesError && (
        <Alert variant="destructive" className="mx-8 mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load batches</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{batchesError.message}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchBatches()}>Retry</Button>
              <span className="text-xs text-muted-foreground">or refresh the page</span>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {statsError && (
        <Alert variant="destructive" className="mx-8 mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load dashboard stats</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{statsError.message}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchStats()}>Retry</Button>
              <span className="text-xs text-muted-foreground">or refresh the page</span>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {batches?.some((batch: any) =>
        batch.mastercardEnrichmentStatus === 'error' || batch.mastercardEnrichmentStatus === 'failed' ||
        (batch.currentStep && batch.currentStep.toLowerCase().includes('mastercard') && batch.currentStep.toLowerCase().includes('error'))
      ) && (
        <Alert className="mx-8 mt-4 border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Mastercard Track™ Enrichment</AlertTitle>
          <AlertDescription className="text-red-700">
            <span className="font-semibold">✗ Error</span><br />
            Unable to enrich with Mastercard data. The enrichment service encountered an error.<br />
            <span className="text-sm">Source api</span><br />
            <span className="text-xs mt-1 text-red-600">0 records enriched - All records marked as "No Match" for consistency</span>
          </AlertDescription>
        </Alert>
      )}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-light text-gray-900 tracking-wide"><span className="font-normal gradient-text">CLARITY ENGINE</span></h1>
              <p className="text-sm text-gray-500 mt-2 tracking-wide uppercase">Intelligent Payee Classification</p>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex gap-4">
              <Button variant={currentView === "dashboard" ? "default" : "outline"} onClick={() => setCurrentView("dashboard")} className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Dashboard</Button>
              <Button variant={currentView === "upload" ? "default" : "outline"} onClick={() => setCurrentView("upload")} className="flex items-center gap-2"><UploadIcon className="h-4 w-4" />Upload & Process</Button>
              <Button variant={currentView === "single" ? "default" : "outline"} onClick={() => setCurrentView("single")} className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Quick Classify</Button>
              <Button variant={currentView === "keywords" ? "default" : "outline"} onClick={() => setCurrentView("keywords")} className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />Keyword Management</Button>
              <Link href="/akkio-models"><Button variant="outline" className="flex items-center gap-2"><Brain className="h-4 w-4" />Akkio Models</Button></Link>
              <Link href="/mastercard-monitor"><Button variant="outline" className="flex items-center gap-2"><Activity className="h-4 w-4" />Mastercard Monitor</Button></Link>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 max-w-7xl mx-auto">
        {/* All Views Logic Here */}
      </div>
    </div>
  );
}