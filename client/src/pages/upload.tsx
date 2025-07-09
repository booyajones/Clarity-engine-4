import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { UploadBatch } from "@/lib/types";

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const { data: batches = [] } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
      toast({
        title: "File uploaded successfully",
        description: "Your file is being processed. You'll receive a notification when it's complete.",
      });
    },
    onError: () => {
      toast({
        title: "Upload failed",
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

    uploadMutation.mutate(file);
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
      <Header title="Upload Data" subtitle="Upload CSV or Excel files for payee classification" />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Upload Section */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Upload File</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? "border-primary-500 bg-primary-50" 
                    : uploadMutation.isPending
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-300 hover:border-primary-400 hover:bg-primary-50 cursor-pointer"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={!uploadMutation.isPending ? handleChooseFile : undefined}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploadMutation.isPending}
                />
                
                <div className="w-16 h-16 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  {uploadMutation.isPending ? (
                    <i className="fas fa-spinner fa-spin text-gray-600 text-2xl"></i>
                  ) : (
                    <i className="fas fa-cloud-upload-alt text-gray-600 text-2xl"></i>
                  )}
                </div>
                
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {uploadMutation.isPending ? "Uploading..." : "Drop your file here"}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  or click to browse for CSV, XLSX, or XLS files
                </p>
                
                {!uploadMutation.isPending && (
                  <Button className="bg-primary-500 hover:bg-primary-600 text-white">
                    <i className="fas fa-folder-open mr-2"></i>
                    Choose File
                  </Button>
                )}
              </div>

              <div className="mt-4 text-sm text-gray-500">
                <p><strong>Supported formats:</strong> CSV, XLSX, XLS</p>
                <p><strong>Maximum file size:</strong> 10MB</p>
                <p><strong>Required columns:</strong> At least one column containing payee names</p>
              </div>
            </CardContent>
          </Card>

          {/* Upload History */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Upload History</CardTitle>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-file-upload text-4xl text-gray-300 mb-4"></i>
                  <p className="text-gray-500">No files uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {batches.map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 ${getStatusColor(batch.status)} rounded-lg flex items-center justify-center`}>
                          {getStatusIcon(batch.status)}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{batch.originalFilename}</h4>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span>
                              {batch.status === "completed" 
                                ? `${batch.processedRecords} records processed`
                                : batch.status === "processing"
                                ? `Processing ${batch.processedRecords}/${batch.totalRecords} records`
                                : "Processing failed"
                              }
                            </span>
                            {batch.accuracy && (
                              <span>• {(batch.accuracy * 100).toFixed(1)}% accuracy</span>
                            )}
                            <span>• {new Date(batch.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {batch.status === "processing" && (
                          <div className="w-24">
                            <Progress 
                              value={batch.totalRecords > 0 ? (batch.processedRecords / batch.totalRecords) * 100 : 0} 
                              className="h-2"
                            />
                          </div>
                        )}
                        {batch.status === "completed" && (
                          <>
                            <Button variant="outline" size="sm">
                              <i className="fas fa-eye mr-1"></i>
                              View
                            </Button>
                            <Button variant="outline" size="sm">
                              <i className="fas fa-download mr-1"></i>
                              Export
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
