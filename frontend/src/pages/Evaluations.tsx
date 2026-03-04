import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardList, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

interface EvalListItem {
  id: string;
  company_name: string;
  ico: string | null;
  status: string;
  overall_score: number | null;
  overall_risk_level: string | null;
  created_at: string;
  module_count: number;
  modules_completed: number;
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-[#22c55e]";
  if (score >= 50) return "text-[#eab308]";
  if (score >= 25) return "text-[#f97316]";
  return "text-[#ef4444]";
}

export default function Evaluations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isAnalyst } = useAuth();
  const canCreate = isAdmin || isAnalyst;

  const [items, setItems] = useState<EvalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("evaluation_list")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (riskFilter !== "all") query = query.eq("overall_risk_level", riskFilter);
      if (search.trim()) query = query.ilike("company_name", `%${search.trim()}%`);

      const offset = page * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      setItems((data as EvalListItem[]) ?? []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, riskFilter, search, toast]);

  useEffect(() => {
    const timeout = setTimeout(fetchEvaluations, 300);
    return () => clearTimeout(timeout);
  }, [fetchEvaluations]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, riskFilter, search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluations</h1>
          <p className="text-sm text-muted-foreground mt-1">All supplier evaluations</p>
        </div>
        {canCreate && (
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2" onClick={() => navigate("/evaluations/new")}>
            <Plus className="h-4 w-4" /> New Evaluation
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Risk Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-4 font-medium">Supplier</th>
                  <th className="text-left p-4 font-medium">IČO</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Score</th>
                  <th className="text-left p-4 font-medium">Risk</th>
                  <th className="text-left p-4 font-medium">Modules</th>
                  <th className="text-left p-4 font-medium">Created</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-4"><Skeleton className="h-4 w-16" /></td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">No evaluations found</p>
                      {canCreate && (
                        <Button variant="outline" className="mt-3 gap-2" onClick={() => navigate("/evaluations/new")}>
                          <Plus className="h-4 w-4" /> Create First Evaluation
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  items.map((ev) => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/evaluations/${ev.id}`)}>
                      <td className="p-4 font-medium">{ev.company_name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{ev.ico}</td>
                      <td className="p-4"><StatusBadge status={ev.status} /></td>
                      <td className="p-4">
                        {ev.overall_score !== null ? (
                          <span className={`font-semibold ${scoreColor(ev.overall_score)}`}>{ev.overall_score}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4"><RiskBadge level={ev.overall_risk_level} /></td>
                      <td className="p-4 text-muted-foreground text-xs">{ev.modules_completed}/{ev.module_count}</td>
                      <td className="p-4 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        <button className="text-xs text-accent hover:underline font-medium" onClick={(e) => { e.stopPropagation(); navigate(`/evaluations/${ev.id}`); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
