import { Progress } from "@/components/ui/progress";
import { UploadBatch } from "@/lib/types";

interface ProgressTrackerProps {
  batch: UploadBatch;
}

export default function ProgressTracker({ batch }: ProgressTrackerProps) {
  const progressPercentage = batch.totalRecords > 0 
    ? Math.round((batch.processedRecords / batch.totalRecords) * 100)
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "text-blue-600";
      case "completed":
        return "text-green-600";
      case "failed":
        return "text-red-600";
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
      default:
        return "Pending";
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{batch.originalFilename}</div>
          <div className={`text-sm ${getStatusColor(batch.status)}`}>
            {getStatusText(batch.status)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{progressPercentage}%</div>
          <div className="text-xs text-gray-500">
            {batch.processedRecords} / {batch.totalRecords}
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