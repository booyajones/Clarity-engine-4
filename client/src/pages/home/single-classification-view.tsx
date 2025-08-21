import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Sparkles, ClipboardList, Brain, Activity, Package } from "lucide-react";
import { Link } from "wouter";
import { SingleClassification } from "@/components/single-classification";

interface Props {
  onNavigate: (view: "dashboard" | "upload" | "single" | "keywords") => void;
}

export function SingleClassificationView({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-light text-gray-900 tracking-wide">
                <span className="font-normal">CLARITY ENGINE</span>
              </h1>
              <p className="text-sm text-gray-500 mt-2 tracking-wide uppercase">
                Quick Single Payee Classification
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => onNavigate("upload")} className="flex items-center gap-2">
                <UploadIcon className="h-4 w-4" />
                Upload & Process
              </Button>
              <Button variant="default" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Quick Classify
              </Button>
              <Button variant="outline" onClick={() => onNavigate("keywords")} className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Keyword Management
              </Button>
              <Link href="/akkio-models">
                <Button variant="outline" className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Akkio Models
                </Button>
              </Link>
              <Link href="/mastercard-monitor">
                <Button variant="outline" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Mastercard Monitor
                </Button>
              </Link>
              <Link href="/batch-jobs">
                <Button variant="outline" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Batch Jobs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 max-w-7xl mx-auto">
        <SingleClassification />
      </div>
    </div>
  );
}

export default SingleClassificationView;
