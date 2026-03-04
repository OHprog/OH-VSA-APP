import { Badge } from "@/components/ui/badge";
import { getRiskBgClass } from "@/data/mockData";

export function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <Badge variant="outline">Pending</Badge>;
  return (
    <Badge className={`${getRiskBgClass(level)} border font-medium text-xs`} variant="outline">
      {level}
    </Badge>
  );
}
