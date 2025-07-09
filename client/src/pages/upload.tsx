import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { UploadBatch } from "@/lib/types";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
      setFilePreview(null);
      setSelectedColumn("");
      toast({
        title: "File uploaded successfully",
        description: "Your file is being processed. You'll receive a notification when it's complete.",
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

    previewMutation.mutate(file);
  };

  const handleProcessFile = () => {
    if (!filePreview || !selectedColumn) return;
    
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
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Upload Section */}
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

          {/* Upload History */}
          {batches.length > 0 && (
            <div className="border rounded-lg p-6">
              <h2 className="text-lg font-medium mb-4">Recent Files</h2>
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{batch.originalFilename}</div>
                      <div className="text-sm text-gray-500">
                        {batch.status === "completed" && `${batch.processedRecords} records`}
                        {batch.status === "processing" && "Processing..."}
                        {batch.status === "failed" && "Failed"}
                      </div>
                    </div>
                    
                    {batch.status === "completed" && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Export</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
