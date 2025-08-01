import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Building2, User, Landmark, Shield, CreditCard, ArrowRightLeft, HelpCircle, Database, Globe } from "lucide-react";
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
  bigQueryMatch?: {
    matched: boolean;
    finexioSupplier?: {
      id: string;
      name: string;
      finexioMatchScore: number;
      paymentType: string;
      matchReasoning: string;
      matchType: string;
      confidence: number;
    };
  };
  mastercardEnrichment?: {
    enriched: boolean;
    status: string;
    message: string;
    data?: {
      merchantCategoryCode?: string;
      merchantCategoryDescription?: string;
      acceptanceNetwork?: string;
      lastTransactionDate?: string;
      dataQualityLevel?: string;
    } | null;
  };
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
  const [enableFinexioMatching, setEnableFinexioMatching] = useState(true);
  const [enableMastercardMatching, setEnableMastercardMatching] = useState(true);

  const classifyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/classify-single", { 
        payeeName: name,
        matchingOptions: {
          enableFinexio: enableFinexioMatching,
          enableMastercard: enableMastercardMatching
        }
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-3">
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
            </div>
            
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-600" />
                <Label htmlFor="finexio-toggle" className="text-sm font-normal cursor-pointer">
                  Finexio Network Search
                </Label>
                <Switch
                  id="finexio-toggle"
                  checked={enableFinexioMatching}
                  onCheckedChange={setEnableFinexioMatching}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                <Label htmlFor="mastercard-toggle" className="text-sm font-normal cursor-pointer">
                  Mastercard Enrichment
                </Label>
                <Switch
                  id="mastercard-toggle"
                  checked={enableMastercardMatching}
                  onCheckedChange={setEnableMastercardMatching}
                />
              </div>
            </div>
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

            {result.bigQueryMatch && result.bigQueryMatch.finexioSupplier && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                result.bigQueryMatch.matched 
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' 
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${
                    result.bigQueryMatch.matched 
                      ? 'text-purple-800 dark:text-purple-200' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {result.bigQueryMatch.matched ? '✓ Finexio Network Match' : 'Finexio Network Search'}
                  </p>
                  <Badge className={
                    result.bigQueryMatch.matched 
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100' 
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                  }>
                    {Math.round(result.bigQueryMatch.finexioSupplier.finexioMatchScore)}% Match
                  </Badge>
                </div>
                {result.bigQueryMatch.matched ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Supplier Name</label>
                      <p className="text-purple-900 dark:text-purple-100">{result.bigQueryMatch.finexioSupplier.name}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Payment Type</label>
                      <p className="text-purple-900 dark:text-purple-100">{result.bigQueryMatch.finexioSupplier.paymentType}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Match Reasoning</label>
                      <p className="text-purple-900 dark:text-purple-100 text-xs bg-purple-100/50 dark:bg-purple-800/50 p-2 rounded mt-1">
                        {result.bigQueryMatch.finexioSupplier.matchReasoning}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {result.bigQueryMatch.finexioSupplier.matchReasoning}
                  </div>
                )}
              </div>
            )}

            {result.mastercardEnrichment && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                result.mastercardEnrichment.enriched 
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' 
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium flex items-center gap-2 ${
                    result.mastercardEnrichment.enriched 
                      ? 'text-amber-800 dark:text-amber-200' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    <Globe className="h-4 w-4" />
                    Mastercard Track™ Enrichment
                  </p>
                  {result.mastercardEnrichment.status === "not_configured" && (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Credentials Required
                    </Badge>
                  )}
                  {result.mastercardEnrichment.status === "disabled" && (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Disabled
                    </Badge>
                  )}
                  {result.mastercardEnrichment.status === "pending" && (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100">
                      Processing
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {result.mastercardEnrichment.message}
                </div>
                {result.mastercardEnrichment.enriched && result.mastercardEnrichment.data && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mt-3">
                    {result.mastercardEnrichment.data.merchantCategoryCode && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Merchant Category</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          {result.mastercardEnrichment.data.merchantCategoryCode} - {result.mastercardEnrichment.data.merchantCategoryDescription}
                        </p>
                      </div>
                    )}
                    {result.mastercardEnrichment.data.acceptanceNetwork && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Acceptance Network</label>
                        <p className="text-amber-900 dark:text-amber-100">{result.mastercardEnrichment.data.acceptanceNetwork}</p>
                      </div>
                    )}
                    {result.mastercardEnrichment.data.lastTransactionDate && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Last Transaction</label>
                        <p className="text-amber-900 dark:text-amber-100">{result.mastercardEnrichment.data.lastTransactionDate}</p>
                      </div>
                    )}
                    {result.mastercardEnrichment.data.dataQualityLevel && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Data Quality</label>
                        <p className="text-amber-900 dark:text-amber-100">{result.mastercardEnrichment.data.dataQualityLevel}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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