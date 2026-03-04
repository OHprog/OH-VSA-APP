import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ClipboardList, FileBarChart, AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Line, ComposedChart } from "recharts";

interface DashboardStats {
  total_suppliers: number;
  active_evaluations: number;
  completed_evaluations: number;
  avg_score: number;
  low_risk_count: number;
  medium_risk_count: number;
  high_risk_count: number;
  critical_risk_count: number;
}

interface MonthlyStats {
  month: string;
  total_evaluations: number;
  avg_score: number;
}

interface EvalListItem {
  id: string;
  supplier_id: string;
  company_name: string;
  ico: string | null;
  status: string;
  overall_score: number | null;
  overall_risk_level: string | null;
  created_at: string;
  module_count: number;
  modules_completed: number;
}

const statIcons = [Building2, ClipboardList, FileBarChart, AlertTriangle];

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-[hsl(var(--risk-low))]";
  if (score >= 50) return "text-[hsl(var(--risk-medium))]";
  if (score >= 25) return "text-[hsl(var(--risk-high))]";
  return "text-[hsl(var(--risk-critical))]";
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [recent, setRecent] = useState<EvalListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, monthlyRes, recentRes] = await Promise.all([
          supabase.from("dashboard_stats").select("*").maybeSingle(),
          supabase.rpc("get_monthly_evaluation_stats", { p_months: 12 }),
          supabase.from("evaluation_list").select("*").order("created_at", { ascending: false }).limit(10),
        ]);

        if (statsRes.error) throw statsRes.error;
        if (monthlyRes.error) throw monthlyRes.error;
        if (recentRes.error) throw recentRes.error;

        setStats(statsRes.data as DashboardStats);
        setMonthly((monthlyRes.data as MonthlyStats[]) ?? []);
        setRecent((recentRes.data as EvalListItem[]) ?? []);
      } catch (err: any) {
        toast({ title: "Error loading dashboard", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [toast]);

  const statCards = stats
    ? [
        { title: "Total Suppliers", value: stats.total_suppliers, accent: false },
        { title: "Active Evaluations", value: stats.active_evaluations, accent: true },
        { title: "Completed Reports", value: stats.completed_evaluations, accent: false },
        { title: "Avg Score", value: stats.avg_score, accent: false },
      ]
    : [];

  const riskDistribution = stats
    ? [
        { name: "Low", value: stats.low_risk_count, fill: "#22c55e" },
        { name: "Medium", value: stats.medium_risk_count, fill: "#eab308" },
        { name: "High", value: stats.high_risk_count, fill: "#f97316" },
        { name: "Critical", value: stats.critical_risk_count, fill: "#ef4444" },
      ].filter((r) => r.value > 0)
    : [];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Welcome */}
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {profile?.full_name?.split(" ")[0] || "User"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here's an overview of your supplier evaluations.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="gradient-card border-border/50">
                <CardContent className="flex items-center gap-4 p-5">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))
          : statCards.map((stat, i) => {
              const Icon = statIcons[i];
              return (
                <Card key={stat.title} className={`gradient-card border-border/50 ${stat.accent ? "glow-accent border-accent/30" : ""}`}>
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className={`rounded-lg p-2.5 ${stat.accent ? "bg-accent/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${stat.accent ? "text-accent" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.title}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Evaluations Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : monthly.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No evaluation data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar yAxisId="left" dataKey="total_evaluations" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Evaluations" />
                  <Line yAxisId="right" type="monotone" dataKey="avg_score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Avg Score" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : riskDistribution.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No risk data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                    {riskDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
          {riskDistribution.length > 0 && (
            <div className="px-6 pb-4 flex flex-wrap gap-3">
              {riskDistribution.map((r) => (
                <div key={r.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.fill }} />
                  <span className="text-muted-foreground">{r.name} ({r.value})</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Evaluations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-muted-foreground">No evaluations yet. Start your first supplier assessment!</p>
              </div>
              <Button onClick={() => navigate("/evaluations/new")} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Plus className="h-4 w-4" /> New Evaluation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-3 font-medium">Supplier</th>
                    <th className="text-left pb-3 font-medium">IČO</th>
                    <th className="text-left pb-3 font-medium">Date</th>
                    <th className="text-left pb-3 font-medium">Status</th>
                    <th className="text-left pb-3 font-medium">Score</th>
                    <th className="text-left pb-3 font-medium">Risk</th>
                    <th className="text-left pb-3 font-medium">Modules</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/evaluations/${ev.id}`)}
                    >
                      <td className="py-3 font-medium">{ev.company_name}</td>
                      <td className="py-3 text-muted-foreground font-mono text-xs">{ev.ico}</td>
                      <td className="py-3 text-muted-foreground">{new Date(ev.created_at).toLocaleDateString()}</td>
                      <td className="py-3"><StatusBadge status={ev.status} /></td>
                      <td className="py-3">
                        {ev.overall_score !== null ? (
                          <span className={`font-semibold ${scoreColor(ev.overall_score)}`}>{ev.overall_score}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3"><RiskBadge level={ev.overall_risk_level} /></td>
                      <td className="py-3 text-muted-foreground text-xs">{ev.modules_completed}/{ev.module_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
