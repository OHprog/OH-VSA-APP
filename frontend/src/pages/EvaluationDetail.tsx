import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { moduleTypes } from "@/data/mockData";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, RefreshCw, ChevronDown, ExternalLink, CheckCircle2, XCircle, Loader2, Clock, Code } from "lucide-react";
import { useState, useEffect } from "react";

interface EvalModule {
  id: string;
  module_type: string;
  status: string;
  score: number | null;
  risk_level: string | null;
  summary: string | null;
  findings: any[] | null;
  sources: any[] | null;
  raw_data: any | null;
  started_at: string | null;
  completed_at: string | null;
}

interface EvalData {
  id: string;
  supplier_id: string;
  company_name: string;
  ico: string | null;
  sector: string | null;
  status: string;
  overall_score: number | null;
  overall_risk_level: string | null;
  executive_summary: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

function scoreColorClass(score: number | null) {
  if (score === null) return "bg-muted-foreground";
  if (score >= 75) return "bg-[#22c55e]";
  if (score >= 50) return "bg-[#eab308]";
  if (score >= 25) return "bg-[#f97316]";
  return "bg-[#ef4444]";
}

function scoreTextClass(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-[#22c55e]";
  if (score >= 50) return "text-[#eab308]";
  if (score >= 25) return "text-[#f97316]";
  return "text-[#ef4444]";
}

function ModuleStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-[#22c55e]" />;
    case "running": return <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />;
    case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function EvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin, isAnalyst } = useAuth();

  const [evaluation, setEvaluation] = useState<EvalData | null>(null);
  const [modules, setModules] = useState<EvalModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFindings, setExpandedFindings] = useState<string | null>(null);
  const [expandedRaw, setExpandedRaw] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function fetch() {
      try {
        const { data, error } = await supabase.rpc("get_evaluation_detail", { p_evaluation_id: id });
        if (error) throw error;
        if (!data) throw new Error("Evaluation not found");
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        setEvaluation(parsed.evaluation);
        setModules(parsed.modules ?? []);
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id, toast]);

  // Realtime subscription for running evaluations
  useEffect(() => {
    if (!id || !evaluation) return;
    if (evaluation.status === "completed" || evaluation.status === "failed") return;

    const channel = supabase
      .channel(`evaluation-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "evaluation_modules",
        filter: `evaluation_id=eq.${id}`,
      }, (payload) => {
        setModules((prev) =>
          prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
        );
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "evaluations",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setEvaluation((prev) => prev ? { ...prev, ...payload.new as any } : prev);
        if (payload.new.status === "completed" || payload.new.status === "failed") {
          supabase.removeChannel(channel);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, evaluation?.status]);

  const handleGenerateReport = async () => {
    if (!evaluation || !user) return;
    setGeneratingReport(true);
    try {
      const { error } = await supabase.rpc("create_report", {
        p_evaluation_id: evaluation.id,
      });
      if (error) throw error;
      toast({ title: "Report generation queued", description: "It will appear in the Reports page." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Evaluation not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/evaluations")}>Back to Evaluations</Button>
      </div>
    );
  }

  const completedOrFailed = modules.filter((m) => m.status === "completed" || m.status === "failed").length;
  const totalModules = modules.length;
  const progressPercent = totalModules > 0 ? (completedOrFailed / totalModules) * 100 : 0;
  const isRunning = evaluation.status === "pending" || evaluation.status === "running";
  const isCompleted = evaluation.status === "completed";
  const canEdit = isAdmin || isAnalyst;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h1 className="text-2xl font-bold">{evaluation.company_name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {evaluation.ico && <Badge variant="secondary" className="font-mono text-xs">IČO: {evaluation.ico}</Badge>}
            {evaluation.sector && <Badge variant="outline" className="text-xs">{evaluation.sector}</Badge>}
            <span>· {new Date(evaluation.created_at).toLocaleDateString()}</span>
            {evaluation.completed_at && <span>· Completed {new Date(evaluation.completed_at).toLocaleDateString()}</span>}
          </div>
        </div>
        <StatusBadge status={evaluation.status} />
      </div>

      {/* Progress (when running/pending) */}
      {isRunning && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Module Progress</span>
              <span className="text-xs text-muted-foreground">{completedOrFailed} of {totalModules} completed</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex flex-wrap gap-2 mt-4">
              {modules.map((mod) => {
                const modInfo = moduleTypes.find((m) => m.key === mod.module_type);
                return (
                  <Badge key={mod.id} variant="outline" className="gap-1.5 text-xs">
                    <ModuleStatusIcon status={mod.status} />
                    {modInfo?.icon} {modInfo?.name}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Results */}
      {(isCompleted || modules.some((m) => m.status === "completed")) && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="sm:row-span-2 flex flex-col items-center justify-center p-6">
              <ScoreGauge score={evaluation.overall_score} size={140} />
              <div className="mt-3"><RiskBadge level={evaluation.overall_risk_level} /></div>
            </Card>
            <Card className="sm:col-span-2">
              <CardHeader><CardTitle className="text-sm font-medium">Executive Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {evaluation.executive_summary || "AI summary will be generated when all modules complete."}
                </p>
              </CardContent>
            </Card>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {canEdit && isCompleted && (
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2" onClick={handleGenerateReport} disabled={generatingReport}>
                  <FileText className="h-4 w-4" /> {generatingReport ? "Queueing..." : "Generate PDF Report"}
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={() => navigate("/evaluations/new")}>
                <RefreshCw className="h-4 w-4" /> Re-run Evaluation
              </Button>
              <Button variant="ghost" onClick={() => navigate("/evaluations")}>Back to Evaluations</Button>
            </div>
          </div>
        </>
      )}

      {/* Module Results */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Module Results</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {modules.map((mod) => {
            const modInfo = moduleTypes.find((mt) => mt.key === mod.module_type);
            const isExpanded = expandedFindings === mod.id;
            const isRawExpanded = expandedRaw === mod.id;
            const findings = Array.isArray(mod.findings) ? mod.findings : [];
            const sources = Array.isArray(mod.sources) ? mod.sources : [];

            // Running module
            if (mod.status === "running") {
              return (
                <Card key={mod.id} className="border-accent/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{modInfo?.icon}</span>
                      <span className="font-medium text-sm">{modInfo?.name}</span>
                      <Loader2 className="h-4 w-4 animate-spin text-accent ml-auto" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <p className="text-xs text-accent">Analysis in progress...</p>
                  </CardContent>
                </Card>
              );
            }

            // Queued module
            if (mod.status === "queued") {
              return (
                <Card key={mod.id} className="opacity-50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{modInfo?.icon}</span>
                      <span className="font-medium text-sm">{modInfo?.name}</span>
                      <Clock className="h-4 w-4 text-muted-foreground ml-auto" />
                    </div>
                    <p className="text-xs text-muted-foreground">Waiting in queue...</p>
                  </CardContent>
                </Card>
              );
            }

            // Failed module
            if (mod.status === "failed") {
              return (
                <Card key={mod.id} className="border-destructive/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{modInfo?.icon}</span>
                      <span className="font-medium text-sm">{modInfo?.name}</span>
                      <XCircle className="h-4 w-4 text-destructive ml-auto" />
                    </div>
                    <p className="text-xs text-destructive">Module analysis failed</p>
                    {mod.summary && <p className="text-xs text-muted-foreground">{mod.summary}</p>}
                  </CardContent>
                </Card>
              );
            }

            // Completed module
            return (
              <Card key={mod.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{modInfo?.icon}</span>
                      <span className="font-medium text-sm">{modInfo?.name}</span>
                      {mod.score !== null && (
                        <span className={`text-sm font-bold ${scoreTextClass(mod.score)}`}>{mod.score}</span>
                      )}
                    </div>
                    <RiskBadge level={mod.risk_level} />
                  </div>

                  {/* Score bar */}
                  {mod.score !== null && (
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${scoreColorClass(mod.score)} transition-all duration-700`} style={{ width: `${mod.score}%` }} />
                    </div>
                  )}

