export interface ClassificationStats {
  totalPayees: number;
  accuracy: number;
  pendingReview: number;
  filesProcessed: number;
}

export interface UploadBatch {
  id: number;
  filename: string;
  originalFilename: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  skippedRecords: number;
  currentStep: string | null;
  progressMessage: string | null;
  accuracy: number | null;
  userId: number;
  createdAt: string;
  completedAt: string | null;
}

export interface PayeeClassification {
  id: number;
  batchId: number;
  originalName: string;
  cleanedName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  payeeType: "Individual" | "Business" | "Government";
  confidence: number;
  sicCode: string | null;
  sicDescription: string | null;
  status: "auto-classified" | "user-confirmed" | "user-corrected" | "pending-review";
  reviewedBy: number | null;
  originalData: any;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  description: string;
  details: string;
  time: string;
  type: "success" | "warning" | "info" | "error";
}

export interface BusinessCategory {
  name: string;
  percentage: number;
  color: string;
}
