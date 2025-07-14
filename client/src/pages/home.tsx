import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, Download, Loader2, X, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle, Activity, ArrowRight, ClipboardList } from "lucide-react";
import { useState, useRef } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const { data: batches, isLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
    refetchInterval: 1000, // Poll every second
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
    mutationFn: async ({ tempFileName, originalFilename, payeeColumn }: {
      tempFileName: string;
      originalFilename: string;
      payeeColumn: string;
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
          <div className="flex items-center gap-1.5 text-success-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Completed</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex items-center gap-1.5 text-primary-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Processing</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5 text-error-600">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Failed</span>
          </div>
        );
      case "cancelled":
        return (
          <div className="flex items-center gap-1.5 text-gray-600">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Cancelled</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Pending</span>
          </div>
        );
    }
  };

  const processingBatches = batches?.filter(b => b.status === "processing") || [];
  const completedBatches = batches?.filter(b => b.status === "completed") || [];
  const otherBatches = batches?.filter(b => !["processing", "completed"].includes(b.status)) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50">
      <div className="flex-1 p-8 max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-primary-500 text-white rounded-2xl shadow-lg">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
              Clarity
            </h1>
          </div>
          <p className="text-lg text-gray-600">Transform your payee data with AI-powered intelligence</p>
        </div>

      {/* Upload Section */}
      <Card className="mb-8 shadow-xl border-0 overflow-hidden">
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-1"></div>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold flex items-center gap-2">
            <UploadIcon className="h-6 w-6 text-primary-600" />
            Upload New File
          </CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or Excel file containing payee data. Our AI will automatically classify each payee as Individual, Business, or Government.
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
                className="border-2 border-primary-400 hover:bg-primary-50 transition-all duration-200"
              >
                <UploadIcon className="mr-2 h-5 w-5 text-primary-600" />
                <span className="text-primary-700 font-medium">Choose File</span>
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-lg border border-primary-200">
                  <FileSpreadsheet className="h-4 w-4 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-primary-100"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            {selectedFile && !previewData && (
              <Button 
                onClick={handleUpload} 
                disabled={isUploading}
                className="bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-lg transition-all duration-200"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing file...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Next: Select Column
                  </>
                )}
              </Button>
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
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleProcessFile}
                    disabled={!selectedColumn || processMutation.isPending}
                    className="bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-emerald-700 text-white shadow-lg transition-all duration-200"
                  >
                    {processMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
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
        <Card className="mb-8 shadow-xl border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-1"></div>
          <CardHeader>
            <CardTitle className="text-2xl font-semibold flex items-center gap-2">
              <Activity className="h-6 w-6 text-orange-600" />
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
                      variant="destructive"
                      onClick={() => cancelMutation.mutate(batch.id)}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md"
                    >
                      <X className="h-3 w-3 mr-1" />
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
        <Card className="shadow-xl border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-1"></div>
          <CardHeader>
            <CardTitle className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-600" />
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.location.href = `/api/classifications/export/${batch.id}`}
                            className="border-success-400 hover:bg-success-50 text-success-600"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(batch.id)}
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