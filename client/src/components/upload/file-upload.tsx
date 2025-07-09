import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface FileUploadProps {
  onUploadSuccess?: (result: any) => void;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
}

export default function FileUpload({ 
  onUploadSuccess, 
  accept = ".csv,.xlsx,.xls",
  maxSize = 10 * 1024 * 1024, // 10MB
  disabled = false 
}: FileUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(new Error("Invalid response format"));
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });
    },
    onSuccess: (result) => {
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "File uploaded successfully",
        description: "Your file is being processed. You'll receive a notification when it's complete.",
      });
      onUploadSuccess?.(result);
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again or contact support if the problem persists.",
        variant: "destructive",
      });
    },
  });

  const validateFile = (file: File): string | null => {
    // Check file type
    const allowedExtensions = accept.split(",").map(ext => ext.trim().toLowerCase());
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return `Invalid file type. Allowed types: ${allowedExtensions.join(", ")}`;
    }

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }

    return null;
  };

  const handleFileUpload = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast({
        title: "Invalid file",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploadMutation.isPending) return;

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

    if (disabled || uploadMutation.isPending) return;

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

  const handleChooseFile = () => {
    if (disabled || uploadMutation.isPending) return;
    fileInputRef.current?.click();
  };

  const isUploading = uploadMutation.isPending;

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive && !disabled && !isUploading
            ? "border-primary-500 bg-primary-50" 
            : disabled || isUploading
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : "border-gray-300 hover:border-primary-400 hover:bg-primary-50 cursor-pointer"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleChooseFile}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />
        
        <div className="w-16 h-16 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
          {isUploading ? (
            <i className="fas fa-spinner fa-spin text-gray-600 text-2xl"></i>
          ) : (
            <i className="fas fa-cloud-upload-alt text-gray-600 text-2xl"></i>
          )}
        </div>
        
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isUploading ? "Uploading..." : "Drop your file here"}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          or click to browse for {accept.replace(/\./g, "").toUpperCase()} files
        </p>
        
        {isUploading ? (
          <div className="max-w-xs mx-auto">
            <Progress value={uploadProgress} className="h-2 mb-2" />
            <p className="text-xs text-gray-500">{Math.round(uploadProgress)}% uploaded</p>
          </div>
        ) : (
          <Button 
            className="bg-primary-500 hover:bg-primary-600 text-white"
            disabled={disabled}
          >
            <i className="fas fa-folder-open mr-2"></i>
            Choose File
          </Button>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p><strong>Supported formats:</strong> {accept.replace(/\./g, "").toUpperCase()}</p>
        <p><strong>Maximum file size:</strong> {Math.round(maxSize / (1024 * 1024))}MB</p>
        <p><strong>Required columns:</strong> At least one column containing payee names</p>
      </div>
    </div>
  );
}
