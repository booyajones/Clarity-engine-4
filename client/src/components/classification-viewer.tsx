import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  ArrowLeft,
  ArrowRight,
  Download,
  Search,
  Filter,
  Eye,
  Building2,
  User,
  LandmarkIcon,
  TrendingUp,
  FileSpreadsheet,
  Copy,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ClassificationData {
  id: number;
  originalName: string;
  cleanedName: string;
  payeeType: "Individual" | "Business" | "Government" | "Insurance" | "Banking" | "Internal Transfer";
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
  createdAt: string;
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
    averageConfidence: number;
    duplicates: number;
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

  const { data, isLoading, error } = useQuery<ClassificationResponse>({
    queryKey: ["/api/classifications", batchId],
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
      "SIC Code", "SIC Description", "Address", "City", "State", "ZIP", "Reasoning"
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
        `"${classification.address || ""}"`,
        `"${classification.city || ""}"`,
        `"${classification.state || ""}"`,
        `"${classification.zipCode || ""}"`,
        `"${classification.reasoning}"`
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
      default:
        return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Business":
        return "bg-blue-100 text-blue-800";
      case "Individual":
        return "bg-green-100 text-green-800";
      case "Government":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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
                <Building2 className="h-8 w-8 text-red-500" />
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
                <Building2 className="h-8 w-8 text-emerald-500" />
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
                <ArrowRight className="h-8 w-8 text-indigo-500" />
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
                </SelectContent>
              </Select>
              
              <div className="text-sm text-gray-500 flex items-center">
                Click column headers to sort
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
                              onClick={() => setSelectedClassification(classification)}
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
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}