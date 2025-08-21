import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload as UploadIcon, X, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadBatch {
  id: number;
  originalFilename: string;
  status: string;
}

interface FieldPrediction {
  fieldName: string;
  predictedType: string;
}

interface PreviewData {
  filename: string;
  headers: string[];
  tempFileName: string;
}

interface Props {
  onViewBatch: (id: number) => void;
}

export function UploadWorkflow({ onViewBatch }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [selectedColumn, setSelectedColumn] = useState("");

  const { data: batches } = useQuery<UploadBatch[]>({ queryKey: ["/api/upload/batches"] });

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to preview file");
      return res.json();
    },
    onSuccess: (data: PreviewData) => {
      setPreviewData(data);
    },
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    }
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error("No preview data");
      const res = await fetch("/api/upload/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tempFileName: previewData.tempFileName,
          nameColumn: selectedColumn,
        }),
      });
      if (!res.ok) throw new Error("Failed to process file");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "File submitted", description: "Processing has started" });
      setSelectedFile(null);
      setPreviewData(null);
      setSelectedColumn("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      previewMutation.mutate(file);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload New File</CardTitle>
          <CardDescription>Select a CSV or Excel file to process</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2">
            <UploadIcon className="h-4 w-4" />
            Choose File
          </Button>
          {selectedFile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{selectedFile.name}</span>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedFile(null); setPreviewData(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {previewData && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select the column containing payee names:</label>
              <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a column" />
                </SelectTrigger>
                <SelectContent>
                  {previewData.headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => processMutation.mutate()} disabled={!selectedColumn || processMutation.isPending}>
                Process File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {batches && batches.length > 0 ? (
            batches.slice(0, 5).map((batch) => (
              <div key={batch.id} className="flex justify-between py-2 border-b last:border-b-0">
                <span>{batch.originalFilename}</span>
                <Button size="sm" variant="ghost" onClick={() => onViewBatch(batch.id)}>
                  {batch.status}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No batches yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UploadWorkflow;
