import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { UploadBatch } from "@/lib/types";

export default function UploadWidget() {
  const { data: batches = [] } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
  });

  const recentFiles = batches.slice(0, 3);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Upload</h3>
        
        {/* Drag & Drop Zone */}
        <Link href="/upload">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 hover:bg-primary-50 transition-colors cursor-pointer">
            <div className="w-12 h-12 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-cloud-upload-alt text-gray-600 text-xl"></i>
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">Drop your CSV file here</p>
            <p className="text-xs text-gray-500 mb-4">or click to browse</p>
            <Button className="bg-primary-500 hover:bg-primary-600 text-white text-sm">
              Choose File
            </Button>
          </div>
        </Link>

        {/* Recent Files */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Recent Files</h4>
          <div className="space-y-3">
            {recentFiles.length === 0 ? (
              <p className="text-sm text-gray-500">No files uploaded yet</p>
            ) : (
              recentFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      file.status === "completed" ? "bg-success-100" : 
                      file.status === "processing" ? "bg-warning-100" : "bg-error-100"
                    }`}>
                      <i className={`text-sm ${
                        file.status === "completed" ? "fas fa-check text-success-600" :
                        file.status === "processing" ? "fas fa-clock text-warning-600" : 
                        "fas fa-times text-error-600"
                      }`}></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.originalFilename}</p>
                      <p className="text-xs text-gray-500">
                        {file.status === "completed" 
                          ? `${file.processedRecords} records processed`
                          : file.status === "processing" 
                          ? "Processing..." 
                          : "Failed"
                        }
                      </p>
                    </div>
                  </div>
                  {file.status === "completed" && (
                    <button className="text-gray-400 hover:text-gray-600">
                      <i className="fas fa-download text-sm"></i>
                    </button>
                  )}
                  {file.status === "processing" && (
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="bg-warning-500 h-2 rounded-full" style={{ width: "65%" }}></div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
