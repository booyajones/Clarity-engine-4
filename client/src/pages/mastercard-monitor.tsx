import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Globe, CheckCircle, XCircle, Clock, AlertCircle, ArrowLeft, Trash2, Eye, RotateCcw, Search, Filter } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { format } from "date-fns";

interface MastercardSearch {
  id: number;
  searchId: string;
  status: string;
  searchType: string;
  pollAttempts: number;
  maxPollAttempts: number;
  lastPolledAt: string | null;
  submittedAt: string;
  completedAt: string | null;
  error: string | null;
  requestPayload: {
    payeeName?: string;
    jobId?: string;
  };
  responsePayload?: any;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
    case 'timeout':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-orange-500" />;
    case 'submitted':
    case 'polling':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    timeout: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    polling: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  };
  
  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
      <span className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status}
      </span>
    </Badge>
  );
};

export default function MastercardMonitor() {
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSearch, setSelectedSearch] = useState<MastercardSearch | null>(null);
  const [deleteSearchId, setDeleteSearchId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Fetch all Mastercard searches
  const searchesQuery = useQuery<MastercardSearch[]>({
    queryKey: ['/api/mastercard/searches'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (searchId: number) => {
      const res = await apiRequest('DELETE', `/api/mastercard/searches/${searchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mastercard/searches'] });
      setDeleteSearchId(null);
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (search: MastercardSearch) => {
      const res = await apiRequest('POST', '/api/mastercard/retry', { searchId: search.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mastercard/searches'] });
    },
  });

  // Cancel mutation for active searches
  const cancelMutation = useMutation({
    mutationFn: async (searchId: number) => {
      const res = await apiRequest('POST', `/api/mastercard/searches/${searchId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mastercard/searches'] });
    },
  });

  const handleRefresh = () => {
    searchesQuery.refetch();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM dd, HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  // Filter searches based on search text and status
  const filteredSearches = searchesQuery.data?.filter(search => {
    const matchesSearch = !searchFilter || 
      search.requestPayload?.payeeName?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      search.searchId.toLowerCase().includes(searchFilter.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || search.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const activeSearches = filteredSearches.filter(s => 
    ['pending', 'submitted', 'polling'].includes(s.status)
  );
  
  const completedSearches = filteredSearches.filter(s => 
    ['completed', 'failed', 'timeout', 'cancelled'].includes(s.status)
  );

  // Pagination
  const totalPages = Math.ceil(completedSearches.length / itemsPerPage);
  const paginatedSearches = completedSearches.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with Navigation */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="hover:bg-amber-100 transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="relative">
              <Globe className="h-8 w-8 text-amber-600" />
              {activeSearches.length > 0 && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-amber-500 rounded-full" />
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                Mastercard Search Monitor
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Track all Mastercard Track™ API searches</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="outline" className="hover:bg-amber-50 transition-colors">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <Button 
              onClick={handleRefresh}
              disabled={searchesQuery.isLoading}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${searchesQuery.isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by payee name or search ID..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="polling">Polling</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{searchesQuery.data?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeSearches.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {filteredSearches.filter(s => s.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {filteredSearches.filter(s => s.status === 'failed' || s.status === 'timeout').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Filtered Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSearches.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Searches */}
      {activeSearches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Searches</CardTitle>
            <CardDescription>Currently processing searches</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search ID</TableHead>
                  <TableHead>Payee Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Poll Attempts</TableHead>
                  <TableHead>Last Polled</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSearches.map((search) => (
                  <TableRow 
                    key={search.id} 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setSelectedSearch(search)}
                  >
                    <TableCell className="font-mono text-xs">
                      {search.searchId.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium">
                      {search.requestPayload?.payeeName || '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(search.status)}</TableCell>
                    <TableCell>
                      {search.pollAttempts} / {search.maxPollAttempts}
                    </TableCell>
                    <TableCell>{formatDate(search.lastPolledAt)}</TableCell>
                    <TableCell>{formatDate(search.submittedAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSearch(search);
                          }}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelMutation.mutate(search.id);
                          }}
                          disabled={cancelMutation.isPending}
                          title="Cancel Search"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSearchId(search.id);
                          }}
                          title="Delete Search"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Completed Searches */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Searches</CardTitle>
          <CardDescription>Completed, failed, and timed out searches</CardDescription>
        </CardHeader>
        <CardContent>
          {completedSearches.length === 0 && activeSearches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No searches found. Searches will appear here when initiated.
            </div>
          ) : completedSearches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed searches yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search ID</TableHead>
                  <TableHead>Payee Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSearches.map((search) => (
                  <TableRow 
                    key={search.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setSelectedSearch(search)}
                  >
                    <TableCell className="font-mono text-xs">
                      {search.searchId.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium">
                      {search.requestPayload?.payeeName || '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(search.status)}</TableCell>
                    <TableCell>
                      {search.status === 'completed' && search.responsePayload?.results?.length > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          Match Found
                        </Badge>
                      ) : search.status === 'completed' ? (
                        <Badge variant="outline" className="text-xs">
                          No Match
                        </Badge>
                      ) : search.error ? (
                        <span className="text-xs text-red-600">{search.error.substring(0, 30)}...</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatDate(search.completedAt)}</TableCell>
                    <TableCell>
                      {search.completedAt && search.submittedAt ? (
                        <span className="text-xs">
                          {Math.round((new Date(search.completedAt).getTime() - new Date(search.submittedAt).getTime()) / 1000)}s
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSearch(search);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(search.status === 'failed' || search.status === 'timeout') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              retryMutation.mutate(search);
                            }}
                            disabled={retryMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSearchId(search.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, completedSearches.length)} of {completedSearches.length} results
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                    if (pageNum > totalPages) return null;
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={!!selectedSearch} onOpenChange={(open) => !open && setSelectedSearch(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Search Details</DialogTitle>
            <DialogDescription>
              Complete details for search {selectedSearch?.searchId}
            </DialogDescription>
          </DialogHeader>
          {selectedSearch && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Search ID</label>
                  <p className="font-mono text-xs">{selectedSearch.searchId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedSearch.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Payee Name</label>
                  <p>{selectedSearch.requestPayload?.payeeName || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Search Type</label>
                  <p>{selectedSearch.searchType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Submitted At</label>
                  <p>{formatDate(selectedSearch.submittedAt)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Completed At</label>
                  <p>{formatDate(selectedSearch.completedAt)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Poll Attempts</label>
                  <p>{selectedSearch.pollAttempts} / {selectedSearch.maxPollAttempts}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Last Polled</label>
                  <p>{formatDate(selectedSearch.lastPolledAt)}</p>
                </div>
              </div>
              
              {selectedSearch.error && (
                <div>
                  <label className="text-sm font-medium">Error</label>
                  <p className="text-red-600 text-sm mt-1">{selectedSearch.error}</p>
                </div>
              )}
              
              {selectedSearch.responsePayload && (
                <div>
                  <label className="text-sm font-medium">Response Data</label>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto mt-1">
                    {JSON.stringify(selectedSearch.responsePayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedSearch(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSearchId} onOpenChange={(open) => !open && setDeleteSearchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Search Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this search record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSearchId && deleteMutation.mutate(deleteSearchId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}