import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

interface ClassificationChartProps {
  data: {
    business: number;
    individual: number;
    government: number;
  };
}

export default function ClassificationChart({ data }: ClassificationChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Business", "Individual", "Government"],
        datasets: [{
          data: [data.business, data.individual, data.government],
          backgroundColor: [
            "hsl(214, 84%, 56%)", // primary-500
            "hsl(160, 84%, 39%)", // success-500
            "hsl(43, 96%, 56%)"   // warning-500
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        cutout: "60%"
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data]);

  return (
    <Card className="lg:col-span-2 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Classification Breakdown</h3>
          <div className="flex items-center space-x-2">
            <select className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white">
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Last year</option>
            </select>
          </div>
        </div>
        
        <div className="relative h-48">
          <canvas ref={chartRef}></canvas>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="w-3 h-3 bg-primary-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-gray-900">{data.business.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Business</p>
          </div>
          <div className="text-center">
            <div className="w-3 h-3 bg-success-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-gray-900">{data.individual.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Individual</p>
          </div>
          <div className="text-center">
            <div className="w-3 h-3 bg-warning-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-gray-900">{data.government.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Government</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
