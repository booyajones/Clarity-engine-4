import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { UploadBatch, ClassificationStats } from "@/lib/types";
import ProgressTracker from "@/components/ui/progress-tracker";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

interface FilePreview {
  filename: string;
  headers: string[];
  tempFileName: string;
}

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");

  const { data: batches = [] } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
    refetchInterval: 1000, // Poll every 1 second for faster progress updates
  });



  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload/preview", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Preview failed");
      }
      
      return response.json();
    },
    onSuccess: (data: FilePreview) => {
      setFilePreview(data);
      // Auto-select likely payee column
      const likelyColumns = ["payee_name", "payee", "name", "vendor", "company"];
      const matchedColumn = data.headers.find(header => 
        likelyColumns.some(col => header.toLowerCase().includes(col.toLowerCase()))
      );
      if (matchedColumn) {
        setSelectedColumn(matchedColumn);
      }
    },
    onError: () => {
      toast({
        title: "Preview failed",
        description: "Please try again or contact support if the problem persists.",
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ tempFileName, originalFilename, payeeColumn }: {
      tempFileName: string;
      originalFilename: string;
      payeeColumn: string;
    }) => {
      const response = await fetch("/api/upload/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempFileName, originalFilename, payeeColumn }),
      });
      
      if (!response.ok) {
        throw new Error("Processing failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
      setFilePreview(null);
      setSelectedColumn("");
      toast({
        title: "File processing started",
        description: `Processing batch ID ${data.batchId}. Watch the progress in the Recent Jobs section below.`,
      });
    },
    onError: () => {
      toast({
        title: "Processing failed",
        description: "Please try again or contact support if the problem persists.",
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    // Validate file type
    const allowedTypes = [".csv", ".xlsx", ".xls"];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    
    if (!allowedTypes.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or Excel file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Uploading file...",
      description: `Processing ${file.name}`,
    });
    previewMutation.mutate(file);
  };

  const handleProcessFile = () => {
    if (!filePreview || !selectedColumn) return;
    
    toast({
      title: "Starting processing...",
      description: `AI classification will begin shortly for ${filePreview.filename}`,
    });
    
    processMutation.mutate({
      tempFileName: filePreview.tempFileName,
      originalFilename: filePreview.filename,
      payeeColumn: selectedColumn,
    });
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <i className="fas fa-check text-success-600"></i>;
      case "processing":
        return <i className="fas fa-clock text-warning-600"></i>;
      case "failed":
        return <i className="fas fa-times text-error-600"></i>;
      default:
        return <i className="fas fa-file text-gray-600"></i>;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-success-100";
      case "processing":
        return "bg-warning-100";
      case "failed":
        return "bg-error-100";
      default:
        return "bg-gray-100";
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Upload Data" subtitle="Upload CSV or Excel files for high-accuracy OpenAI classification (95%+ confidence only)" />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">


          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <div className="space-y-6">
              <div className="border rounded-lg p-6">
                <h2 className="text-lg font-medium mb-4">Upload File</h2>
                
                <div
                  className={`border-2 border-dashed rounded p-6 text-center ${
                    dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={!previewMutation.isPending ? handleChooseFile : undefined}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={previewMutation.isPending}
                  />
                  
                  {previewMutation.isPending ? (
                    <p>Analyzing file...</p>
                  ) : (
                    <>
                      <p className="mb-2">Drop CSV or Excel file here</p>
                      <Button variant="outline">Choose File</Button>
                    </>
                  )}
                </div>
              </div>

              {/* Column Selection */}
              {filePreview && (
                <div className="border rounded-lg p-6">
                  <h2 className="text-lg font-medium mb-4">Select Column</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Which column contains the payee names?
                  </p>
                  
                  <div className="space-y-4">
                    <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filePreview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button 
                      onClick={handleProcessFile}
                      disabled={!selectedColumn || processMutation.isPending}
                      className="w-full"
                    >
                      {processMutation.isPending ? "Processing..." : "Process File"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Job Status Section */}
            <div className="space-y-6">
              <div className="border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium">Recent Jobs</h2>
                  <div className="flex gap-2">
                    {batches.some(batch => batch.status === 'cancelled' || batch.status === 'failed') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete all failed/cancelled jobs?')) {
                            const failedBatches = batches.filter(batch => batch.status === 'cancelled' || batch.status === 'failed');
                            Promise.all(failedBatches.map(batch => 
                              fetch(`/api/upload/batches/${batch.id}`, { method: 'DELETE' })
                            )).then(() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
                            });
                          }
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Failed
                      </Button>
                    )}
                    {batches.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete all ${batches.length} jobs? This cannot be undone.`)) {
                            fetch("/api/upload/batches", { method: "DELETE" })
                              .then(res => res.json())
                              .then(() => {
                                queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
                                toast({
                                  title: "All jobs deleted",
                                  description: "All jobs and their data have been removed.",
                                });
                              })
                              .catch(() => {
                                toast({
                                  title: "Delete failed",
                                  description: "Could not delete all jobs. Please try again.",
                                  variant: "destructive",
                                });
                              });
                          }
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>
                </div>
                {batches.length > 0 ? (
                  <div className="space-y-3">
                    {batches.slice(0, 5).map((batch) => (
                      <div key={batch.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium text-sm">{batch.originalFilename}</h3>
                            <Badge variant={
                              batch.status === 'completed' ? 'default' : 
                              batch.status === 'processing' ? 'secondary' : 'destructive'
                            }>
                              {batch.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(batch.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {batch.status === 'processing' && (
                          <ProgressTracker 
                            batch={batch} 
                            onCancel={() => {
                              fetch(`/api/upload/batches/${batch.id}/cancel`, { method: 'PATCH' })
                                .then(() => queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] }));
                            }}
                            onDelete={() => {
                              fetch(`/api/upload/batches/${batch.id}`, { method: 'DELETE' })
                                .then(() => queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] }));
                            }}
                          />
                        )}
                        
                        {batch.status === 'completed' && (
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>Processed: {batch.processedRecords}/{batch.totalRecords}</p>
                            <p>Accuracy: {batch.accuracy ? `${(batch.accuracy * 100).toFixed(1)}%` : 'N/A'}</p>
                            <div className="flex space-x-2 mt-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => window.open(`/api/classifications/export/${batch.id}`, '_blank')}
                              >
                                Download
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this job?')) {
                                    fetch(`/api/upload/batches/${batch.id}`, { method: 'DELETE' })
                                      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] }));
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {(batch.status === 'cancelled' || batch.status === 'failed') && (
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>Status: {batch.status === 'cancelled' ? 'Cancelled by user' : 'Processing failed'}</p>
                            <p>Progress: {batch.processedRecords}/{batch.totalRecords}</p>
                            <div className="flex space-x-2 mt-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this job?')) {
                                    fetch(`/api/upload/batches/${batch.id}`, { method: 'DELETE' })
                                      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] }));
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No jobs yet. Upload a file to get started.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
