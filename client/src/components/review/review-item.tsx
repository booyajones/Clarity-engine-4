import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PayeeClassification } from "@/lib/types";

interface ReviewItemProps {
  classification: PayeeClassification;
  onUpdate?: (classification: PayeeClassification) => void;
  compact?: boolean;
}

export default function ReviewItem({ 
  classification, 
  onUpdate, 
  compact = false 
}: ReviewItemProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    payeeType: classification.payeeType,
    sicCode: classification.sicCode || "",
    sicDescription: classification.sicDescription || "",
    confidence: classification.confidence,
    notes: ""
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<PayeeClassification>) => {
      const response = await apiRequest("PATCH", `/api/classifications/${classification.id}`, updates);
      return response.json();
    },
    onSuccess: (updatedClassification) => {
      queryClient.invalidateQueries({ queryKey: ["/api/classifications/pending-review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classifications"] });
      onUpdate?.(updatedClassification);
      setEditDialogOpen(false);
      toast({
        title: "Classification updated",
        description: "The payee classification has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update classification. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleQuickAction = (action: "approve" | "reject" | "edit") => {
    switch (action) {
      case "approve":
        updateMutation.mutate({ status: "user-confirmed" });
        break;
      case "reject":
        updateMutation.mutate({ 
          payeeType: "Individual",
          confidence: 0.5,
          status: "user-corrected"
        });
        break;
      case "edit":
        setEditDialogOpen(true);
        break;
    }
  };

  const handleTypeChange = (newType: string) => {
    updateMutation.mutate({
      payeeType: newType as "Individual" | "Business" | "Government",
      confidence: 0.95,
      status: "user-corrected"
    });
  };

  const handleEditSubmit = () => {
    updateMutation.mutate({
      payeeType: editForm.payeeType as "Individual" | "Business" | "Government",
      sicCode: editForm.sicCode || null,
      sicDescription: editForm.sicDescription || null,
      confidence: editForm.confidence,
      status: "user-corrected"
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Business":
        return "bg-primary-100 text-primary-800";
      case "Individual":
        return "bg-success-100 text-success-800";
      case "Government":
        return "bg-warning-100 text-warning-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatAddress = () => {
    const parts = [
      classification.address,
      classification.city,
      classification.state,
      classification.zipCode
    ].filter(Boolean);
    return parts.join(", ") || "—";
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
        <div className="flex items-center space-x-4 flex-1">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {classification.cleanedName}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {formatAddress()}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getTypeColor(classification.payeeType)}>
              {classification.payeeType}
            </Badge>
            <div className="flex items-center space-x-1">
              <div className="w-12 bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-warning-500 h-1.5 rounded-full" 
                  style={{ width: `${classification.confidence * 100}%` }}
                ></div>
              </div>
              <span className="text-xs text-gray-600">
                {Math.round(classification.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 ml-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleQuickAction("approve")}
            disabled={updateMutation.isPending}
            className="text-success-600 hover:text-success-700 hover:bg-success-50"
          >
            <i className="fas fa-check text-sm"></i>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleQuickAction("reject")}
            disabled={updateMutation.isPending}
            className="text-error-600 hover:text-error-700 hover:bg-error-50"
          >
            <i className="fas fa-times text-sm"></i>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleQuickAction("edit")}
            disabled={updateMutation.isPending}
            className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
          >
            <i className="fas fa-edit text-sm"></i>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
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
        <p className="text-sm text-gray-900">{formatAddress()}</p>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Select 
          value={classification.payeeType} 
          onValueChange={handleTypeChange}
          disabled={updateMutation.isPending}
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
            onClick={() => handleQuickAction("approve")}
            disabled={updateMutation.isPending}
            className="text-success-600 hover:text-success-700 border-success-600 hover:border-success-700"
          >
            <i className="fas fa-check mr-1"></i>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickAction("reject")}
            disabled={updateMutation.isPending}
            className="text-error-600 hover:text-error-700 border-error-600 hover:border-error-700"
          >
            <i className="fas fa-times mr-1"></i>
            Reject
          </Button>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
              >
                <i className="fas fa-edit mr-1"></i>
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Edit Classification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="payee-name">Payee Name</Label>
                  <Input 
                    id="payee-name" 
                    value={classification.cleanedName} 
                    disabled 
                    className="bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payee-type">Classification Type</Label>
                  <Select 
                    value={editForm.payeeType} 
                    onValueChange={(value) => setEditForm({...editForm, payeeType: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Business">Business</SelectItem>
                      <SelectItem value="Individual">Individual</SelectItem>
                      <SelectItem value="Government">Government</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.payeeType === "Business" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="sic-code">SIC Code</Label>
                      <Input 
                        id="sic-code"
                        value={editForm.sicCode}
                        onChange={(e) => setEditForm({...editForm, sicCode: e.target.value})}
                        placeholder="e.g. 7372"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sic-description">SIC Description</Label>
                      <Input 
                        id="sic-description"
                        value={editForm.sicDescription}
                        onChange={(e) => setEditForm({...editForm, sicDescription: e.target.value})}
                        placeholder="e.g. Prepackaged Software"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="confidence">Confidence Score</Label>
                  <Input 
                    id="confidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={editForm.confidence}
                    onChange={(e) => setEditForm({...editForm, confidence: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea 
                    id="notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    placeholder="Add any notes about this classification..."
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditSubmit}
                  disabled={updateMutation.isPending}
                  className="bg-primary-500 hover:bg-primary-600"
                >
                  {updateMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Updating...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </td>
    </tr>
  );
}
