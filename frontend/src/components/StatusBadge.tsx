import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

const statusConfig: Record<string, { icon: typeof Clock; className: string; label: string }> = {
  pending: { icon: Clock, className: "bg-muted text-muted-foreground", label: "Pending" },
  queued: { icon: Clock, className: "bg-muted text-muted-foreground", label: "Queued" },
  running: { icon: Loader2, className: "bg-accent/10 text-accent border-accent/20", label: "Running" },
  completed: { icon: CheckCircle2, className: "bg-risk-low/10 text-risk-low border-risk-low/20", label: "Completed" },
  failed: { icon: XCircle, className: "bg-risk-critical/10 text-risk-critical border-risk-critical/20", label: "Failed" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.className} border gap-1`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  );
}
