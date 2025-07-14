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
  const progress = batch.totalRecords > 0 
    ? (batch.processedRecords / batch.totalRecords) * 100 
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{batch.currentStep || "Processing..."}</span>
        <span className="font-medium">{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      {batch.progressMessage && (
        <p className="text-sm text-gray-600">{batch.progressMessage}</p>
      )}
    </div>
  );
}