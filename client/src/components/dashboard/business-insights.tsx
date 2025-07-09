import { Card, CardContent } from "@/components/ui/card";
import type { BusinessCategory, ActivityItem } from "@/lib/types";

interface BusinessInsightsProps {
  categories: BusinessCategory[];
  activities: ActivityItem[];
}

export default function BusinessInsights({ categories, activities }: BusinessInsightsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Business Categories</h3>
          
          <div className="space-y-4">
            {categories.map((category, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{category.name}</p>
                    <span className="text-sm text-gray-600">{category.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${category.color}`}
                      style={{ width: `${category.percentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Processing Activity</h3>
          
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center space-x-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  activity.type === "success" ? "bg-success-500" :
                  activity.type === "warning" ? "bg-warning-500" :
                  activity.type === "error" ? "bg-error-500" :
                  "bg-primary-500"
                }`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900" dangerouslySetInnerHTML={{ __html: activity.description }}></p>
                  <p className="text-xs text-gray-500">{activity.details}</p>
                </div>
                <p className="text-xs text-gray-500 flex-shrink-0">{activity.time}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all activity
              <i className="fas fa-arrow-right ml-1 text-xs"></i>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
