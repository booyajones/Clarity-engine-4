import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Upload", href: "/" },
  { name: "Classifications", href: "/classifications" },
  { name: "Downloads", href: "/downloads" },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-48 bg-white border-r flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-blue-500 rounded"></div>
          <span className="font-medium">Clarity</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => (
          <Link key={item.name} href={item.href}>
            <div
              className={cn(
                "px-3 py-2 rounded text-sm cursor-pointer",
                location === item.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {item.name}
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
