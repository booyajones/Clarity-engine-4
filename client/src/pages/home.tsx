import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, Download, Loader2, X, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle, Activity, ArrowRight, ClipboardList, Sparkles, Eye, Settings, Brain } from "lucide-react";
import { useState, useRef } from "react";
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
  const [currentView, setCurrentView] = useState<"upload" | "keywords" | "single">("upload");
  const [matchingOptions, setMatchingOptions] = useState({
    enableFinexio: true,
    enableMastercard: true, // Always enabled - cannot be changed
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
      const found = data.headers.find(h => 
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
      addressColumns: matchingOptions.enableGoogleAddressValidation ? addressColumns : undefined,
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <X className="h-3 w-3 mr-1" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </span>
        );
    }
  };

  const handleDownload = async (batchId: number, filename: string) => {
    try {
      const response = await fetch(`/api/classifications/export/${batchId}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `classified_${filename}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Downloaded",
        description: "Classification results downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download the file. Please try again.",
        variant: "destructive",
      });
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
            <div>
              <h1 className="text-4xl font-light text-gray-900 tracking-wide">
                <span className="font-normal">CLARITY ENGINE</span>
              </h1>
              <p className="text-sm text-gray-500 mt-2 tracking-wide uppercase">Intelligent Payee Classification</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-2xl font-light text-gray-900">95%</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Accuracy Target</p>
              </div>
              <div className="h-12 w-px bg-gray-200"></div>
              <div className="text-right">
                <p className="text-2xl font-light text-gray-900">6</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Categories</p>
              </div>
            </div>
          </div>
          
          {/* Navigation */}
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex gap-4">
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
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 max-w-7xl mx-auto">

      {/* Upload Section */}
      <Card className="mb-8 border border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-gray-900">
            Upload New File
          </CardTitle>
          <CardDescription>
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
                            <div className="flex items-center justify-between opacity-70">
                              <Label className="text-sm">
                                Mastercard Enrichment
                              </Label>
                              <span className="text-xs text-muted-foreground">Always Enabled</span>
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
                          value={addressColumns.address} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, address: value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select address column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                          value={addressColumns.city} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, city: value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select city column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                          value={addressColumns.state} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, state: value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select state column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                          value={addressColumns.zip} 
                          onValueChange={(value) => setAddressColumns(prev => ({ ...prev, zip: value }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select zip column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                  >
                    {processMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Process File"
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
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {processingBatches.length > 0 && (
        <Card className="mb-8 border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-900">
              Active Jobs
            </CardTitle>
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
      {batches && batches.length > 0 && (
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-900">
              Classification History
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  <TableRow key={batch.id}>
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
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(batch.id, batch.originalFilename)}
                              title="Download CSV"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(batch.id)}
                          title="Delete"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}