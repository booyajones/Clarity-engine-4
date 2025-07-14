import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Edit,
  TestTube,
  Search,
  Shield,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

interface ExclusionKeyword {
  id: number;
  keyword: string;
  addedBy: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  name: string;
  matches: boolean;
}

interface KeywordManagerProps {
  onBack?: () => void;
}

export function KeywordManager({ onBack }: KeywordManagerProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKeywords, setNewKeywords] = useState("");
  const [addedBy, setAddedBy] = useState("analyst");
  const [notes, setNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [testKeyword, setTestKeyword] = useState("");
  const [testNames, setTestNames] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [editingKeyword, setEditingKeyword] = useState<ExclusionKeyword | null>(null);

  // Fetch exclusion keywords
  const { data: keywords, isLoading } = useQuery({
    queryKey: ["/api/keywords"],
    queryFn: async () => {
      const response = await fetch("/api/keywords");
      if (!response.ok) throw new Error("Failed to fetch keywords");
      return response.json() as ExclusionKeyword[];
    },
  });

  // Add keywords mutation
  const addKeywordsMutation = useMutation({
    mutationFn: async (data: { keywords: string[]; addedBy: string; notes?: string }) => {
      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to add keywords");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      setNewKeywords("");
      setNotes("");
      toast({ title: "Keywords added successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error adding keywords", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Delete keyword mutation
  const deleteKeywordMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/keywords/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete keyword");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      toast({ title: "Keyword deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error deleting keyword", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Update keyword mutation
  const updateKeywordMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<ExclusionKeyword> }) => {
      const response = await fetch(`/api/keywords/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.updates),
      });
      if (!response.ok) throw new Error("Failed to update keyword");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      setEditingKeyword(null);
      toast({ title: "Keyword updated successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error updating keyword", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Test keyword matching
  const testKeywordMatching = async () => {
    if (!testKeyword || !testNames) {
      toast({ 
        title: "Test requires input", 
        description: "Please enter both a keyword and test names",
        variant: "destructive" 
      });
      return;
    }

    try {
      const response = await fetch("/api/keywords/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: testKeyword,
          testNames: testNames.split("\n").filter(name => name.trim()),
        }),
      });

      if (!response.ok) throw new Error("Failed to test keyword");
      const results = await response.json();
      setTestResults(results);
    } catch (error) {
      toast({ 
        title: "Test failed", 
        description: "Failed to test keyword matching",
        variant: "destructive" 
      });
    }
  };

  const handleAddKeywords = () => {
    const keywordList = newKeywords
      .split("\n")
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keywordList.length === 0) {
      toast({ 
        title: "No keywords entered", 
        description: "Please enter at least one keyword",
        variant: "destructive" 
      });
      return;
    }

    addKeywordsMutation.mutate({
      keywords: keywordList,
      addedBy,
      notes: notes || undefined,
    });
  };

  const handleUpdateKeyword = () => {
    if (!editingKeyword) return;

    updateKeywordMutation.mutate({
      id: editingKeyword.id,
      updates: {
        keyword: editingKeyword.keyword,
        notes: editingKeyword.notes,
        isActive: editingKeyword.isActive,
      },
    });
  };

  const filteredKeywords = keywords?.filter(keyword =>
    keyword.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
    keyword.addedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (keyword.notes && keyword.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p>Loading exclusion keywords...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack && (
                <Button variant="ghost" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  Keyword Exclusion Management
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Manage exclusion keywords for payee filtering
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {keywords?.filter(k => k.isActive).length || 0} Active Keywords
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Exclusion Keywords
              </CardTitle>
              <CardDescription>
                Add new keywords to exclude from classification. Enter one keyword per line.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="keywords">Keywords (one per line)</Label>
                <Textarea
                  id="keywords"
                  placeholder="bank&#10;test&#10;sample"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="addedBy">Added By</Label>
                <Input
                  id="addedBy"
                  value={addedBy}
                  onChange={(e) => setAddedBy(e.target.value)}
                  placeholder="analyst"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for exclusion"
                />
              </div>
              <Button 
                onClick={handleAddKeywords} 
                disabled={addKeywordsMutation.isPending}
                className="w-full"
              >
                {addKeywordsMutation.isPending ? "Adding..." : "Add Keywords"}
              </Button>
            </CardContent>
          </Card>

          {/* Test Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Test Keyword Matching
              </CardTitle>
              <CardDescription>
                Test how a keyword matches against sample payee names (whole-word matching).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="testKeyword">Test Keyword</Label>
                <Input
                  id="testKeyword"
                  value={testKeyword}
                  onChange={(e) => setTestKeyword(e.target.value)}
                  placeholder="bank"
                />
              </div>
              <div>
                <Label htmlFor="testNames">Test Names (one per line)</Label>
                <Textarea
                  id="testNames"
                  placeholder="Bank of America&#10;First National Bank&#10;Bankruptcy Law Firm"
                  value={testNames}
                  onChange={(e) => setTestNames(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={testKeywordMatching} className="w-full">
                Test Matching
              </Button>
              {testResults.length > 0 && (
                <div className="space-y-2">
                  <Label>Test Results:</Label>
                  <div className="space-y-1">
                    {testResults.map((result, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded text-sm flex items-center justify-between ${
                          result.matches 
                            ? "bg-red-50 text-red-700 border border-red-200" 
                            : "bg-green-50 text-green-700 border border-green-200"
                        }`}
                      >
                        <span>{result.name}</span>
                        <Badge variant={result.matches ? "destructive" : "secondary"}>
                          {result.matches ? "EXCLUDED" : "Allowed"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Keywords List */}
        <Card>
          <CardHeader>
            <CardTitle>Exclusion Keywords</CardTitle>
            <CardDescription>
              Manage your exclusion keyword list. Keywords use whole-word matching.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search keywords, added by, or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeywords.map((keyword) => (
                    <TableRow key={keyword.id}>
                      <TableCell className="font-mono font-medium">
                        {keyword.keyword}
                      </TableCell>
                      <TableCell>{keyword.addedBy}</TableCell>
                      <TableCell>{keyword.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={keyword.isActive ? "default" : "secondary"}>
                          {keyword.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(keyword.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingKeyword({ ...keyword })}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Keyword</DialogTitle>
                                <DialogDescription>
                                  Update the keyword settings.
                                </DialogDescription>
                              </DialogHeader>
                              {editingKeyword && (
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="editKeyword">Keyword</Label>
                                    <Input
                                      id="editKeyword"
                                      value={editingKeyword.keyword}
                                      onChange={(e) =>
                                        setEditingKeyword({
                                          ...editingKeyword,
                                          keyword: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="editNotes">Notes</Label>
                                    <Input
                                      id="editNotes"
                                      value={editingKeyword.notes || ""}
                                      onChange={(e) =>
                                        setEditingKeyword({
                                          ...editingKeyword,
                                          notes: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      id="editActive"
                                      checked={editingKeyword.isActive}
                                      onChange={(e) =>
                                        setEditingKeyword({
                                          ...editingKeyword,
                                          isActive: e.target.checked,
                                        })
                                      }
                                    />
                                    <Label htmlFor="editActive">Active</Label>
                                  </div>
                                </div>
                              )}
                              <DialogFooter>
                                <Button
                                  onClick={handleUpdateKeyword}
                                  disabled={updateKeywordMutation.isPending}
                                >
                                  {updateKeywordMutation.isPending ? "Updating..." : "Update"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Keyword</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the keyword "{keyword.keyword}"? 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteKeywordMutation.mutate(keyword.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredKeywords.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm ? "No keywords match your search" : "No exclusion keywords added yet"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}