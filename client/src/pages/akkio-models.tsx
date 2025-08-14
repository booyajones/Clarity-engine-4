import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, RefreshCw, Loader2, Calendar, Clock, CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Link } from "wouter";

interface AkkioModel {
  id: string;
  name: string;
  status: string;
  created_at: string;
  accuracy?: number;
  training_duration?: number;
}

export function AkkioModels() {
  const [isTraining, setIsTraining] = useState(false);

  // Fetch models
  const { data: models = [], isLoading, error } = useQuery<AkkioModel[]>({
    queryKey: ["/api/akkio/models"],
    refetchInterval: isTraining ? 5000 : 30000, // Poll more frequently when training
  });

  // Train new model mutation
  const trainModelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/akkio/train");
      return response.json();
    },
    onSuccess: () => {
      setIsTraining(true);
      queryClient.invalidateQueries({ queryKey: ["/api/akkio/models"] });
    },
    onError: (error) => {
      console.error("Failed to start training:", error);
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ready
          </Badge>
        );
      case "training":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Training
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  // Check if any model is currently training
  React.useEffect(() => {
    const hasTrainingModel = models.some((model: AkkioModel) => model.status === "training");
    setIsTraining(hasTrainingModel);
  }, [models]);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Brain className="h-8 w-8 text-orange-600" />
            <div>
              <h1 className="text-3xl font-bold">Akkio Model Management</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage payment prediction models powered by Akkio
              </p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-6 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader>
          <CardTitle>Model Overview</CardTitle>
          <CardDescription>
            Train and manage machine learning models for payment method prediction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {models.length} model{models.length !== 1 ? 's' : ''} available
            </div>
            <Button
              onClick={() => trainModelMutation.mutate()}
              disabled={trainModelMutation.isPending || isTraining}
              className="btn-hover-lift bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white"
            >
              {trainModelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Training...
                </>
              ) : isTraining ? (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  Training in Progress
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Train New Model
                </>
              )}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600 dark:text-red-400">
              Failed to load models. Please try again.
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              No models available. Train your first model to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Training Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model: AkkioModel) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">
                      {model.name}
                      {models[0]?.id === model.id && model.status === "ready" && (
                        <Badge className="ml-2 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(model.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(model.created_at), "MMM d, yyyy h:mm a")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {model.accuracy ? (
                        <div className="flex items-center gap-1">
                          <div className="text-sm font-medium">
                            {(model.accuracy * 100).toFixed(1)}%
                          </div>
                          <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${model.accuracy * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {model.training_duration ? (
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-3 w-3" />
                          {model.training_duration < 60
                            ? `${model.training_duration}s`
                            : `${Math.round(model.training_duration / 60)}m`}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {isTraining && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">
                  Model training in progress. This may take a few minutes...
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About Akkio Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Payment Method Prediction</h3>
            <p>Akkio models analyze payee characteristics and historical data to predict the most likely payment method (ACH, Check, Card, etc.).</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Training Process</h3>
            <p>Models are trained on your classification data with enrichment results. The system automatically selects the most recent ready model for predictions.</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Integration</h3>
            <p>Akkio runs as the final enrichment step after all other data sources (Finexio, Mastercard, Address Validation) have completed.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}