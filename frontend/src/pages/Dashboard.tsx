import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, ClipboardList, FileBarChart, AlertTriangle,
  Plus, ArrowRight, BarChart3, PieChart as PieIcon, Bot, Send,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useReferenceData } from "@/hooks/useReferenceData";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, ComposedChart, Bar,
} from "recharts";

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PIPELINE_URL =
  (import.meta.env.VITE_PIPELINE_URL as string) || "https://vsa-pipeline.azurewebsites.net";

const INITIAL_CHAT: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi! I'm your AI procurement analyst. I can help you understand your supplier portfolio, explain risk scores, or give opinions on specific vendors. What would you like to know?",
  },
];


const statIcons = [Building2, ClipboardList, FileBarChart, AlertTriangle];

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-[hsl(var(--risk-low))]";
  if (score >= 50) return "text-[hsl(var(--risk-medium))]";
  if (score >= 25) return "text-[hsl(var(--risk-high))]";
  return "text-[hsl(var(--risk-critical))]";
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm p-3 text-xs"
      style={{ boxShadow: "0 8px 32px -4px hsl(263 100% 6% / 0.25)" }}
    >
      {label && <p className="font-semibold text-foreground mb-2">{label}</p>}
      <div className="space-y-1.5">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color || p.fill }}
            />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-semibold ml-auto pl-3">
              {typeof p.value === "number"
                ? p.name === "Avg Score"
                  ? p.value.toFixed(1)
                  : p.value
                : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, isPlebian } = useAuth();
  const { prompts: suggestedPrompts } = useReferenceData();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [recent, setRecent] = useState<EvalListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;

    if (!overrideText) setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const res = await fetch(`${PIPELINE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            stats,
            recentEvaluations: recent.map((e) => ({
              company_name: e.company_name,
              ico: e.ico,
              status: e.status,
              overall_score: e.overall_score,
              overall_risk_level: e.overall_risk_level,
              modules_completed: e.modules_completed,
              module_count: e.module_count,
            })),
          },
          // Send history excluding the hardcoded greeting, capped at 10 entries
          history: chatMessages.slice(1).slice(-10),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't reach the analyst service. Please try again in a moment." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const statCards = stats
    ? [
        { title: "Total Suppliers", value: stats.total_suppliers, accent: false },
        { title: "Active Evaluations", value: stats.active_evaluations, accent: true },
        { title: "Completed Reports", value: stats.completed_evaluations, accent: false },
        { title: "Avg Score", value: stats.avg_score != null ? Math.round(stats.avg_score) : "—", accent: false },
      ]
    : [];

  const riskDistribution = stats
    ? [
        { name: "Low",      value: stats.low_risk_count,      fill: "#22c55e", gradId: "gradPieLow"      },
        { name: "Medium",   value: stats.medium_risk_count,   fill: "#eab308", gradId: "gradPieMedium"   },
        { name: "High",     value: stats.high_risk_count,     fill: "#f97316", gradId: "gradPieHigh"     },
        { name: "Critical", value: stats.critical_risk_count, fill: "#ef4444", gradId: "gradPieCritical" },
      ].filter((r) => r.value > 0)
    : [];

  const totalRisk = riskDistribution.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      {/* Welcome */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {profile?.full_name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here's an overview of your supplier evaluations.
          </p>
        </div>
        <Button
          onClick={() => navigate("/evaluations/new")}
          className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 hidden sm:flex shrink-0"
        >
          <Plus className="h-4 w-4" /> New Evaluation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="gradient-card border-border/50 overflow-hidden">
                <CardContent className="p-5">
                  <Skeleton className="h-9 w-9 rounded-lg mb-4" />
                  <Skeleton className="h-8 w-16 mb-1.5" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))
          : statCards.map((stat, i) => {
              const Icon = statIcons[i];
              return (
                <Card
                  key={stat.title}
                  className={`gradient-card border-border/50 overflow-hidden relative ${
                    stat.accent ? "glow-accent border-accent/30" : ""
                  }`}
                >
                  {stat.accent && (
                    <div className="absolute inset-x-0 top-0 h-px gradient-accent" />
                  )}
                  <CardContent className="p-5">
                    <div className={`inline-flex rounded-lg p-2 mb-3 ${stat.accent ? "bg-accent/10" : "bg-muted/60"}`}>
                      <Icon className={`h-5 w-5 ${stat.accent ? "text-accent" : "text-muted-foreground"}`} />
                    </div>
                    <p className="text-3xl font-bold tracking-tight tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.title}</p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Evaluations Over Time */}
        <Card className="lg:col-span-4 gradient-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 bg-accent/10">
                <BarChart3 className="h-3.5 w-3.5 text-accent" />
              </div>
              <CardTitle className="text-sm font-semibold">Evaluations Over Time</CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground">Last 12 months</span>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-[240px] w-full rounded-lg" />
            ) : monthly.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                No evaluation data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={monthly} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(197 76% 58%)" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="hsl(197 76% 58%)" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="2 4"
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    dy={6}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="total_evaluations"
                    fill="url(#barGrad)"
                    radius={[5, 5, 0, 0]}
                    name="Evaluations"
                    maxBarSize={36}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avg_score"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#22c55e", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                    name="Avg Score"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Risk Distribution */}
        <Card className="lg:col-span-3 gradient-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 bg-accent/10">
                <PieIcon className="h-3.5 w-3.5 text-accent" />
              </div>
              <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-lg" />
            ) : riskDistribution.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                No risk data yet
              </div>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <defs>
                        {riskDistribution.map((r) => (
                          <linearGradient key={r.gradId} id={r.gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={r.fill} stopOpacity={0.95} />
                            <stop offset="100%" stopColor={r.fill} stopOpacity={0.4}  />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={82}
                        paddingAngle={4}
                        dataKey="value"
                        strokeWidth={0}
                        cornerRadius={15}
                      >
                        {riskDistribution.map((entry, i) => (
                          <Cell key={i} fill={`url(#${entry.gradId})`} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums">{totalRisk}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Evaluated</div>
                    </div>
                  </div>
                </div>
                {/* Legend pills */}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {riskDistribution.map((r) => (
                    <div
                      key={r.name}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: r.fill + "22", color: r.fill }}
                    >
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.fill }} />
                      {r.name} · {r.value}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Analyst Chat — hidden for plebian role */}
      {!isPlebian && <Card className="gradient-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1.5 bg-accent/10">
              <Bot className="h-3.5 w-3.5 text-accent" />
            </div>
            <CardTitle className="text-sm font-semibold">AI Analyst</CardTitle>
            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium leading-none">
              Beta
            </span>
          </div>
          {chatMessages.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 -mr-2"
              onClick={() => setChatMessages(INITIAL_CHAT)}
            >
              Clear chat
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {/* Message list */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scroll-smooth">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent/15 text-foreground rounded-tr-sm"
                      : "bg-muted/50 text-foreground rounded-tl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-3.5 py-3">
                  <div className="flex gap-1 items-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Suggested prompts — only before first user message */}
          {chatMessages.length === 1 && !chatLoading && (
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => sendMessage(p.prompt)}
                  className="text-xs rounded-full border border-border/60 px-3 py-1.5 text-muted-foreground hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-colors"
                >
                  {p.prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask about your suppliers or portfolio…"
              disabled={chatLoading}
              className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50 transition-all"
            />
            <Button
              size="sm"
              onClick={() => sendMessage()}
              disabled={!chatInput.trim() || chatLoading}
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl h-9 w-9 p-0 flex-shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* Recent Evaluations */}
      <Card className="gradient-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Recent Evaluations</CardTitle>
          {recent.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-accent gap-1 -mr-2 h-7"
              onClick={() => navigate("/evaluations")}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No evaluations yet. Start your first supplier assessment!</p>
              <Button onClick={() => navigate("/evaluations/new")} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Plus className="h-4 w-4" /> New Evaluation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {["Supplier", "IČO", "Date", "Status", "Score", "Risk", "Modules"].map((h) => (
                      <th key={h} className="text-left py-2.5 pr-4 last:pr-0 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b border-border/40 last:border-0 hover:bg-accent/5 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/evaluations/${ev.id}`)}
                    >
                      <td className="py-3 pr-4 font-medium group-hover:text-accent transition-colors">{ev.company_name}</td>
                      <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{ev.ico ?? "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleDateString()}</td>
                      <td className="py-3 pr-4"><StatusBadge status={ev.status} /></td>
                      <td className="py-3 pr-4">
                        {ev.overall_score !== null ? (
                          <span className={`font-semibold tabular-nums ${scoreColor(ev.overall_score)}`}>{ev.overall_score}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4"><RiskBadge level={ev.overall_risk_level} /></td>
                      <td className="py-3 text-muted-foreground text-xs tabular-nums">{ev.modules_completed}/{ev.module_count}</td>
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
