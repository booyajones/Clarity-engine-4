import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import { UploadBatch } from "@/lib/types";

export default function Downloads() {
  const { data: batches = [], isLoading } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
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
      />

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
                  <div>
                    <div className="font-medium">{batch.originalFilename}</div>
                    <div className="text-sm text-gray-500">
                      {batch.processedRecords} records processed • {Math.round((batch.accuracy || 0) * 100)}% accuracy
                    </div>
                    <div className="text-xs text-gray-400">
                      Completed on {new Date(batch.completedAt || batch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => handleDownload(batch.id, batch.originalFilename)}
                    size="sm"
                  >
                    Download CSV
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}