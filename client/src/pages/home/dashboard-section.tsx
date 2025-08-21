import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Sparkles, ClipboardList } from "lucide-react";
import { Link } from "wouter";

interface UploadBatch {
  id: number;
  originalFilename: string;
}

interface DashboardStats {
  supplierCache: {
    total: number;
    lastUpdated: string;
    syncStatus: string;
  };
  classification: {
    totalProcessed: number;
    accuracy: number;
    pendingCount: number;
  };
}

interface Props {
  onNavigate: (view: "dashboard" | "upload" | "keywords" | "single") => void;
  onViewBatch: (id: number) => void;
}

export function DashboardSection({ onNavigate, onViewBatch }: Props) {
  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: batches } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button onClick={() => onNavigate("upload")} className="flex items-center gap-2">
            <UploadIcon className="h-4 w-4" />
            Process New File
          </Button>
          <Button variant="outline" onClick={() => onNavigate("single")} className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Single Lookup
          </Button>
          <Button variant="outline" onClick={() => onNavigate("keywords")} className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Keyword Management
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {batches && batches.length > 0 ? (
            batches.slice(0, 5).map((batch) => (
              <div key={batch.id} className="flex justify-between py-2 border-b last:border-b-0">
                <span>{batch.originalFilename}</span>
                <Button size="sm" variant="ghost" onClick={() => onViewBatch(batch.id)}>
                  View
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No uploads yet</p>
          )}
        </CardContent>
      </Card>

      {dashboardStats && (
        <Card>
          <CardHeader>
            <CardTitle>System Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Total Records Processed: {dashboardStats.classification.totalProcessed}</p>
            <p className="text-sm">Accuracy: {dashboardStats.classification.accuracy}%</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DashboardSection;
