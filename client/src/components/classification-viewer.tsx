import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Search,
  Filter,
  Eye,
  Building2,
  User,
  LandmarkIcon,
  Shield,
  Banknote,
  ArrowLeftRight,
  HelpCircle,
  TrendingUp,
  FileSpreadsheet,
  Copy,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Settings,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ClassificationData {
  id: number;
  originalName: string;
  cleanedName: string;
  payeeType: "Individual" | "Business" | "Government" | "Insurance" | "Banking" | "Internal Transfer" | "Unknown";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  status: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  duplicateId?: string;
  originalData: Record<string, any>;
  isExcluded?: boolean;
  exclusionKeyword?: string;
  // Mastercard enrichment fields
  mastercardMatchStatus?: string;
  mastercardMatchConfidence?: number;
  mastercardBusinessName?: string;
  mastercardTaxId?: string;
  mastercardMerchantIds?: string[];
  mastercardMccCode?: string;
  mastercardMccGroup?: string;
  mastercardAddress?: string;
  mastercardCity?: string;
  mastercardState?: string;
  mastercardZipCode?: string;
  mastercardCountry?: string;
  mastercardPhone?: string;
  mastercardTransactionRecency?: string;
  mastercardCommercialHistory?: string;
  mastercardSmallBusiness?: string;
  mastercardPurchaseCardLevel?: number;
  mastercardMerchantCategoryCode?: string;
  mastercardMerchantCategoryDescription?: string;
  mastercardAcceptanceNetwork?: string[];
  mastercardLastTransactionDate?: string;
  mastercardDataQualityLevel?: string;
  mastercardEnrichmentDate?: string;
  mastercardSource?: string;
  // BigQuery/Finexio enrichment fields
  finexioMatchScore?: number;
  paymentType?: string;
  matchReasoning?: string;
  createdAt: string;
  // Include payee matches from backend
  payeeMatches?: Array<{
    id: number;
    bigQueryPayeeId: string;
    bigQueryPayeeName: string;
    finexioMatchScore: number;
    matchType: string;
    matchReasoning: string;
    paymentType?: string;
  }>;
}

interface PayeeMatch {
  id: number;
  classificationId: number;
  bigQueryPayeeId: string;
  bigQueryPayeeName: string;
  matchConfidence: number;
  matchType: string;
  matchDetails: any;
  isConfirmed: boolean;
  confirmedBy?: number;
  confirmedAt?: string;
}

interface BatchData {
  id: number;
  filename: string;
  originalFilename: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  accuracy: number;
  createdAt: string;
  completedAt?: string;
}

