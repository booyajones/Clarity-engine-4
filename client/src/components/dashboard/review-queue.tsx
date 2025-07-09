import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PayeeClassification } from "@/lib/types";

export default function ReviewQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingItems = [] } = useQuery<PayeeClassification[]>({
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

  const handleApprove = (item: PayeeClassification) => {
    updateClassificationMutation.mutate({
      id: item.id,
      updates: { status: "user-confirmed" }
    });
  };

  const handleReject = (item: PayeeClassification) => {
    // For simplicity, we'll mark as individual with low confidence
    updateClassificationMutation.mutate({
      id: item.id,
      updates: { 
        payeeType: "Individual",
        confidence: 0.5,
        status: "user-corrected"
      }
    });
  };

  const displayItems = pendingItems.slice(0, 3);

  return (
    <Card className="shadow-sm mb-8">
      <CardContent className="p-0">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Review Queue</h3>
              <p className="text-sm text-gray-500 mt-1">Payees requiring manual classification review</p>
            </div>
            <div className="flex items-center space-x-3">
              <button className="text-sm text-gray-600 hover:text-gray-900 font-medium">
                <i className="fas fa-filter mr-2"></i>
                Filter
              </button>
              <Button className="bg-primary-500 hover:bg-primary-600 text-white text-sm">
                Review All
              </Button>
            </div>
          </div>
        </div>

        {displayItems.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <i className="fas fa-check-circle text-4xl mb-4 text-success-500"></i>
            <p>No items pending review</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI Suggestion</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.cleanedName}</p>
                        <p className="text-xs text-gray-500">Original: {item.originalName}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{item.address || "N/A"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={
                        item.payeeType === "Business" ? "default" :
                        item.payeeType === "Individual" ? "secondary" :
                        "outline"
                      }>
                        {item.payeeType}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-warning-500 h-2 rounded-full" 
                            style={{ width: `${item.confidence * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{Math.round(item.confidence * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button 
                        onClick={() => handleApprove(item)}
                        className="text-success-600 hover:text-success-900"
                        disabled={updateClassificationMutation.isPending}
                      >
                        <i className="fas fa-check"></i>
                      </button>
                      <button 
                        onClick={() => handleReject(item)}
                        className="text-error-600 hover:text-error-900"
                        disabled={updateClassificationMutation.isPending}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                      <button className="text-gray-600 hover:text-gray-900">
                        <i className="fas fa-edit"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingItems.length > 3 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">Showing 3 of {pendingItems.length} results</p>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button size="sm" className="bg-primary-500 hover:bg-primary-600">
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
