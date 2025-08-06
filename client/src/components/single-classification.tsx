import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Building2, User, Landmark, Shield, CreditCard, ArrowRightLeft, HelpCircle, Database, Globe, MapPin, Brain } from "lucide-react";
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
    searchId?: string;
    message?: string;
    source?: string;
    data?: {
      businessName?: string;
      taxId?: string;
      merchantIds?: string[];
      mccCode?: string;
      mccGroup?: string;
      address?: {
        addressLine1?: string;
        townName?: string;
        countrySubDivision?: string;
        postCode?: string;
        country?: string;
      };
      phone?: string;
      matchConfidence?: string;
      transactionRecency?: string;
      commercialHistory?: string;
      smallBusiness?: string;
      purchaseCardLevel?: number;
      merchantCategoryCode?: string;
      merchantCategoryDescription?: string;
      acceptanceNetwork?: string;
      lastTransactionDate?: string;
      dataQualityLevel?: string;
    } | null;
  };
  addressValidation?: {
    status: string;
    formattedAddress?: string;
    confidence?: number;
    error?: string;
    intelligentEnhancement?: {
      used: boolean;
      reason?: string;
      strategy?: string;
      enhancedAddress?: {
        address: string;
        city: string;
        state: string;
        zipCode: string;
        corrections: string[];
        confidence: number;
      };
    };
  };
  akkioPrediction?: {
    predicted: boolean;
    status: string;
    paymentMethod?: string;
    confidence?: number;
    message?: string;
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
  const [enableAddressValidation, setEnableAddressValidation] = useState(false);
  const [enableAkkioMatching, setEnableAkkioMatching] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [pendingMastercardSearchId, setPendingMastercardSearchId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progressiveStatus, setProgressiveStatus] = useState<string>('');

  // Poll for progressive classification results
  const progressiveQuery = useQuery<any>({
    queryKey: [`/api/classify-status/${jobId}`],
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') {
        return false; // Stop polling when done
      }
      return 1000; // Poll every second while processing
    },
  });

  // Update result when progressive classification completes
  useEffect(() => {
    if (progressiveQuery.data) {
      const { status, stage, result: progressiveResult, error } = progressiveQuery.data;
      
      if (status === 'completed' && progressiveResult) {
        console.log('Progressive classification completed:', progressiveResult);
        setResult(progressiveResult);
        
        // Check if Mastercard search is still processing
        if (progressiveResult.mastercardEnrichment?.status === 'processing' && 
            progressiveResult.mastercardEnrichment?.searchId) {
          setPendingMastercardSearchId(progressiveResult.mastercardEnrichment.searchId);
        }
        
        setJobId(null); // Stop polling job status
        setProgressiveStatus('');
      } else if (status === 'failed') {
        console.error('Progressive classification failed:', error);
        alert(`Classification failed: ${error}`);
        setJobId(null);
        setProgressiveStatus('');
      } else if (status === 'processing') {
        setProgressiveStatus(`Processing: ${stage || 'initializing'}...`);
      }
    }
  }, [progressiveQuery.data]);

  // Poll for Mastercard search results
  const mastercardStatusQuery = useQuery<any>({
    queryKey: [`/api/mastercard/search-status/${pendingMastercardSearchId}`],
    enabled: !!pendingMastercardSearchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling if completed, failed, or timeout
      if (status === 'completed' || status === 'failed' || status === 'timeout') {
        return false;
      }
      // Adaptive polling intervals based on attempts
      const attempts = query.state.data?.pollAttempts || 0;
      if (attempts < 5) return 1000; // First 5 attempts: 1 second
      if (attempts < 10) return 2000; // Next 5: 2 seconds
      if (attempts < 20) return 5000; // Next 10: 5 seconds
      return 10000; // After that: 10 seconds
    },
  });

  // Update result when Mastercard search completes
  useEffect(() => {
    if (mastercardStatusQuery.data && result) {
      const { status, responsePayload, error } = mastercardStatusQuery.data;
      
      if (status === 'completed' && responsePayload) {
        console.log('Mastercard search completed:', responsePayload);
        
        // Extract the first result if available
        const mastercardData = responsePayload.results?.[0];
        
        setResult({
          ...result,
          mastercardEnrichment: {
            enriched: !!mastercardData && mastercardData.matchStatus !== 'NO_MATCH',
            status: 'completed',
            data: mastercardData ? {
              businessName: mastercardData.merchantDetails?.merchantName,
              merchantCategoryCode: mastercardData.merchantDetails?.merchantCategoryCode,
              merchantCategoryDescription: mastercardData.merchantDetails?.merchantCategoryDescription,
              matchConfidence: mastercardData.matchConfidence,
              acceptanceNetwork: mastercardData.merchantDetails?.acceptanceNetwork,
              lastTransactionDate: mastercardData.merchantDetails?.lastTransactionDate,
              dataQualityLevel: mastercardData.merchantDetails?.dataQualityLevel,
            } : null,
            message: mastercardData ? 'Mastercard enrichment successful' : 'No matching merchants found'
          }
        });
        setPendingMastercardSearchId(null);
      } else if (status === 'failed' || status === 'timeout') {
        console.error('Mastercard search failed:', error);
        setResult({
          ...result,
          mastercardEnrichment: {
            enriched: false,
            status: 'error',
            message: error || `Search ${status}`,
            data: null
          }
        });
        setPendingMastercardSearchId(null);
      }
    }
  }, [mastercardStatusQuery.data]);

  const classifyMutation = useMutation({
    mutationFn: async (name: string) => {
      const requestBody: any = { 
        payeeName: name,
        matchingOptions: {
          enableFinexio: enableFinexioMatching,
          enableMastercard: enableMastercardMatching,
          enableGoogleAddressValidation: enableAddressValidation,
          enableOpenAI: true, // Enable intelligent enhancement by default when address validation is on
          enableAkkio: enableAkkioMatching
        }
      };

      // Include address fields if address validation is enabled
      if (enableAddressValidation) {
        requestBody.address = address;
        requestBody.city = city;
        requestBody.state = state;
        requestBody.zipCode = zipCode;
      }

      console.log('Sending classification request:', requestBody);
      
      try {
        const response = await apiRequest("POST", "/api/classify-single", requestBody);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server error:', response.status, errorText);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log('Classification response:', data);
        return data;
      } catch (error) {
        console.error('Request failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Classification response:', data);
      
      // Check if this is a progressive response
      if (data.progressiveMode && data.jobId) {
        console.log('Progressive classification started with job ID:', data.jobId);
        setJobId(data.jobId);
        setResult(null); // Clear previous results
        setProgressiveStatus('Initializing classification...');
      } else {
        // Legacy response - set result directly
        setResult(data);
        
        // Check if Mastercard search is pending (legacy)
        if (data.mastercardEnrichment?.searchId && data.mastercardEnrichment?.status === 'pending') {
          setPendingMastercardSearchId(data.mastercardEnrichment.searchId);
        }
      }
    },
    onError: (error) => {
      console.error("Classification failed:", error);
      alert(`Classification failed: ${error.message}`);
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
            
            {/* Show progressive status */}
            {progressiveStatus && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/20 px-3 py-2 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progressiveStatus}
              </div>
            )}
            
            {/* Toggles for matching services */}
            <div className="flex flex-wrap items-center gap-6 text-sm">
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
              
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                <Label htmlFor="address-toggle" className="text-sm font-normal cursor-pointer">
                  Address Validation
                </Label>
                <Switch
                  id="address-toggle"
                  checked={enableAddressValidation}
                  onCheckedChange={setEnableAddressValidation}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-orange-600" />
                <Label htmlFor="akkio-toggle" className="text-sm font-normal cursor-pointer">
                  Akkio Payment Prediction
                </Label>
                <Switch
                  id="akkio-toggle"
                  checked={enableAkkioMatching}
                  onCheckedChange={setEnableAkkioMatching}
                />
              </div>
            </div>

            {/* Address fields - shown when address validation is enabled */}
            {enableAddressValidation && (
              <div className="mt-4 space-y-3 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700">Address Information (Optional)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Street Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={classifyMutation.isPending}
                  />
                  <Input
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={classifyMutation.isPending}
                  />
                  <Input
                    placeholder="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full"
                    disabled={classifyMutation.isPending}
                  />
                  <Input
                    placeholder="ZIP Code"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    disabled={classifyMutation.isPending}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Our intelligent AI will enhance addresses with typos, missing components, or low confidence scores
                </p>
              </div>
            )}
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
                  {result.mastercardEnrichment.enriched ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100">
                      ✓ Enriched {result.mastercardEnrichment.data?.matchConfidence ? `(${result.mastercardEnrichment.data.matchConfidence} confidence)` : ''}
                    </Badge>
                  ) : result.mastercardEnrichment.status === "not_configured" ? (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Credentials Required
                    </Badge>
                  ) : result.mastercardEnrichment.status === "disabled" ? (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Disabled
                    </Badge>
                  ) : result.mastercardEnrichment.status === "pending" ? (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Not Enriched
                    </Badge>
                  )}
                </div>
                
                {!result.mastercardEnrichment.enriched && result.mastercardEnrichment.message && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {result.mastercardEnrichment.message}
                  </div>
                )}
                
                {result.mastercardEnrichment.enriched && result.mastercardEnrichment.data && (
                  <div className="space-y-3">
                    {/* Primary Business Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {result.mastercardEnrichment.data.businessName && (
                        <div className="md:col-span-2">
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Business Name</label>
                          <p className="text-amber-900 dark:text-amber-100 font-medium">
                            {result.mastercardEnrichment.data.businessName}
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.taxId && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Tax ID (EIN)</label>
                          <p className="text-amber-900 dark:text-amber-100 font-mono">
                            {result.mastercardEnrichment.data.taxId}
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.phone && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Phone</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.phone}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Address Information */}
                    {result.mastercardEnrichment.data.address && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Business Address</label>
                        <p className="text-amber-900 dark:text-amber-100 text-sm">
                          {[
                            result.mastercardEnrichment.data.address.addressLine1,
                            result.mastercardEnrichment.data.address.townName,
                            result.mastercardEnrichment.data.address.countrySubDivision,
                            result.mastercardEnrichment.data.address.postCode
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                    
                    {/* Merchant Classification */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {(result.mastercardEnrichment.data.mccCode || result.mastercardEnrichment.data.merchantCategoryCode) && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">MCC Code</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.mccCode || result.mastercardEnrichment.data.merchantCategoryCode}
                            {(result.mastercardEnrichment.data.mccGroup || result.mastercardEnrichment.data.merchantCategoryDescription) && 
                              ` - ${result.mastercardEnrichment.data.mccGroup || result.mastercardEnrichment.data.merchantCategoryDescription}`
                            }
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.purchaseCardLevel && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Purchase Card Level</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            Level {result.mastercardEnrichment.data.purchaseCardLevel}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Business Status */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {result.mastercardEnrichment.data.transactionRecency && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Transaction Status</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.transactionRecency}
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.commercialHistory && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Commercial History</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.commercialHistory === 'Y' ? 'Yes' : 'No'}
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.smallBusiness && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Small Business</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.smallBusiness === 'Y' ? 'Yes' : 'No'}
                          </p>
                        </div>
                      )}
                      
                      {result.mastercardEnrichment.data.acceptanceNetwork && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Network</label>
                          <p className="text-amber-900 dark:text-amber-100">
                            {result.mastercardEnrichment.data.acceptanceNetwork}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Data Source Info */}
                    {result.mastercardEnrichment.source && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 pt-2 border-t border-amber-200 dark:border-amber-800">
                        Source: {result.mastercardEnrichment.source}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {result.addressValidation && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                result.addressValidation.status === 'validated' 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${
                    result.addressValidation.status === 'validated'
                      ? 'text-green-800 dark:text-green-200' 
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    <MapPin className="h-4 w-4 inline mr-1" />
                    {result.addressValidation.status === 'validated' ? 'Address Validation' : 'Address Validation Failed'}
                  </p>
                  {result.addressValidation.confidence && (
                    <Badge className={
                      result.addressValidation.status === 'validated'
                        ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
                        : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                    }>
                      {Math.round(result.addressValidation.confidence * 100)}% Confidence
                    </Badge>
                  )}
                </div>
                
                {result.addressValidation.status === 'validated' && (
                  <>
                    {result.addressValidation.formattedAddress && (
                      <div>
                        <label className="text-xs font-medium text-green-700 dark:text-green-300">Validated Address</label>
                        <p className="text-sm text-green-900 dark:text-green-100">{result.addressValidation.formattedAddress}</p>
                      </div>
                    )}
                    
                    {result.addressValidation.intelligentEnhancement?.used && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                          ✨ AI Enhanced Address
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                          {result.addressValidation.intelligentEnhancement.reason}
                        </p>
                        {result.addressValidation.intelligentEnhancement.enhancedAddress && (
                          <div className="space-y-1 text-xs">
                            <div className="grid grid-cols-2 gap-2 text-blue-900 dark:text-blue-100">
                              <div>
                                <span className="font-medium">Street:</span> {result.addressValidation.intelligentEnhancement.enhancedAddress.address}
                              </div>
                              <div>
                                <span className="font-medium">City:</span> {result.addressValidation.intelligentEnhancement.enhancedAddress.city}
                              </div>
                              <div>
                                <span className="font-medium">State:</span> {result.addressValidation.intelligentEnhancement.enhancedAddress.state}
                              </div>
                              <div>
                                <span className="font-medium">ZIP:</span> {result.addressValidation.intelligentEnhancement.enhancedAddress.zipCode}
                              </div>
                            </div>
                            {result.addressValidation.intelligentEnhancement.enhancedAddress.corrections.length > 0 && (
                              <p className="text-blue-700 dark:text-blue-300 mt-2">
                                <span className="font-medium">Corrections:</span> {result.addressValidation.intelligentEnhancement.enhancedAddress.corrections.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                
                {result.addressValidation.status === 'failed' && result.addressValidation.error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {result.addressValidation.error}
                  </p>
                )}
              </div>
            )}

            {result.akkioPrediction && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                result.akkioPrediction.predicted 
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' 
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${
                    result.akkioPrediction.predicted
                      ? 'text-orange-800 dark:text-orange-200' 
                      : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    <Brain className="h-4 w-4 inline mr-1" />
                    Akkio Payment Prediction
                  </p>
                  {result.akkioPrediction.confidence && (
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100">
                      {Math.round(result.akkioPrediction.confidence * 100)}% Confidence
                    </Badge>
                  )}
                </div>
                
                {result.akkioPrediction.predicted && result.akkioPrediction.paymentMethod && (
                  <div>
                    <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Predicted Payment Method</label>
                    <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                      {result.akkioPrediction.paymentMethod}
                    </p>
                  </div>
                )}
                
                {result.akkioPrediction.message && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {result.akkioPrediction.message}
                  </p>
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