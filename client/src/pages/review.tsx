import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { PayeeClassification } from "@/lib/types";

export default function Review() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: classifications = [], isLoading } = useQuery<PayeeClassification[]>({
    queryKey: ["/api/classifications/pending-review"],
  });

  const updateClassificationMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PATCH", `/api/classifications/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classifications/pending-review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Classification updated",
        description: "The classification has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update classification. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (classification: PayeeClassification) => {
    updateClassificationMutation.mutate({
      id: classification.id,
      updates: { status: "user-confirmed" }
    });
  };

  const handleReject = (classification: PayeeClassification) => {
    updateClassificationMutation.mutate({
      id: classification.id,
      updates: { 
        payeeType: "Individual",
        confidence: 0.5,
        status: "user-corrected"
      }
    });
  };

  const handleChangeType = (classification: PayeeClassification, newType: string) => {
    updateClassificationMutation.mutate({
      id: classification.id,
      updates: { 
        payeeType: newType,
        confidence: 0.95,
        status: "user-corrected"
      }
    });
  };

  const filteredClassifications = classifications.filter(classification => {
    const matchesSearch = classification.cleanedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         classification.originalName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || classification.payeeType === selectedType;
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-500">Loading review queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header 
        title="Review Queue" 
        subtitle="Review and correct AI classifications with low confidence scores"
      >
        <Button 
          className="bg-primary-500 hover:bg-primary-600 text-white"
          disabled={filteredClassifications.length === 0}
        >
          <i className="fas fa-check-double mr-2"></i>
          Approve All
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
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {filteredClassifications.length === 0 
                  ? "No items pending review"
                  : `${filteredClassifications.length} items requiring review`
                }
              </div>
              {filteredClassifications.length > 0 && (
                <div className="text-sm text-gray-500">
                  <i className="fas fa-info-circle mr-1"></i>
                  Click the classification type to change it
                </div>
              )}
            </div>

            {/* Review Items */}
            {filteredClassifications.length === 0 ? (
              <div className="text-center py-12">
                <i className="fas fa-check-circle text-4xl text-success-500 mb-4"></i>
                <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
                <p className="text-gray-500">No classifications pending review at this time.</p>
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
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        AI Suggestion
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SIC Code
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
                          <p className="text-sm text-gray-900">
                            {classification.address || "—"}
                          </p>
                          {classification.city && classification.state && (
                            <p className="text-xs text-gray-500">
                              {classification.city}, {classification.state}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Select 
                            value={classification.payeeType} 
                            onValueChange={(value) => handleChangeType(classification, value)}
                            disabled={updateClassificationMutation.isPending}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Business">Business</SelectItem>
                              <SelectItem value="Individual">Individual</SelectItem>
                              <SelectItem value="Government">Government</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-warning-500 h-2 rounded-full" 
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
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(classification)}
                              disabled={updateClassificationMutation.isPending}
                              className="text-success-600 hover:text-success-700 border-success-600 hover:border-success-700"
                            >
                              <i className="fas fa-check mr-1"></i>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(classification)}
                              disabled={updateClassificationMutation.isPending}
                              className="text-error-600 hover:text-error-700 border-error-600 hover:border-error-700"
                            >
                              <i className="fas fa-times mr-1"></i>
                              Reject
                            </Button>
                          </div>
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
