import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Globe, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
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
  // Fetch all Mastercard searches
  const searchesQuery = useQuery<MastercardSearch[]>({
    queryKey: ['/api/mastercard/searches'],
    refetchInterval: 5000, // Refresh every 5 seconds
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

  const activeSearches = searchesQuery.data?.filter(s => 
    ['pending', 'submitted', 'polling'].includes(s.status)
  ) || [];
  
  const completedSearches = searchesQuery.data?.filter(s => 
    ['completed', 'failed', 'timeout'].includes(s.status)
  ) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Globe className="h-8 w-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold">Mastercard Search Monitor</h1>
            <p className="text-gray-600 dark:text-gray-400">Track all Mastercard Track™ API searches</p>
          </div>
        </div>
        <Button 
          onClick={handleRefresh}
          disabled={searchesQuery.isLoading}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${searchesQuery.isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              {searchesQuery.data?.filter(s => s.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Failed/Timeout</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {searchesQuery.data?.filter(s => s.status === 'failed' || s.status === 'timeout').length || 0}
            </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSearches.map((search) => (
                  <TableRow key={search.id}>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedSearches.slice(0, 20).map((search) => (
                  <TableRow key={search.id}>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}