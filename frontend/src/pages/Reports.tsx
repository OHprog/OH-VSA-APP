import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RiskBadge } from "@/components/RiskBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Download, FileBarChart, FileText, Loader2, Search } from "lucide-react";

interface ReportRow {
  id: string;
  evaluation_id: string;
  file_url: string | null;
  generated_at: string;
  evaluations: {
    supplier_id: string;
    overall_score: number | null;
    overall_risk_level: string | null;
    suppliers: {
      company_name: string;
      ico: string | null;
    };
  };
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-[#22c55e]";
  if (score >= 50) return "text-[#eab308]";
  if (score >= 25) return "text-[#f97316]";
  return "text-[#ef4444]";
}

export default function Reports() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  useEffect(() => {
    async function fetch() {
      try {
        const { data, error } = await supabase
          .from("reports")
          .select(`
            *,
            evaluations!inner (
              supplier_id,
              overall_score,
              overall_risk_level,
              suppliers!inner ( company_name, ico )
            )
          `)
          .order("generated_at", { ascending: false });
        if (error) throw error;
        setReports((data as unknown as ReportRow[]) ?? []);
      } catch (err: any) {
        toast({ title: "Error loading reports", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [toast]);

  const handleDownload = async (fileUrl: string) => {
    try {
      const { data, error } = await supabase.storage.from("reports").download(fileUrl);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileUrl.replace(/^.*\//, "");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download error", description: err.message, variant: "destructive" });
    }
  };

  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = async (reportId: string) => {
    setGenerating(reportId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { report_id: reportId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Update local state with new file_url
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, file_url: data.file_url } : r))
      );
      toast({ title: "Report generated", description: "Your report is ready for download." });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const filtered = reports.filter((r) => {
    const name = r.evaluations.suppliers.company_name.toLowerCase();
    const matchSearch = !search.trim() || name.includes(search.toLowerCase());
    const matchRisk = riskFilter === "all" || r.evaluations.overall_risk_level === riskFilter;
    return matchSearch && matchRisk;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Generated evaluation reports</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
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
                  <th className="text-left p-4 font-medium">Score</th>
                  <th className="text-left p-4 font-medium">Risk Level</th>
                  <th className="text-left p-4 font-medium">Generated</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-4"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <FileBarChart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        {reports.length === 0
                          ? "No reports generated yet. Complete an evaluation and generate a report from the evaluation detail page."
                          : "No reports match your filters."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{r.evaluations.suppliers.company_name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{r.evaluations.suppliers.ico}</td>
                      <td className="p-4">
                        {r.evaluations.overall_score !== null ? (
                          <span className={`font-semibold ${scoreColor(r.evaluations.overall_score)}`}>{r.evaluations.overall_score}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4"><RiskBadge level={r.evaluations.overall_risk_level} /></td>
                      <td className="p-4 text-muted-foreground">{new Date(r.generated_at).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        {r.file_url ? (
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleDownload(r.file_url!)}>
                            <Download className="h-3.5 w-3.5" /> PDF
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={generating === r.id}
                            onClick={() => handleGenerate(r.id)}
                          >
                            {generating === r.id ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                            ) : (
                              <><FileText className="h-3.5 w-3.5" /> Generate</>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