                  {mod.summary && <p className="text-xs text-muted-foreground">{mod.summary}</p>}

                  {/* Findings */}
                  {findings.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium">Key Findings</p>
                      {findings.slice(0, isExpanded ? undefined : 3).map((f: any, i: number) => {
                        const finding = typeof f === "string" ? { title: f } : f;
                        return (
                          <div key={i} className="text-xs flex gap-2 items-start">
                            <span className="text-accent mt-0.5">•</span>
                            <div>
                              {finding.title && <span className="font-medium">{finding.title}</span>}
                              {finding.description && <span className="text-muted-foreground"> — {finding.description}</span>}
                              {finding.source && <span className="text-muted-foreground/60 text-[10px]"> ({finding.source})</span>}
                            </div>
                          </div>
                        );
                      })}
                      {findings.length > 3 && (
                        <button onClick={() => setExpandedFindings(isExpanded ? null : mod.id)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                          <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          {isExpanded ? "Show less" : `Show ${findings.length - 3} more`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Sources */}
                  {sources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Sources</p>
                      <div className="flex flex-wrap gap-1">
                        {sources.map((s: any, i: number) => {
                          const source = typeof s === "string" ? { name: s } : s;
                          return source.url ? (
                            <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-accent">
                              {source.name} <ExternalLink className="h-2.5 w-2.5" />
                              {source.type && <Badge variant="secondary" className="text-[8px] px-1 py-0 ml-0.5">{source.type}</Badge>}
                            </a>
                          ) : (
                            <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                              {source.name}
                              {source.type && <span className="text-muted-foreground">({source.type})</span>}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Raw Data Toggle */}
                  {mod.raw_data && Object.keys(mod.raw_data).length > 0 && (
                    <Collapsible open={isRawExpanded} onOpenChange={(open) => setExpandedRaw(open ? mod.id : null)}>
                      <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                        <Code className="h-3 w-3" />
                        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isRawExpanded ? "rotate-180" : ""}`} />
                        View Raw Data
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 p-2 rounded bg-muted text-[10px] overflow-auto max-h-48 font-mono">
                          {JSON.stringify(mod.raw_data, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
