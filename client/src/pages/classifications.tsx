import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { PayeeClassification, UploadBatch } from "@/lib/types";

export default function Classifications() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: batches = [] } = useQuery<UploadBatch[]>({
    queryKey: ["/api/upload/batches"],
  });

  const { data: classifications = [] } = useQuery<PayeeClassification[]>({
    queryKey: selectedBatch === "all" 
      ? ["/api/classifications"] 
      : ["/api/classifications/batch", selectedBatch],
    enabled: selectedBatch !== "all" || batches.length > 0,
  });

  const filteredClassifications = classifications.filter(classification => {
    const matchesSearch = classification.cleanedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         classification.originalName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || classification.payeeType === selectedType;
    return matchesSearch && matchesType;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Business":
        return "default";
      case "Individual":
        return "secondary";
      case "Government":
        return "outline";
      default:
        return "default";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "auto-classified":
        return "bg-primary-100 text-primary-800";
      case "user-confirmed":
        return "bg-success-100 text-success-800";
      case "user-corrected":
        return "bg-warning-100 text-warning-800";
      case "pending-review":
        return "bg-error-100 text-error-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Classifications" 
        subtitle="View and manage all payee classifications"
      >
        <Button className="bg-primary-500 hover:bg-primary-600 text-white">
          <i className="fas fa-download mr-2"></i>
          Export All
        </Button>
      </Header>

      <main className="flex-1 p-6 overflow-auto">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search payees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id.toString()}>
                      {batch.originalFilename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results Summary */}
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredClassifications.length} of {classifications.length} classifications
            </div>

            {/* Classifications Table */}
            {filteredClassifications.length === 0 ? (
              <div className="text-center py-12">
                <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
                <p className="text-gray-500">No classifications found</p>
                {searchTerm && (
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchTerm("")}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payee Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SIC Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredClassifications.map((classification) => (
                      <tr key={classification.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {classification.cleanedName}
                            </p>
                            {classification.originalName !== classification.cleanedName && (
                              <p className="text-xs text-gray-500">
                                Original: {classification.originalName}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getTypeColor(classification.payeeType)}>
                            {classification.payeeType}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  classification.confidence >= 0.95 ? "bg-success-500" :
                                  classification.confidence >= 0.8 ? "bg-warning-500" :
                                  "bg-error-500"
                                }`}
                                style={{ width: `${classification.confidence * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600">
                              {Math.round(classification.confidence * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {classification.sicCode ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {classification.sicCode}
                              </p>
                              <p className="text-xs text-gray-500">
                                {classification.sicDescription}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(classification.status)}`}>
                            {classification.status.replace("-", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-900">
                            {classification.address || "—"}
                          </p>
                          {classification.city && classification.state && (
                            <p className="text-xs text-gray-500">
                              {classification.city}, {classification.state} {classification.zipCode}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button variant="outline" size="sm">
                            <i className="fas fa-edit mr-1"></i>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
