import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import { UploadBatch } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

export default function Downloads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: batches = [], isLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const response = await fetch(`/api/upload/batches/${batchId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete job");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Job deleted",
        description: "Job and all data have been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Could not delete the job. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = completedBatches.map(batch =>
        fetch(`/api/upload/batches/${batch.id}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      toast({
        title: "All downloads cleared",
        description: "All completed jobs have been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: () => {
      toast({
        title: "Clear failed",
        description: "Could not clear all downloads. Please try again.",
        variant: "destructive",
      });
    },
  });

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
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const completedBatches = batches.filter(batch => batch.status === 'completed');

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p>Loading downloads...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Downloads" 
        subtitle="Download completed classification results"
      >
        {completedBatches.length > 0 && (
          <Button
            variant="outline"
            onClick={() => clearAllMutation.mutate()}
            disabled={clearAllMutation.isPending}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        )}
      </Header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {completedBatches.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-4">No completed jobs available for download</div>
              <p className="text-sm text-gray-400">Upload and process files to see download options here</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 mb-6">
                {completedBatches.length} completed job{completedBatches.length !== 1 ? 's' : ''} ready for download
              </div>
              
              {completedBatches.map((batch) => (
                <div key={batch.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{batch.originalFilename}</div>
                    <div className="text-sm text-gray-500">
                      {batch.processedRecords} records processed • {Math.round((batch.accuracy || 0) * 100)}% accuracy
                    </div>
                    <div className="text-xs text-gray-400">
                      Completed on {new Date(batch.completedAt || batch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleDownload(batch.id, batch.originalFilename)}
                      size="sm"
                    >
                      Download CSV
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(batch.id)}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}