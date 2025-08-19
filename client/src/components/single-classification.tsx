import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Building2, User, Landmark, Shield, CreditCard, ArrowRightLeft, HelpCircle, Database, Globe, MapPin, Brain, X, CheckCircle2 } from "lucide-react";
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
      phoneNumber?: string;
      businessAddress?: string;
      matchStatus?: string;
      matchConfidence?: string;
      transactionRecency?: string;
      transactionVolume?: string;
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
  const [enableMastercardMatching, setEnableMastercardMatching] = useState(false);
  const [enableAddressValidation, setEnableAddressValidation] = useState(false);
  const [enableAkkioMatching, setEnableAkkioMatching] = useState(false);
  
  // Create toolToggles object for progress tracking UI
  const toolToggles = {
    finexio: enableFinexioMatching,
    mastercard: enableMastercardMatching,
    googleAddress: enableAddressValidation,
    akkio: enableAkkioMatching
  };
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [pendingMastercardSearchId, setPendingMastercardSearchId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progressiveStatus, setProgressiveStatus] = useState<string>('');
  
  // Initialize isProcessing from localStorage and persist changes
  const [isProcessing, setIsProcessingState] = useState(() => {
    const stored = localStorage.getItem('singleClassification_isProcessing');
    return stored === 'true';
  });
  
  const setIsProcessing = (value: boolean) => {
    setIsProcessingState(value);
    localStorage.setItem('singleClassification_isProcessing', value.toString());
  };
  
  // Restore active classification state on mount
  useEffect(() => {
    const storedJobId = localStorage.getItem('singleClassification_jobId');
    const storedMastercardId = localStorage.getItem('singleClassification_mastercardId');
    const storedPayeeName = localStorage.getItem('singleClassification_payeeName');
    const storedStatus = localStorage.getItem('singleClassification_status');
    const storedResult = localStorage.getItem('singleClassification_result');
    
    if (storedJobId) {
      setJobId(storedJobId);
      setProgressiveStatus(storedStatus || 'Resuming classification...');
    }
    if (storedMastercardId) {
      setPendingMastercardSearchId(storedMastercardId);
    }
    if (storedPayeeName) {
      setPayeeName(storedPayeeName);
    }
    // Restore saved results if available
    if (storedResult) {
      try {
        const parsedResult = JSON.parse(storedResult);
        setResult(parsedResult);
      } catch (error) {
        console.error('Failed to parse saved result:', error);
      }
    }
  }, []);

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

  // Persist jobId changes to localStorage
  useEffect(() => {
    if (jobId) {
      localStorage.setItem('singleClassification_jobId', jobId);
    } else {
      localStorage.removeItem('singleClassification_jobId');
    }
  }, [jobId]);
  
  // Persist mastercardId changes to localStorage
  useEffect(() => {
    if (pendingMastercardSearchId) {
      localStorage.setItem('singleClassification_mastercardId', pendingMastercardSearchId);
    } else {
      localStorage.removeItem('singleClassification_mastercardId');
    }
  }, [pendingMastercardSearchId]);
  
  // Persist status changes to localStorage
  useEffect(() => {
    if (progressiveStatus) {
      localStorage.setItem('singleClassification_status', progressiveStatus);
    } else {
      localStorage.removeItem('singleClassification_status');
    }
  }, [progressiveStatus]);
  
  // Persist payeeName to localStorage when processing
  useEffect(() => {
    if (isProcessing && payeeName) {
      localStorage.setItem('singleClassification_payeeName', payeeName);
    } else if (!isProcessing) {
      localStorage.removeItem('singleClassification_payeeName');
    }
  }, [isProcessing, payeeName]);
  
  // Persist result to localStorage whenever it changes
  useEffect(() => {
    if (result) {
      localStorage.setItem('singleClassification_result', JSON.stringify(result));
    } else {
      localStorage.removeItem('singleClassification_result');
    }
  }, [result]);

  // Update result when progressive classification completes
  useEffect(() => {
    if (progressiveQuery.data) {
      const { status, stage, result: progressiveResult, error } = progressiveQuery.data;
      
      if (status === 'completed' && progressiveResult) {
        console.log('Progressive classification completed:', progressiveResult);
        
        // Map googleAddressValidation to addressValidation for the UI
        const mappedResult = {
          ...progressiveResult,
          addressValidation: progressiveResult.googleAddressValidation ? {
            status: progressiveResult.googleAddressValidation.success ? 'validated' : 'failed',
            formattedAddress: progressiveResult.googleAddressValidation.data?.result?.address?.formattedAddress || progressiveResult.address,
            confidence: progressiveResult.googleAddressValidation.data?.result?.verdict?.validationGranularity === 'PREMISE' ? 1.0 : 
                       progressiveResult.googleAddressValidation.data?.result?.verdict?.validationGranularity === 'ROUTE' ? 0.8 : 0.5,
            intelligentEnhancement: progressiveResult.googleAddressValidation.intelligentEnhancement
          } : undefined
        };
        
        setResult(mappedResult);
        setIsProcessing(false); // Clear processing state when done
        
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
        setIsProcessing(false); // Clear processing state on failure
      } else if (status === 'processing') {
        setProgressiveStatus(`Processing: ${stage || 'initializing'}...`);
        setIsProcessing(true); // Keep processing state active
      }
    }
  }, [progressiveQuery.data]);

  // Poll for Mastercard search results (can take 5-10 minutes)
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
      if (attempts < 10) return 2000; // First 10 attempts: 2 seconds
      if (attempts < 30) return 5000; // Next 20 attempts: 5 seconds  
      if (attempts < 60) return 10000; // Next 30 attempts: 10 seconds
      return 15000; // After that: 15 seconds (up to 20 minutes total)
    },
    staleTime: 1000, // Keep data fresh
    gcTime: 1200000, // Keep in cache for 20 minutes
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
              businessName: mastercardData.merchantDetails?.merchantName || mastercardData.requestedCompanyName,
              taxId: mastercardData.matchedCompany?.taxId,
              mccCode: mastercardData.merchantDetails?.merchantCategoryCode,
              mccGroup: mastercardData.merchantDetails?.merchantCategoryDescription,
              address: mastercardData.matchedCompany?.businessAddress ? {
                addressLine1: mastercardData.matchedCompany.businessAddress.addressLine1,
                townName: mastercardData.matchedCompany.businessAddress.city,
                countrySubDivision: mastercardData.matchedCompany.businessAddress.state,
                postCode: mastercardData.matchedCompany.businessAddress.zip,
                country: mastercardData.matchedCompany.businessAddress.countryCode
              } : undefined,
              phone: mastercardData.matchedCompany?.businessPhone,
              matchConfidence: mastercardData.matchConfidence,
              acceptanceNetwork: mastercardData.merchantDetails?.acceptanceNetwork,
              lastTransactionDate: mastercardData.merchantDetails?.lastTransactionDate,
              dataQualityLevel: mastercardData.merchantDetails?.dataQualityLevel,
            } : null,
            message: mastercardData ? 'Mastercard enrichment successful' : 'No matching merchants found'
          }
        });
        setPendingMastercardSearchId(null);
        setIsProcessing(false); // Clear processing state when Mastercard completes
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
        setIsProcessing(false); // Clear processing state on failure
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
        setIsProcessing(true); // Set processing state
      } else {
        // Legacy response - set result directly
        setResult(data);
        setIsProcessing(false);
        
        // Check if Mastercard search is pending (legacy)
        if (data.mastercardEnrichment?.searchId && data.mastercardEnrichment?.status === 'pending') {
          setPendingMastercardSearchId(data.mastercardEnrichment.searchId);
          setIsProcessing(true); // Keep processing state for Mastercard
        }
      }
    },
    onError: (error) => {
      console.error("Classification failed:", error);
      alert(`Classification failed: ${error.message}`);
      setIsProcessing(false); // Clear processing state on error
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
  
  // Function to clear/stop ongoing classification
  const handleClearClassification = () => {
    // Clear all processing states
    setIsProcessing(false);
    setJobId(null);
    setPendingMastercardSearchId(null);
    setProgressiveStatus('');
    setResult(null);
    
    // Clear localStorage
    localStorage.removeItem('singleClassification_isProcessing');
    localStorage.removeItem('singleClassification_jobId');
    localStorage.removeItem('singleClassification_mastercardId');
    localStorage.removeItem('singleClassification_status');
    localStorage.removeItem('singleClassification_payeeName');
    localStorage.removeItem('singleClassification_result');
    
    // Reset form
    setPayeeName('');
    setAddress('');
    setCity('');
    setState('');
    setZipCode('');
    
    console.log('Classification cleared/stopped');
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
                {classifyMutation.isPending || isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {isProcessing && !classifyMutation.isPending ? 'Processing' : 'Analyzing'}
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Classify
                  </>
                )}
              </Button>
              {(isProcessing || result || pendingMastercardSearchId || jobId) && (
                <Button 
                  type="button"
                  onClick={handleClearClassification}
                  variant="outline"
                  className="min-w-[100px]"
                >
                  <X className="h-4 w-4 mr-2" />
                  {isProcessing || pendingMastercardSearchId || jobId ? 'Stop' : 'Clear'}
                </Button>
              )}
            </div>
            
            {/* Enhanced Progress Tracking */}
            {(progressiveStatus || (isProcessing && !result)) && (
              <div className="space-y-3 mt-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Processing Classification
                    </h4>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-xs">
                      In Progress
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Classification Phase */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-300">AI Classification</span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {progressiveStatus?.includes('Classification complete') ? '✓ Complete' : 'Processing...'}
                        </span>
                      </div>
                      <Progress 
                        value={progressiveStatus?.includes('Classification complete') ? 100 : 50} 
                        className="h-2"
                      />
                    </div>
                    
                    {/* Google Address Phase */}
                    {toolToggles.googleAddress && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={progressiveStatus?.includes('address') 
                            ? "text-blue-700 dark:text-blue-300" 
                            : "text-gray-600 dark:text-gray-400"}>
                            Address Validation
                          </span>
                          <span className={progressiveStatus?.includes('address') 
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-500"}>
                            {progressiveStatus?.includes('Address validation complete') ? '✓ Complete' :
                             progressiveStatus?.includes('address') ? 'Processing...' : 'Pending'}
                          </span>
                        </div>
                        <Progress 
                          value={progressiveStatus?.includes('Address validation complete') ? 100 :
                                progressiveStatus?.includes('address') ? 50 : 0} 
                          className="h-2"
                        />
                      </div>
                    )}
                    
                    {/* Finexio Phase */}
                    {toolToggles.finexio && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={progressiveStatus?.includes('Finexio') 
                            ? "text-blue-700 dark:text-blue-300" 
                            : "text-gray-600 dark:text-gray-400"}>
                            Finexio Matching
                          </span>
                          <span className={progressiveStatus?.includes('Finexio') 
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-500"}>
                            {progressiveStatus?.includes('Finexio complete') ? '✓ Complete' :
                             progressiveStatus?.includes('Finexio') ? 'Processing...' : 'Pending'}
                          </span>
                        </div>
                        <Progress 
                          value={progressiveStatus?.includes('Finexio complete') ? 100 :
                                progressiveStatus?.includes('Finexio') ? 50 : 0} 
                          className="h-2"
                        />
                      </div>
                    )}
                    
                    {/* Mastercard Phase */}
                    {toolToggles.mastercard && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={progressiveStatus?.includes('Mastercard') || pendingMastercardSearchId
                            ? "text-blue-700 dark:text-blue-300" 
                            : "text-gray-600 dark:text-gray-400"}>
                            Mastercard Enrichment
                          </span>
                          <span className={progressiveStatus?.includes('Mastercard') || pendingMastercardSearchId
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-500"}>
                            {progressiveStatus?.includes('Mastercard complete') ? '✓ Complete' :
                             (progressiveStatus?.includes('Mastercard') || pendingMastercardSearchId) ? 'Processing...' : 'Pending'}
                          </span>
                        </div>
                        <Progress 
                          value={progressiveStatus?.includes('Mastercard complete') ? 100 :
                                (progressiveStatus?.includes('Mastercard') || pendingMastercardSearchId) ? 50 : 0} 
                          className="h-2"
                        />
                      </div>
                    )}
                    
                    {/* Akkio Phase */}
                    {toolToggles.akkio && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={progressiveStatus?.includes('Akkio') 
                            ? "text-blue-700 dark:text-blue-300" 
                            : "text-gray-600 dark:text-gray-400"}>
                            Akkio Prediction
                          </span>
                          <span className={progressiveStatus?.includes('Akkio') 
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-500"}>
                            {progressiveStatus?.includes('Akkio complete') ? '✓ Complete' :
                             progressiveStatus?.includes('Akkio') ? 'Processing...' : 'Pending'}
                          </span>
                        </div>
                        <Progress 
                          value={progressiveStatus?.includes('Akkio complete') ? 100 :
                                progressiveStatus?.includes('Akkio') ? 50 : 0} 
                          className="h-2"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 text-xs text-blue-700 dark:text-blue-300">
                    {progressiveStatus || 'Initializing classification...'}
                  </div>
                </div>
              </div>
            )}
            
            {/* Show Mastercard polling status */}
            {pendingMastercardSearchId && !progressiveStatus && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                Mastercard enrichment in progress (this can take 5-10 minutes)...
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
                  Mastercard Enrichment {enableAddressValidation && <span className="text-xs text-muted-foreground">(After Address Validation)</span>}
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

      {/* Status Tiles */}
      {result && (
        <div className="space-y-4">
          {/* Processing Complete Banner */}
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h4 className="text-sm font-medium text-green-900 dark:text-green-100">
                  Classification Complete
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.classification && (
                  <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-xs">
                    ✓ {result.classification}
                  </Badge>
                )}
                {result.bigQueryMatch?.finexioSupplier && (
                  <Badge variant="outline" className={
                    (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || 
                     result.bigQueryMatch.finexioSupplier.confidence >= 85)
                    ? "bg-purple-100 dark:bg-purple-900 text-xs"
                    : "bg-orange-100 dark:bg-orange-900 text-xs"
                  }>
                    {(result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || 
                      result.bigQueryMatch.finexioSupplier.confidence >= 85)
                      ? '✓ Finexio Match' 
                      : `Finexio ${Math.round(result.bigQueryMatch.finexioSupplier.finexioMatchScore || result.bigQueryMatch.finexioSupplier.confidence || 0)}%`}
                  </Badge>
                )}
                {result.mastercardEnrichment?.searchCompleted && (
                  <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900 text-xs">
                    ✓ Mastercard
                  </Badge>
                )}
                {(result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success) && (
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-xs">
                    ✓ Address Valid
                  </Badge>
                )}
                {result.akkioPrediction && (
                  <Badge variant="outline" className="bg-cyan-100 dark:bg-cyan-900 text-xs">
                    ✓ Akkio
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {/* Status Tiles Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Classification Status */}
            <Card className="animate-fade-in-up">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4 text-blue-600" />
                  Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge variant={result.payeeType ? 'default' : 'outline'} className="w-full justify-center">
                {result.payeeType ? `✓ ${result.payeeType}` : 'Not Classified'}
              </Badge>
              {result.confidence && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {(result.confidence * 100).toFixed(0)}% confidence
                </p>
              )}
            </CardContent>
          </Card>

          {/* Finexio Match Status */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-600" />
                Finexio Match
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge 
                variant={
                  (result.bigQueryMatch?.finexioSupplier?.finexioMatchScore >= 85 || 
                   result.bigQueryMatch?.finexioSupplier?.confidence >= 85 ||
                   result.bigQueryMatch?.matched || 
                   result.finexioMatch?.matched) ? 'default' : 
                  result.bigQueryMatch?.finexioSupplier ? 'outline' : 'secondary'
                } 
                className="w-full justify-center"
              >
                {(result.bigQueryMatch?.finexioSupplier?.finexioMatchScore >= 85 || 
                  result.bigQueryMatch?.finexioSupplier?.confidence >= 85 ||
                  result.bigQueryMatch?.matched || 
                  result.finexioMatch?.matched) ? '✓ Matched' : 
                 result.bigQueryMatch?.finexioSupplier ? `${Math.round(result.bigQueryMatch.finexioSupplier.finexioMatchScore || result.bigQueryMatch.finexioSupplier.confidence || 0)}% Score` : 
                 '✗ No Match'}
              </Badge>
              {(result.bigQueryMatch?.finexioSupplier?.paymentType || result.finexioMatch?.paymentType) && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {result.bigQueryMatch?.finexioSupplier?.paymentType || result.finexioMatch?.paymentType}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Enrichment Status */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-600" />
                Enrichment
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge 
                variant={
                  result.mastercardEnrichment?.status === 'processing' ? 'outline' :
                  result.mastercardEnrichment?.enriched ? 'default' : 
                  result.mastercardEnrichment?.status === 'completed' ? 'secondary' : 
                  'outline'
                } 
                className="w-full justify-center"
              >
                {result.mastercardEnrichment?.status === 'processing' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                {result.mastercardEnrichment?.enriched ? '✓ Enriched' : 
                 result.mastercardEnrichment?.status === 'processing' ? 'Processing' :
                 result.mastercardEnrichment?.status === 'completed' ? '✗ No Data' : 
                 'Not Run'}
              </Badge>
              {result.mastercardEnrichment?.data?.mccCode && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  MCC {result.mastercardEnrichment.data.mccCode}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Address Validation Status */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-orange-600" />
                Address
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge 
                variant={
                  result.addressValidation?.status === 'validated' ? 'default' : 
                  result.googleAddressValidation?.success ? 'default' :
                  result.addressValidation?.status === 'failed' ? 'destructive' : 
                  'outline'
                } 
                className="w-full justify-center"
              >
                {result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success ? '✓ Validated' : 
                 result.addressValidation?.status === 'failed' ? '✗ Invalid' : 
                 'Not Run'}
              </Badge>
              {(result.addressValidation?.confidence || result.googleAddressValidation?.data?.result?.verdict?.validationGranularity) && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {result.addressValidation?.confidence ? 
                    `${(result.addressValidation.confidence * 100).toFixed(0)}% confidence` :
                    result.googleAddressValidation?.data?.result?.verdict?.validationGranularity?.toLowerCase()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      )}

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

            {/* Finexio Match - Show ALL scores, mark >= 85% as matches */}
            {result.bigQueryMatch && result.bigQueryMatch.finexioSupplier && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' 
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${
                    (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                      ? 'text-purple-800 dark:text-purple-200' 
                      : 'text-orange-700 dark:text-orange-300'
                  }`}>
                    {(result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85) 
                      ? '✓ Finexio Network Match' 
                      : '⚠ Finexio Score Below 85% Threshold'}
                  </p>
                  <Badge className={
                    (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100' 
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100'
                  }>
                    {Math.round(result.bigQueryMatch.finexioSupplier.finexioMatchScore || result.bigQueryMatch.finexioSupplier.confidence || 0)}% Score
                  </Badge>
                </div>
                {/* Always show match details regardless of score */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className={`text-xs font-medium ${
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-orange-700 dark:text-orange-300'
                    }`}>Supplier Name</label>
                    <p className={
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-900 dark:text-purple-100'
                        : 'text-orange-900 dark:text-orange-100'
                    }>{result.bigQueryMatch.finexioSupplier.name}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-orange-700 dark:text-orange-300'
                    }`}>Payment Type</label>
                    <p className={
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-900 dark:text-purple-100'
                        : 'text-orange-900 dark:text-orange-100'
                    }>{result.bigQueryMatch.finexioSupplier.paymentType}</p>
                  </div>
                  <div className="col-span-2">
                    <label className={`text-xs font-medium ${
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-700 dark:text-purple-300'
                        : 'text-orange-700 dark:text-orange-300'
                    }`}>Match Reasoning</label>
                    <p className={`text-xs p-2 rounded mt-1 ${
                      (result.bigQueryMatch.finexioSupplier.finexioMatchScore >= 85 || result.bigQueryMatch.finexioSupplier.confidence >= 85)
                        ? 'text-purple-900 dark:text-purple-100 bg-purple-100/50 dark:bg-purple-800/50'
                        : 'text-orange-900 dark:text-orange-100 bg-orange-100/50 dark:bg-orange-800/50'
                    }`}>
                      {result.bigQueryMatch.finexioSupplier.matchReasoning}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Google Address Validation Results */}
            {(result.addressValidation || result.googleAddressValidation) && (
              <div className={`p-4 rounded-lg space-y-3 border ${
                (result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success)
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium flex items-center gap-2 ${
                    (result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success)
                      ? 'text-blue-800 dark:text-blue-200'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    <MapPin className="h-4 w-4" />
                    Address Information
                  </p>
                  <Badge className={
                    (result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success)
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                  }>
                    {(result.addressValidation?.status === 'validated' || result.googleAddressValidation?.success) ? '✓ Validated' : 'Not Validated'}
                  </Badge>
                </div>
                
                {/* Show cleaned/validated address */}
                {(result.addressValidation?.formattedAddress || result.googleAddressValidation?.data?.result?.address?.formattedAddress) && (
                  <div>
                    <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Cleaned Address</label>
                    <p className="text-blue-900 dark:text-blue-100 text-sm">
                      {result.addressValidation?.formattedAddress || result.googleAddressValidation?.data?.result?.address?.formattedAddress}
                    </p>
                  </div>
                )}
                
                {/* Show confidence score */}
                {(result.addressValidation?.confidence || result.googleAddressValidation?.data?.result?.verdict?.validationGranularity) && (
                  <div>
                    <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Validation Confidence</label>
                    <p className="text-blue-900 dark:text-blue-100 text-sm">
                      {result.addressValidation?.confidence 
                        ? `${(result.addressValidation.confidence * 100).toFixed(0)}%`
                        : result.googleAddressValidation?.data?.result?.verdict?.validationGranularity?.toLowerCase()}
                    </p>
                  </div>
                )}
                
                {/* Show intelligent enhancement if used */}
                {result.addressValidation?.intelligentEnhancement?.used && (
                  <div className="bg-blue-100/50 dark:bg-blue-800/50 p-2 rounded">
                    <label className="text-xs font-medium text-blue-700 dark:text-blue-300">AI Enhancement Applied</label>
                    <p className="text-blue-900 dark:text-blue-100 text-xs">
                      {result.addressValidation.intelligentEnhancement.reason}
                    </p>
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
                      ✓ Matched {result.mastercardEnrichment.data?.matchConfidence ? `(${result.mastercardEnrichment.data.matchConfidence} confidence)` : ''}
                    </Badge>
                  ) : result.mastercardEnrichment.status === "no_match" ? (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100">
                      ✓ Enriched (No Match)
                    </Badge>
                  ) : result.mastercardEnrichment.status === "not_configured" ? (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Credentials Required
                    </Badge>
                  ) : result.mastercardEnrichment.status === "disabled" ? (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                      Disabled
                    </Badge>
                  ) : result.mastercardEnrichment.status === "pending" || result.mastercardEnrichment.status === "processing" ? (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing (5-10 min)
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
                    {/* Match Status and Confidence */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {result.mastercardEnrichment.data.matchStatus && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Match Status</label>
                          <p className="text-amber-900 dark:text-amber-100 font-medium">
                            {result.mastercardEnrichment.data.matchStatus}
                          </p>
                        </div>
                      )}
                      {result.mastercardEnrichment.data.matchConfidence && (
                        <div>
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Match Confidence</label>
                          <p className="text-amber-900 dark:text-amber-100 font-medium">
                            {result.mastercardEnrichment.data.matchConfidence}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Phone Number */}
                    {(result.mastercardEnrichment.data.phoneNumber || result.mastercardEnrichment.data.phone) && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Phone Number</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          {result.mastercardEnrichment.data.phoneNumber || result.mastercardEnrichment.data.phone}
                        </p>
                      </div>
                    )}
                    
                    {/* Business Address */}
                    {(result.mastercardEnrichment.data.businessAddress || result.mastercardEnrichment.data.address) && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Business Address</label>
                        <div className="text-sm text-amber-900 dark:text-amber-100">
                          {(() => {
                            const addr = result.mastercardEnrichment.data.businessAddress || result.mastercardEnrichment.data.address;
                            return (
                              <>
                                {addr.addressLine1 && <p>{addr.addressLine1}</p>}
                                {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                                {addr.townName && <p>{addr.townName}, {addr.countrySubDivision} {addr.postCode}</p>}
                                {addr.country && <p>{addr.country}</p>}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    
                    {/* Acceptance Network */}
                    {result.mastercardEnrichment.data.acceptanceNetwork !== undefined && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Acceptance Network</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          {Array.isArray(result.mastercardEnrichment.data.acceptanceNetwork) 
                            ? result.mastercardEnrichment.data.acceptanceNetwork.length > 0 
                              ? result.mastercardEnrichment.data.acceptanceNetwork.join(', ')
                              : 'None'
                            : result.mastercardEnrichment.data.acceptanceNetwork || 'None'}
                        </p>
                      </div>
                    )}
                    
                    {/* Transaction Volume */}
                    {result.mastercardEnrichment.data.transactionVolume && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Transaction Volume</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          {result.mastercardEnrichment.data.transactionVolume}
                        </p>
                      </div>
                    )}
                    
                    {/* Last Transaction Date */}
                    {result.mastercardEnrichment.data.lastTransactionDate && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Last Transaction Date</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          {result.mastercardEnrichment.data.lastTransactionDate}
                        </p>
                      </div>
                    )}
                    
                    {/* MCC Code and Description */}
                    {(result.mastercardEnrichment.data.merchantCategoryCode || result.mastercardEnrichment.data.mccCode) && (
                      <div>
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300">Merchant Category Code (MCC)</label>
                        <p className="text-amber-900 dark:text-amber-100">
                          <span className="font-mono">{result.mastercardEnrichment.data.merchantCategoryCode || result.mastercardEnrichment.data.mccCode}</span>
                          {(result.mastercardEnrichment.data.merchantCategoryDescription || result.mastercardEnrichment.data.mccGroup) && (
                            <span className="ml-2">- {result.mastercardEnrichment.data.merchantCategoryDescription || result.mastercardEnrichment.data.mccGroup}</span>
                          )}
                        </p>
                      </div>
                    )}
                    
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