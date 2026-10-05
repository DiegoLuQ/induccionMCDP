import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
}

const TONES = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <Icon className={cn("h-5 w-5 shrink-0", TONES[tone])} aria-hidden />
      </CardContent>
    </Card>
  );
}
