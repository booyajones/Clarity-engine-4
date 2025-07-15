import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Building2, User, Landmark, Shield, CreditCard, ArrowRightLeft, HelpCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ClassificationResult {
  payeeType: string;
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  flagForReview?: boolean;
  isExcluded?: boolean;
  exclusionKeyword?: string;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case "Individual": return <User className="h-5 w-5" />;
    case "Business": return <Building2 className="h-5 w-5" />;
    case "Government": return <Landmark className="h-5 w-5" />;
    case "Tax/Government": return <Landmark className="h-5 w-5" />;
    case "Insurance": return <Shield className="h-5 w-5" />;
    case "Banking": return <CreditCard className="h-5 w-5" />;
    case "Internal Transfer": return <ArrowRightLeft className="h-5 w-5" />;
    default: return <HelpCircle className="h-5 w-5" />;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "Individual": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Business": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Government": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Tax/Government": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Insurance": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "Banking": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    case "Internal Transfer": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    default: return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }
};

export function SingleClassification() {
  const [payeeName, setPayeeName] = useState("");
  const [result, setResult] = useState<ClassificationResult | null>(null);

  const classifyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("/api/classify-single", {
        method: "POST",
        body: JSON.stringify({ payeeName: name }),
        headers: { "Content-Type": "application/json" }
      });
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error) => {
      console.error("Classification failed:", error);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (payeeName.trim()) {
      classifyMutation.mutate(payeeName.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && payeeName.trim()) {
      handleSubmit(e);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Quick Payee Classification
          </CardTitle>
          <CardDescription>
            Enter a payee name to get instant AI-powered classification results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              placeholder="Enter payee name (e.g., Microsoft, John Smith, prosalutem)"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={classifyMutation.isPending}
            />
            <Button 
              type="submit" 
              disabled={!payeeName.trim() || classifyMutation.isPending}
              className="min-w-[100px]"
            >
              {classifyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Classify
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {getTypeIcon(result.payeeType)}
                Classification Results
              </span>
              <Badge className={getTypeColor(result.payeeType)}>
                {result.payeeType}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Confidence Score
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
              </div>

              {result.sicCode && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Industry Code
                  </label>
                  <p className="text-sm font-mono mt-1">
                    {result.sicCode}
                  </p>
                </div>
              )}
            </div>

            {result.sicDescription && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Industry Description
                </label>
                <p className="text-sm mt-1">
                  {result.sicDescription}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                AI Reasoning
              </label>
              <p className="text-sm mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {result.reasoning}
              </p>
            </div>

            {result.isExcluded && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Excluded:</strong> This payee matches exclusion keyword "{result.exclusionKeyword}"
                </p>
              </div>
            )}

            {result.flagForReview && (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  <strong>Flagged for Review:</strong> This classification has lower confidence and may need manual verification
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {classifyMutation.isError && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">
              Classification failed. Please try again or check your connection.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}