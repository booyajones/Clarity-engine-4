import { Card, CardContent } from "@/components/ui/card";
import type { ClassificationStats } from "@/lib/types";

interface KpiCardsProps {
  stats: ClassificationStats;
}

export default function KpiCards({ stats }: KpiCardsProps) {
  const cards = [
    {
      title: "Total Payees",
      value: stats.totalPayees.toLocaleString(),
      change: "+12% from last month",
      icon: "fas fa-users",
      bgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      changeColor: "text-success-600"
    },
    {
      title: "AI Accuracy",
      value: `${stats.accuracy.toFixed(1)}%`,
      change: "+2.1% improvement",
      icon: "fas fa-bullseye",
      bgColor: "bg-success-100",
      iconColor: "text-success-600",
      changeColor: "text-success-600"
    },
    {
      title: "Pending Review",
      value: stats.pendingReview.toLocaleString(),
      change: "Requires attention",
      icon: "fas fa-exclamation-triangle",
      bgColor: "bg-warning-100",
      iconColor: "text-warning-600",
      changeColor: "text-warning-600"
    },
    {
      title: "Files Processed",
      value: stats.filesProcessed.toLocaleString(),
      change: "This month",
      icon: "fas fa-file-alt",
      bgColor: "bg-gray-100",
      iconColor: "text-gray-600",
      changeColor: "text-gray-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => (
        <Card key={index} className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                <p className={`text-sm mt-1 ${card.changeColor}`}>
                  <i className="fas fa-arrow-up text-xs mr-1"></i>
                  {card.change}
                </p>
              </div>
              <div className={`w-12 h-12 ${card.bgColor} rounded-xl flex items-center justify-center`}>
                <i className={`${card.icon} ${card.iconColor} text-lg`}></i>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
