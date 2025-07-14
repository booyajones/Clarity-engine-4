import { Progress } from "@/components/ui/progress";

interface UploadBatch {
  id: number;
  status: string;
  totalRecords: number;
  processedRecords: number;
  currentStep?: string;
  progressMessage?: string;
}

interface ProgressTrackerProps {
  batch: UploadBatch;
}

export function ProgressTracker({ batch }: ProgressTrackerProps) {
  // For streaming processing, we don't know the total upfront
  const isStreaming = batch.totalRecords === 0 && batch.processedRecords > 0;
  const progress = batch.totalRecords > 0 
    ? (batch.processedRecords / batch.totalRecords) * 100 
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{batch.currentStep || "Processing..."}</span>
        {!isStreaming && (
          <span className="font-medium">{Math.round(progress)}%</span>
        )}
      </div>
      {!isStreaming ? (
        <Progress value={progress} className="h-2" />
      ) : (
        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
        </div>
      )}
      {batch.progressMessage && (
        <p className="text-sm text-gray-600">{batch.progressMessage}</p>
      )}
    </div>
  );
}