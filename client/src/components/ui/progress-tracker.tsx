import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { UploadBatch } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Trash2, StopCircle } from "lucide-react";

interface ProgressTrackerProps {
  batch: UploadBatch;
  onCancel?: () => void;
  onDelete?: () => void;
}

export default function ProgressTracker({ batch, onCancel, onDelete }: ProgressTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const progressPercentage = batch.totalRecords > 0 
    ? Math.round((batch.processedRecords / batch.totalRecords) * 100)
    : 0;

  const cancelMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const response = await fetch(`/api/upload/batches/${batchId}/cancel`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Failed to cancel job");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Job cancelled",
        description: "Processing has been stopped.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
    },
    onError: () => {
      toast({
        title: "Cancel failed",
        description: "Could not stop the job. Please try again.",
        variant: "destructive",
      });
    },
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
        description: "Job and all associated data have been removed.",
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "text-blue-600";
      case "completed":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      case "cancelled":
        return "text-orange-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "processing":
        return "Processing...";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return "Pending";
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium">{batch.originalFilename}</div>
          <div className={`text-sm ${getStatusColor(batch.status)}`}>
            {getStatusText(batch.status)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-semibold">{progressPercentage}%</div>
            <div className="text-xs text-gray-500">
              {batch.processedRecords} / {batch.totalRecords}
            </div>
          </div>
          <div className="flex gap-1">
            {batch.status === "processing" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelMutation.mutate(batch.id);
                  if (onCancel) onCancel();
                }}
                disabled={cancelMutation.isPending}
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                deleteMutation.mutate(batch.id);
                if (onDelete) onDelete();
              }}
              disabled={deleteMutation.isPending}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {batch.status === "processing" && (
        <div className="space-y-2">
          <Progress value={progressPercentage} className="h-2" />
          <div className="text-sm text-gray-600">
            {batch.progressMessage || batch.currentStep || "Processing payees..."}
          </div>
          {batch.skippedRecords > 0 && (
            <div className="text-xs text-orange-600">
              {batch.skippedRecords} payees skipped (below 95% confidence)
            </div>
          )}
        </div>
      )}

      {batch.status === "completed" && (
        <div className="space-y-2">
          <Progress value={100} className="h-2" />
          <div className="text-sm text-green-600">
            Successfully processed {batch.processedRecords} payees
          </div>
          {batch.skippedRecords > 0 && (
            <div className="text-xs text-orange-600">
              {batch.skippedRecords} payees skipped (below 95% confidence)
            </div>
          )}
          <div className="text-xs text-gray-500">
            Average accuracy: {Math.round((batch.accuracy || 0) * 100)}%
          </div>
        </div>
      )}

      {batch.status === "failed" && (
        <div className="space-y-2">
          <Progress value={progressPercentage} className="h-2" />
          <div className="text-sm text-red-600">
            Processing failed
          </div>
        </div>
      )}
    </div>
  );
}