interface ClassificationResponse {
  batch: BatchData;
  classifications: ClassificationData[];
  summary: {
    total: number;
    business: number;
    individual: number;
    government: number;
    insurance: number;
    banking: number;
    internalTransfer: number;
    unknown: number;
    averageConfidence: number;
    duplicates: number;
  };
  isLargeDataset?: boolean;
  totalRecords?: number;
  threshold?: number;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface ClassificationViewerProps {
  batchId: number;
  onBack: () => void;
}

export function ClassificationViewer({ batchId, onBack }: ClassificationViewerProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("originalName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(100);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortOrder === "asc" 
      ? <ChevronUp className="h-4 w-4 text-gray-600" />
      : <ChevronDown className="h-4 w-4 text-gray-600" />;
  };
  const [selectedClassification, setSelectedClassification] = useState<ClassificationData | null>(null);
  const [payeeMatches, setPayeeMatches] = useState<PayeeMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [enableFinexioMatching, setEnableFinexioMatching] = useState(true);
  const [enableMastercardMatching, setEnableMastercardMatching] = useState(true);

  const { data, isLoading, error } = useQuery<ClassificationResponse>({
    queryKey: ["/api/classifications", batchId, currentPage, pageSize],
    queryFn: async () => {
      const response = await fetch(`/api/classifications/${batchId}?page=${currentPage}&limit=${pageSize}`);
      if (!response.ok) throw new Error('Failed to fetch classifications');
      return response.json();
    },
  });

  const handleDownload = async (filtered = false) => {
    try {
      const response = await fetch(`/api/classifications/export/${batchId}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `classified_${data?.batch.originalFilename}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Downloaded",
        description: filtered 
          ? "Filtered classification results downloaded successfully."
          : "Classification results downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generateFilteredCSV = () => {
    if (!data || filteredAndSortedClassifications.length === 0) return;

    const headers = [
      "Original Name", "Cleaned Name", "Type", "Confidence", "Excluded", "Exclusion Keyword", 
      "SIC Code", "SIC Description", "Finexio Match Score", "Finexio Match Name", "Finexio Match Type",
      "Address", "City", "State", "ZIP", "Reasoning",
      // Mastercard enrichment fields
      "MC Status", "MC Business Name", "MC Tax ID", "MC MCC Code", "MC MCC Description",
      "MC Address", "MC City", "MC State", "MC ZIP", "MC Phone",
      "MC Transaction Recency", "MC Commercial History", "MC Small Business", "MC Purchase Card Level",
      "MC Match Confidence", "MC Data Source"
    ];

    const csvContent = [
      headers.join(","),
      ...filteredAndSortedClassifications.map(classification => [
        `"${classification.originalName}"`,
        `"${classification.cleanedName}"`,
        `"${classification.payeeType}"`,
        `"${Math.round(classification.confidence * 100)}%"`,
        `"${classification.isExcluded ? 'Yes' : 'No'}"`,
        `"${classification.exclusionKeyword || ""}"`,
        `"${classification.sicCode || ""}"`,
        `"${classification.sicDescription || ""}"`,
        `"${classification.payeeMatches?.[0]?.finexioMatchScore || 0}%"`,
        `"${classification.payeeMatches?.[0]?.bigQueryPayeeName || ""}"`,
        `"${classification.payeeMatches?.[0]?.matchType || ""}"`,
        `"${classification.address || ""}"`,
        `"${classification.city || ""}"`,
        `"${classification.state || ""}"`,
        `"${classification.zipCode || ""}"`,
        `"${classification.reasoning}"`,
        // Mastercard enrichment data
        `"${classification.mastercardMatchStatus || ""}"`,
        `"${classification.mastercardBusinessName || ""}"`,
        `"${classification.mastercardTaxId || ""}"`,
        `"${classification.mastercardMccCode || classification.mastercardMerchantCategoryCode || ""}"`,
        `"${classification.mastercardMccGroup || classification.mastercardMerchantCategoryDescription || ""}"`,
        `"${classification.mastercardAddress || ""}"`,
        `"${classification.mastercardCity || ""}"`,
        `"${classification.mastercardState || ""}"`,
        `"${classification.mastercardZipCode || ""}"`,
        `"${classification.mastercardPhone || ""}"`,
        `"${classification.mastercardTransactionRecency || ""}"`,
        `"${classification.mastercardCommercialHistory || ""}"`,
        `"${classification.mastercardSmallBusiness || ""}"`,
        `"${classification.mastercardPurchaseCardLevel || ""}"`,
        `"${classification.mastercardMatchConfidence || ""}"`,
        `"${classification.mastercardSource || ""}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `filtered_${data.batch.originalFilename}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Exported",
      description: `Exported ${filteredAndSortedClassifications.length} filtered records to CSV.`,
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Text copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  // Fetch BigQuery matches for a classification
  const fetchPayeeMatches = async (classificationId: number) => {
    setLoadingMatches(true);
    try {
      const response = await fetch(`/api/bigquery/matches/${classificationId}`);
      if (!response.ok) throw new Error('Failed to fetch matches');
      const data = await response.json();
      setPayeeMatches(data.matches || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
      setPayeeMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  // Confirm or reject a match
  const handleMatchConfirmation = async (matchId: number, isCorrect: boolean) => {
    try {
      const response = await fetch(`/api/bigquery/matches/${matchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCorrect }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          toast({
            title: isCorrect ? "Match Confirmed" : "Match Rejected",
            description: `The match has been ${isCorrect ? 'confirmed' : 'rejected'} successfully.`,
          });
          
          // Refresh matches
          if (selectedClassification) {
            await fetchPayeeMatches(selectedClassification.id);
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update match status.",
        variant: "destructive",
      });
    }
  };

  const filteredAndSortedClassifications = useMemo(() => {
    if (!data?.classifications) return [];

    let filtered = data.classifications.filter(classification => {
      const matchesSearch = 
        classification.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classification.cleanedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (classification.sicDescription && classification.sicDescription.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = selectedType === "all" || classification.payeeType === selectedType;
      
      return matchesSearch && matchesType;
    });

    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case "originalName":
          aValue = a.originalName.toLowerCase();
          bValue = b.originalName.toLowerCase();
          break;
        case "cleanedName":
          aValue = a.cleanedName.toLowerCase();
          bValue = b.cleanedName.toLowerCase();
          break;
        case "payeeType":
          aValue = a.payeeType;
          bValue = b.payeeType;
          break;
        case "confidence":
          aValue = a.confidence;
          bValue = b.confidence;
          break;
        case "sicCode":
          aValue = a.sicCode || "";
          bValue = b.sicCode || "";
          break;
        case "sicDescription":
          aValue = (a.sicDescription || "").toLowerCase();
          bValue = (b.sicDescription || "").toLowerCase();
          break;
        case "location":
          aValue = `${a.city || ""} ${a.state || ""}`.toLowerCase().trim();
          bValue = `${b.city || ""} ${b.state || ""}`.toLowerCase().trim();
          break;
        case "createdAt":
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          aValue = a.originalName.toLowerCase();
          bValue = b.originalName.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data?.classifications, searchTerm, selectedType, sortBy, sortOrder]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Business":
        return <Building2 className="h-4 w-4" />;
      case "Individual":
        return <User className="h-4 w-4" />;
      case "Government":
        return <LandmarkIcon className="h-4 w-4" />;
      case "Insurance":
        return <Shield className="h-4 w-4" />;
      case "Banking":
        return <Banknote className="h-4 w-4" />;
      case "Internal Transfer":
        return <ArrowLeftRight className="h-4 w-4" />;
      case "Unknown":
        return <HelpCircle className="h-4 w-4" />;
      default:
        return <HelpCircle className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Business":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "Individual":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "Government":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "Insurance":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "Banking":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "Internal Transfer":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
      case "Unknown":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.95) return "text-green-600";
    if (confidence >= 0.85) return "text-yellow-600";
    return "text-red-600";
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p>Loading classification results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="p-6">
          <p className="text-red-600">Failed to load classification results</p>
          <Button onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Jobs
          </Button>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Handle large datasets
  if (data.isLargeDataset) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-8 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Jobs
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {data.batch.originalFilename}
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Classification Results • {data.totalRecords} total records
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-4xl mx-auto p-8">
          <Card className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <TrendingUp className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Large Dataset Detected
                </h2>
                <p className="text-gray-600 max-w-2xl">
                  {data.message}
                </p>
              </div>
              <div className="flex gap-4 mt-4">
                <Button onClick={() => handleDownload()} className="bg-primary-500 hover:bg-primary-600">
                  <Download className="h-4 w-4 mr-2" />
                  Download Full Results
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.reload()}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Anyway (May be slow)
                </Button>
              </div>
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {data.totalRecords?.toLocaleString()}
                    </div>
                    <div className="text-gray-600">Total Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round((data.summary.averageConfidence || 0) * 100)}%
                    </div>
                    <div className="text-gray-600">Avg Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {data.threshold}+
                    </div>
                    <div className="text-gray-600">Threshold</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {data.batch.originalFilename}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Classification Results • {data.summary.total} total records
                  {data.pagination && (
                    <span> • Page {data.pagination.page} of {data.pagination.totalPages}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleDownload()} className="bg-primary-500 hover:bg-primary-600">
                <Download className="h-4 w-4 mr-2" />
                Download All
              </Button>
              {filteredAndSortedClassifications.length < data.summary.total && (
                <Button onClick={generateFilteredCSV} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Filtered ({filteredAndSortedClassifications.length})
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <FileSpreadsheet className="h-8 w-8 text-gray-400" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.total}</p>
                  <p className="text-xs text-gray-500">Total Records</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <User className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.individual}</p>
                  <p className="text-xs text-gray-500">Individuals</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Building2 className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.business}</p>
                  <p className="text-xs text-gray-500">Businesses</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <LandmarkIcon className="h-8 w-8 text-purple-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.government}</p>
                  <p className="text-xs text-gray-500">Government</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Shield className="h-8 w-8 text-orange-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.insurance || 0}</p>
                  <p className="text-xs text-gray-500">Insurance</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Banknote className="h-8 w-8 text-emerald-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.banking || 0}</p>
                  <p className="text-xs text-gray-500">Banking</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <ArrowLeftRight className="h-8 w-8 text-indigo-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.internalTransfer || 0}</p>
                  <p className="text-xs text-gray-500">Internal Transfer</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <HelpCircle className="h-8 w-8 text-gray-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{data.summary.unknown || 0}</p>
                  <p className="text-xs text-gray-500">Unknown</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-orange-500" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">
                    {Math.round(data.summary.averageConfidence * 100)}%
                  </p>
                  <p className="text-xs text-gray-500">Avg Confidence</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle>Classification Results</CardTitle>
            <CardDescription>
              View, search, and filter your classified payee data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, company, or industry..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Insurance">Insurance</SelectItem>
                  <SelectItem value="Banking">Banking</SelectItem>
                  <SelectItem value="Internal Transfer">Internal Transfer</SelectItem>
                  <SelectItem value="Unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm">Matching Settings</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="finexio-toggle" className="text-sm font-medium">
                          Finexio Network Matching
                        </label>
                        <Switch
                          id="finexio-toggle"
                          checked={enableFinexioMatching}
                          onCheckedChange={setEnableFinexioMatching}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Match payees against Finexio's supplier network database
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="mastercard-toggle" className="text-sm font-medium">
                          Mastercard Track™ Enrichment
                        </label>
                        <Switch
                          id="mastercard-toggle"
                          checked={enableMastercardMatching}
                          onCheckedChange={setEnableMastercardMatching}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Enrich business data using Mastercard Track™ Search API
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              <div className="text-sm text-gray-500 flex items-center">
                Click column headers to sort • 
                <span className="inline-flex items-center ml-2">
                  <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                    MC
                  </Badge>
                  <span className="ml-1">= Mastercard Enriched</span>
                </span>
              </div>
            </div>

            {/* Results Summary */}
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredAndSortedClassifications.length} of {data.summary.total} records
            </div>

            {/* Results Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("originalName")}
                    >
                      <div className="flex items-center gap-2">
                        Payee Name
                        {getSortIcon("originalName")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("payeeType")}
                    >
                      <div className="flex items-center gap-2">
                        Type
                        {getSortIcon("payeeType")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("confidence")}
                    >
                      <div className="flex items-center gap-2">
                        Confidence
                        {getSortIcon("confidence")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("isExcluded")}
                    >
                      <div className="flex items-center gap-2">
                        Excluded
                        {getSortIcon("isExcluded")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("sicDescription")}
                    >
                      <div className="flex items-center gap-2">
                        Industry
                        {getSortIcon("sicDescription")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("finexioMatchScore")}
                    >
                      <div className="flex items-center gap-2">
                        Finexio Match
                        {getSortIcon("finexioMatchScore")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => handleSort("location")}
                    >
                      <div className="flex items-center gap-2">
                        Location
                        {getSortIcon("location")}
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedClassifications.map((classification) => (
                    <TableRow key={classification.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{classification.cleanedName}</span>
                          {classification.cleanedName !== classification.originalName && (
                            <span className="text-xs text-gray-500">
                              Originally: {classification.originalName}
                            </span>
                          )}
                          {classification.duplicateId && (
                            <Badge variant="secondary" className="text-xs mt-1 w-fit">
                              {classification.duplicateId}
                            </Badge>
                          )}
                          {classification.mastercardMatchStatus && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs mt-1 w-fit ${
                                classification.mastercardMatchStatus === 'MATCH' 
                                  ? 'border-blue-500 text-blue-600' 
                                  : 'border-gray-400 text-gray-600'
                              }`}
                            >
                              <svg 
                                viewBox="0 0 24 24" 
                                className="h-3 w-3 mr-1" 
                                fill="currentColor"
                              >
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                              </svg>
                              MC Enriched
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(classification.payeeType)}`}>
                          {getTypeIcon(classification.payeeType)}
                          <span className="ml-1">{classification.payeeType}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${getConfidenceColor(classification.confidence)}`}>
                          {Math.round(classification.confidence * 100)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium ${classification.isExcluded ? 'text-red-600' : 'text-green-600'}`}>
                            {classification.isExcluded ? 'Yes' : 'No'}
                          </span>
                          {classification.exclusionKeyword && (
                            <span className="text-xs text-gray-500 max-w-xs truncate">
                              {classification.exclusionKeyword}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {classification.sicCode && (
                            <span className="text-sm">{classification.sicCode}</span>
                          )}
                          {classification.sicDescription && (
                            <span className="text-xs text-gray-500 max-w-xs truncate">
                              {classification.sicDescription}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start">
                          {classification.payeeMatches?.[0] ? (
                            <>
                              <span className={`text-sm font-medium ${
                                classification.payeeMatches[0].finexioMatchScore >= 90 ? 'text-green-600' :
                                classification.payeeMatches[0].finexioMatchScore >= 70 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {classification.payeeMatches[0].finexioMatchScore}%
                              </span>
                              <span className="text-xs text-gray-500 truncate max-w-[150px]" title={classification.payeeMatches[0].bigQueryPayeeName}>
                                {classification.payeeMatches[0].bigQueryPayeeName}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-gray-400">No match</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {classification.city && classification.state && (
                            <div>{classification.city}, {classification.state}</div>
                          )}
                          {classification.address && (
                            <div className="text-xs text-gray-500 max-w-xs truncate">
                              {classification.address}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedClassification(classification);
                                fetchPayeeMatches(classification.id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {getTypeIcon(classification.payeeType)}
                                {classification.cleanedName}
                              </DialogTitle>
                              <DialogDescription>
                                Detailed classification information and reasoning
                              </DialogDescription>
                            </DialogHeader>
                            
                            {selectedClassification && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium">Original Name</label>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-gray-600">{selectedClassification.originalName}</p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => copyToClipboard(selectedClassification.originalName)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Cleaned Name</label>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-gray-600">{selectedClassification.cleanedName}</p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => copyToClipboard(selectedClassification.cleanedName)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium">Classification</label>
                                    <p className="text-sm text-gray-600">{selectedClassification.payeeType}</p>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Confidence</label>
                                    <p className={`text-sm font-medium ${getConfidenceColor(selectedClassification.confidence)}`}>
                                      {Math.round(selectedClassification.confidence * 100)}%
                                    </p>
                                  </div>
                                </div>
                                
                                {selectedClassification.sicCode && (
                                  <div>
                                    <label className="text-sm font-medium">Industry Classification</label>
                                    <p className="text-sm text-gray-600">
                                      {selectedClassification.sicCode}: {selectedClassification.sicDescription}
                                    </p>
                                  </div>
                                )}
                                
                                {(selectedClassification.address || selectedClassification.city) && (
                                  <div>
                                    <label className="text-sm font-medium">Address</label>
                                    <div className="text-sm text-gray-600">
                                      {selectedClassification.address && <div>{selectedClassification.address}</div>}
                                      {selectedClassification.city && selectedClassification.state && (
                                        <div>{selectedClassification.city}, {selectedClassification.state} {selectedClassification.zipCode}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                <div>
                                  <label className="text-sm font-medium">AI Reasoning</label>
                                  <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
                                    {selectedClassification.reasoning}
                                  </div>
                                </div>
                                
                                {/* Mastercard Enrichment Data */}
                                {(selectedClassification.mastercardMatchStatus || selectedClassification.mastercardBusinessName) && (
                                  <div className="bg-amber-50 p-4 rounded-lg space-y-3 border border-amber-200">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-700" fill="currentColor">
                                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                                          <circle cx="8" cy="12" r="3" opacity="0.8"/>
                                          <circle cx="16" cy="12" r="3" opacity="0.6"/>
                                        </svg>
                                        <label className="text-sm font-medium text-amber-900">Mastercard Track™ Enrichment</label>
                                      </div>
                                      {selectedClassification.mastercardMatchStatus && (
                                        <Badge className={`text-xs ${
                                          selectedClassification.mastercardMatchStatus === 'MATCH' || selectedClassification.mastercardMatchStatus === 'enriched'
                                            ? 'bg-green-100 text-green-800' 
                                            : selectedClassification.mastercardMatchStatus === 'NO_MATCH'
                                            ? 'bg-gray-100 text-gray-800'
                                            : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {selectedClassification.mastercardMatchStatus === 'enriched' ? '✓ Enriched' : selectedClassification.mastercardMatchStatus}
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {/* Primary Business Information */}
                                    {(selectedClassification.mastercardBusinessName || selectedClassification.mastercardTaxId) && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        {selectedClassification.mastercardBusinessName && (
                                          <div className="md:col-span-2">
                                            <label className="text-xs font-medium text-amber-700">Business Name</label>
                                            <p className="text-amber-900 font-medium">{selectedClassification.mastercardBusinessName}</p>
                                          </div>
                                        )}
                                        
                                        {selectedClassification.mastercardTaxId && (
                                          <div>
                                            <label className="text-xs font-medium text-amber-700">Tax ID (EIN)</label>
                                            <p className="text-amber-900 font-mono">{selectedClassification.mastercardTaxId}</p>
                                          </div>
                                        )}
                                        
                                        {selectedClassification.mastercardPhone && (
                                          <div>
                                            <label className="text-xs font-medium text-amber-700">Phone</label>
                                            <p className="text-amber-900">{selectedClassification.mastercardPhone}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Address Information */}
                                    {(selectedClassification.mastercardAddress || selectedClassification.mastercardCity) && (
                                      <div>
                                        <label className="text-xs font-medium text-amber-700">Business Address</label>
                                        <p className="text-amber-900 text-sm">
                                          {[
                                            selectedClassification.mastercardAddress,
                                            selectedClassification.mastercardCity,
                                            selectedClassification.mastercardState,
                                            selectedClassification.mastercardZipCode
                                          ].filter(Boolean).join(', ')}
                                        </p>
                                      </div>
                                    )}
                                    
                                    {/* Merchant Classification */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                      {(selectedClassification.mastercardMccCode || selectedClassification.mastercardMerchantCategoryCode) && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">MCC Code</label>
                                          <p className="text-amber-900">
                                            {selectedClassification.mastercardMccCode || selectedClassification.mastercardMerchantCategoryCode}
                                            {(selectedClassification.mastercardMccGroup || selectedClassification.mastercardMerchantCategoryDescription) && 
                                              ` - ${selectedClassification.mastercardMccGroup || selectedClassification.mastercardMerchantCategoryDescription}`
                                            }
                                          </p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.mastercardPurchaseCardLevel && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Purchase Card Level</label>
                                          <p className="text-amber-900">Level {selectedClassification.mastercardPurchaseCardLevel}</p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.mastercardMatchConfidence && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Match Confidence</label>
                                          <p className="text-amber-900">{selectedClassification.mastercardMatchConfidence}</p>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Business Status */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                      {selectedClassification.mastercardTransactionRecency && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Transaction Status</label>
                                          <p className="text-amber-900">{selectedClassification.mastercardTransactionRecency}</p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.mastercardCommercialHistory && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Commercial History</label>
                                          <p className="text-amber-900">{selectedClassification.mastercardCommercialHistory === 'Y' ? 'Yes' : 'No'}</p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.mastercardSmallBusiness && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Small Business</label>
                                          <p className="text-amber-900">{selectedClassification.mastercardSmallBusiness === 'Y' ? 'Yes' : 'No'}</p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.mastercardAcceptanceNetwork && selectedClassification.mastercardAcceptanceNetwork.length > 0 && (
                                        <div>
                                          <label className="text-xs font-medium text-amber-700">Networks</label>
                                          <div className="flex flex-wrap gap-1">
                                            {selectedClassification.mastercardAcceptanceNetwork.map((network, idx) => (
                                              <Badge key={idx} variant="secondary" className="text-xs">
                                                {network}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Additional Details */}
                                    {(selectedClassification.mastercardLastTransactionDate || selectedClassification.mastercardDataQualityLevel) && (
                                      <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-amber-200">
                                        {selectedClassification.mastercardLastTransactionDate && (
                                          <div>
                                            <label className="text-xs font-medium text-amber-700">Last Transaction</label>
                                            <p className="text-amber-900">{new Date(selectedClassification.mastercardLastTransactionDate).toLocaleDateString()}</p>
                                          </div>
                                        )}
                                        
                                        {selectedClassification.mastercardDataQualityLevel && (
                                          <div>
                                            <label className="text-xs font-medium text-amber-700">Data Quality</label>
                                            <Badge className={`text-xs ${
                                              selectedClassification.mastercardDataQualityLevel === 'HIGH' 
                                                ? 'bg-green-100 text-green-800' 
                                                : selectedClassification.mastercardDataQualityLevel === 'MEDIUM'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-red-100 text-red-800'
                                            }`}>
                                              {selectedClassification.mastercardDataQualityLevel}
                                            </Badge>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Data Source Info */}
                                    {selectedClassification.mastercardSource && (
                                      <div className="text-xs text-amber-600 pt-2 border-t border-amber-200">
                                        Source: {selectedClassification.mastercardSource}
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* BigQuery/Finexio Enrichment Data */}
                                {selectedClassification.finexioMatchScore && (
                                  <div className="bg-purple-50 p-4 rounded-lg space-y-3">
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm font-medium text-purple-900">Finexio Network Match</label>
                                      <Badge className="bg-purple-100 text-purple-800 text-xs">
                                        {Math.round(selectedClassification.finexioMatchScore * 100)}% Match
                                      </Badge>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      {selectedClassification.paymentType && (
                                        <div>
                                          <label className="text-xs font-medium text-purple-700">Payment Type</label>
                                          <p className="text-purple-900">{selectedClassification.paymentType}</p>
                                        </div>
                                      )}
                                      
                                      {selectedClassification.matchReasoning && (
                                        <div className="col-span-2">
                                          <label className="text-xs font-medium text-purple-700">Match Reasoning</label>
                                          <div className="bg-purple-100/50 p-2 rounded text-xs">
                                            <p className="text-purple-900">{selectedClassification.matchReasoning}</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {Object.keys(selectedClassification.originalData).length > 0 && (
                                  <div>
                                    <label className="text-sm font-medium">Original Data</label>
                                    <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(selectedClassification.originalData, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Enhanced Finexio/BigQuery Payee Matches */}
                                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg space-y-3 border border-purple-200">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <svg className="h-5 w-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                      <label className="text-sm font-semibold text-purple-900">Finexio Network Matches</label>
                                    </div>
                                    {loadingMatches && (
                                      <div className="text-xs text-purple-600 flex items-center gap-1">
                                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Loading matches...
                                      </div>
                                    )}
                                  </div>
                                  
                                  {!loadingMatches && payeeMatches.length === 0 && (
                                    <div className="bg-white/60 p-3 rounded-md">
                                      <p className="text-sm text-purple-700 flex items-center gap-2">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                        </svg>
                                        No matches found in Finexio database
                                      </p>
                                    </div>
                                  )}
                                  
                                  {!loadingMatches && payeeMatches.length > 0 && (
                                    <div className="space-y-2">
                                      {payeeMatches.map((match, index) => (
                                        <div key={match.id} className="bg-white/80 p-3 rounded-lg border border-purple-100 hover:shadow-md transition-shadow">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className="font-medium text-purple-900">{match.bigQueryPayeeName}</span>
                                                <Badge className={`text-xs ${
                                                  match.matchConfidence >= 90 ? 'bg-green-100 text-green-800' :
                                                  match.matchConfidence >= 70 ? 'bg-yellow-100 text-yellow-800' :
                                                  'bg-red-100 text-red-800'
                                                }`}>
                                                  {match.matchConfidence}% match
                                                </Badge>
                                                {index === 0 && (
                                                  <Badge className="text-xs bg-purple-100 text-purple-800">
                                                    Best Match
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="text-xs text-gray-600 mt-1 space-x-3">
                                                <span>
                                                  <span className="font-medium text-gray-700">Type:</span> {match.matchType}
                                                </span>
                                                {match.bigQueryPayeeId && (
                                                  <span>
                                                    <span className="font-medium text-gray-700">ID:</span> {match.bigQueryPayeeId}
                                                  </span>
                                                )}
                                              </div>
                                              {match.isConfirmed && match.confirmedAt && (
                                                <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                                  <CheckCircle2 className="h-3 w-3" />
                                                  Confirmed on {new Date(match.confirmedAt).toLocaleDateString()}
                                                </div>
                                              )}
                                            </div>
                                            {!match.isConfirmed && (
                                              <div className="flex gap-1">
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                  onClick={() => handleMatchConfirmation(match.id, true)}
                                                  title="Confirm match"
                                                >
                                                  <CheckCircle2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                  onClick={() => handleMatchConfirmation(match.id, false)}
                                                  title="Reject match"
                                                >
                                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {data.pagination && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <div className="text-sm text-gray-500">
                    Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of {data.pagination.totalCount} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, data.pagination?.totalPages || 1) }, (_, i) => {
                        let page;
                        const totalPages = data.pagination?.totalPages || 1;
                        if (totalPages <= 5) {
                          // For 5 or fewer pages, show all of them
                          page = i + 1;
                        } else {
                          // For more than 5 pages, show pages around current page
                          if (currentPage <= 3) {
                            page = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            page = totalPages - 4 + i;
                          } else {
                            page = currentPage - 2 + i;
                          }
                        }
                        return (
                          <Button
                            key={`page-${i}`}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-8 h-8"
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(data.pagination?.totalPages || 1, currentPage + 1))}
                      disabled={currentPage === data.pagination?.totalPages}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}