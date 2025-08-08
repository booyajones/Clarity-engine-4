import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Play,
  Pause,
  Activity,
  Package,
  ArrowLeft,
  TrendingUp,
  Server,
  Database,
  Zap,
} from 'lucide-react';

interface BatchJob {
  id: string;
  batchId: number;
  service: string;
  status: string;
  totalRecords: number;
  recordsProcessed: number;
  recordsFailed: number;
  progress: number;
  metadata?: any;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  subBatchSummary?: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    pending: number;
  };
}

interface SubBatch {
  id: string;
  batchJobId: string;
  batchNumber: number;
  totalBatches: number;
  startIndex: number;
  endIndex: number;
  recordCount: number;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

interface BatchInfo {
  id: number;
  originalFilename: string;
  filename: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
}

interface BatchJobStats {
  totalJobs: number;
  byStatus: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    partial: number;
    cancelled: number;
  };
  byService: {
    mastercard: number;
    finexio: number;
    openai: number;
  };
  totalRecordsProcessed: number;
  totalRecordsFailed: number;
  averageProcessingTimeMs: number;
}

export function BatchJobMonitor() {
  const { toast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch all batch IDs
  const { data: batches } = useQuery<BatchInfo[]>({
    queryKey: ['/api/upload/batches'],
  });

  // Fetch jobs for selected batch
  const { data: jobs, refetch: refetchJobs } = useQuery<BatchJob[]>({
    queryKey: [`/api/batch-jobs/batch/${selectedBatchId}`],
    enabled: !!selectedBatchId,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch sub-batches for selected job
  const { data: subBatches } = useQuery<SubBatch[]>({
    queryKey: [`/api/batch-jobs/job/${selectedJobId}/sub-batches`],
    enabled: !!selectedJobId,
    refetchInterval: autoRefresh ? 3000 : false,
  });

  // Fetch overall statistics
  const { data: stats } = useQuery<BatchJobStats>({
    queryKey: ['/api/batch-jobs/stats'],
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'pending':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
      case 'cancelled':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'partial':
        return <AlertCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      const response = await apiRequest(`/api/batch-jobs/job/${jobId}/resume`, 'POST');
      
      toast({
        title: 'Job Resumed',
        description: `${response.resumedCount} failed sub-batches have been resumed`,
      });
      
      refetchJobs();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resume job',
        variant: 'destructive',
      });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiRequest(`/api/batch-jobs/job/${jobId}/cancel`, 'POST');
      
      toast({
        title: 'Job Cancelled',
        description: 'The job has been cancelled successfully',
      });
      
      refetchJobs();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel job',
        variant: 'destructive',
      });
    }
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Batch Job Monitor</h1>
            <p className="text-sm text-gray-500">
              Track and manage large-scale batch processing operations
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
        </div>
      </div>

      {/* Statistics Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalJobs}</div>
              <div className="text-xs text-muted-foreground">
                Across all batches
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records Processed</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalRecordsProcessed.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.totalRecordsFailed > 0 && (
                  <span className="text-red-600">
                    {stats.totalRecordsFailed.toLocaleString()} failed
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Services</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {stats.byService.mastercard > 0 && (
                  <Badge variant="outline">MC: {stats.byService.mastercard}</Badge>
                )}
                {stats.byService.finexio > 0 && (
                  <Badge variant="outline">FX: {stats.byService.finexio}</Badge>
                )}
                {stats.byService.openai > 0 && (
                  <Badge variant="outline">AI: {stats.byService.openai}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(stats.averageProcessingTimeMs / 1000)}s
              </div>
              <div className="text-xs text-muted-foreground">
                Per job average
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Batch Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Batch</CardTitle>
          <CardDescription>
            Choose a batch to view its processing jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedBatchId?.toString() || ''}
            onValueChange={(value) => {
              setSelectedBatchId(parseInt(value));
              setSelectedJobId(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a batch..." />
            </SelectTrigger>
            <SelectContent>
              {batches && batches.length > 0 ? (
                batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id.toString()}>
                    {batch.originalFilename} (ID: {batch.id})
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No batches available
                </div>
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Jobs List */}
      {selectedBatchId && jobs && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Batch Jobs</CardTitle>
            <CardDescription>
              All processing jobs for the selected batch
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Sub-Batches</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs && jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">
                      {job.id.substring(0, 16)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.service}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(job.status)}>
                        {getStatusIcon(job.status)}
                        <span className="ml-1">{job.status}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={job.progress} className="w-20" />
                        <span className="text-xs">{job.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{job.recordsProcessed} / {job.totalRecords}</div>
                        {job.recordsFailed > 0 && (
                          <div className="text-xs text-red-600">
                            {job.recordsFailed} failed
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.subBatchSummary && (
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-xs">
                            {job.subBatchSummary.completed}/{job.subBatchSummary.total}
                          </Badge>
                          {job.subBatchSummary.failed > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {job.subBatchSummary.failed} failed
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.startedAt && (
                        <span className="text-sm">
                          {formatDuration(job.startedAt, job.completedAt)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedJobId(job.id)}
                            >
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Sub-Batch Details</DialogTitle>
                            </DialogHeader>
                            {subBatches && (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Batch #</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Records</TableHead>
                                    <TableHead>Retries</TableHead>
                                    <TableHead>Error</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {subBatches && subBatches.map((sb) => (
                                    <TableRow key={sb.id}>
                                      <TableCell>
                                        {sb.batchNumber}/{sb.totalBatches}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={getStatusColor(sb.status)}>
                                          {sb.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {sb.recordsProcessed}/{sb.recordCount}
                                      </TableCell>
                                      <TableCell>{sb.retryCount}</TableCell>
                                      <TableCell className="max-w-xs truncate">
                                        {sb.lastError || '-'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </DialogContent>
                        </Dialog>
                        
                        {job.status === 'failed' || job.status === 'partial' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResumeJob(job.id)}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        ) : job.status === 'processing' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelJob(job.id)}
                          >
                            <Pause className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}