import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Database, Activity, UserPlus, Copy, Check, Pencil, Plus,
  AlertCircle, CheckCircle2, Circle, ExternalLink, Server, Zap, Cloud, Loader2, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────
interface ProfileWithRole {
  id: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  role: string;
}

interface DataSource {
  id: string;
  name: string;
  module_type: string;
  source_type: string;
  base_url: string | null;
  status: string;
  last_error: string | null;
  last_sync_at: string | null;
  schedule_cron: string | null;
  is_free: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiUsageRow {
  service: string;
  endpoint: string | null;
  request_count: number;
  tokens_used: number;
  cost_estimate: number;
  date: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user_name: string | null;
}

interface ServiceHealth {
  name: string;
  subtitle: string;
  status: "ok" | "error" | "checking" | "unknown";
  icon: React.ElementType;
  detail?: string;
}

interface FirecrawlCredits {
  account: {
    remaining_credits: number;
    plan_credits: number;
    billing_period_start: string | null;
    billing_period_end: string | null;
  } | null;
  last_30_days: {
    total_runs: number;
    total_sources: number;
    total_articles_found: number;
    total_articles_stored: number;
    completed: number;
    failed: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────
const MODULE_LABELS: Record<string, string> = {
  financial: "Financial",
  compliance: "Compliance",
  sanctions: "Sanctions",
  market: "Market",
  esg: "ESG",
  cyber: "Cyber",
  internal: "Internal",
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  api: "bg-accent/10 text-accent border-accent/20",
  scrape: "bg-risk-high/10 text-risk-high border-risk-high/20",
  file: "bg-muted text-muted-foreground border-border",
  manual: "bg-risk-low/10 text-risk-low border-risk-low/20",
};

function cronToHuman(cron: string | null): string {
  if (!cron) return "Manual";
  const parts = cron.split(" ");
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dom !== "*" && dom === "1") return `Monthly at ${hour}:${min.padStart(2, "0")}`;
  if (dow !== "*" && dow === "1") return `Weekly Mon ${hour}:${min.padStart(2, "0")}`;
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)}h`;
  if (hour !== "*") return `Daily at ${hour}:${min.padStart(2, "0")}`;
  return cron;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/10 text-primary border-primary/20",
  analyst: "bg-accent/10 text-accent border-accent/20",
  viewer: "bg-muted text-muted-foreground border-border",
  plebian: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

const SERVICE_COLORS: Record<string, string> = {
  aiml: "hsl(263, 100%, 28%)",
  firecrawl: "hsl(25, 95%, 53%)",
  crif: "hsl(197, 76%, 58%)",
  google: "hsl(142, 71%, 45%)",
  openai: "hsl(0, 84%, 60%)",
};

function formatAction(action: string): string {
  const parts = action.split(".");
  if (parts.length === 2) {
    return `${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)} ${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)}`;
  }
  return action;
}

// ─── Component ───────────────────────────────────────────
export default function Admin() {
  const { user, profile, isAdmin, isAnalyst } = useAuth();
  const { toast } = useToast();

  // Users tab state
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ProfileWithRole | null>(null);
  const [newRole, setNewRole] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  // Data Sources tab state
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [editSource, setEditSource] = useState<DataSource | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);

  // Source form state
  const [sourceForm, setSourceForm] = useState({
    name: "", module_type: "financial", source_type: "api", base_url: "",
    schedule_cron: "", notes: "", is_free: true,
  });

  // System tab state
  const [apiUsage, setApiUsage] = useState<ApiUsageRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([]);
  const [systemLoading, setSystemLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [healthChecks, setHealthChecks] = useState<ServiceHealth[]>([]);
  const [firecrawlCredits, setFirecrawlCredits] = useState<FirecrawlCredits | null>(null);

  // ─── Fetch Users ─────────────────────────────────────
  const fetchUsers = async () => {
    setUsersLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, is_active, created_at")
      .order("full_name");

    if (profiles) {
      // Fetch roles for all users
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) ?? []);
      const merged: ProfileWithRole[] = profiles.map(p => ({
        ...p,
        role: roleMap.get(p.id) ?? "viewer",
      }));
      setUsers(merged);
    }
    setUsersLoading(false);
  };

  // ─── Fetch Data Sources ──────────────────────────────
  const fetchDataSources = async () => {
    setSourcesLoading(true);
    const { data, error } = await supabase
      .from("data_sources")
      .select("*")
      .order("module_type, name");
    console.log("[data_sources]", { data, error });
    if (error) {
      toast({ title: "Error loading data sources", description: error.message, variant: "destructive" });
    }
    setDataSources((data as DataSource[]) ?? []);
    setSourcesLoading(false);
  };

  // ─── Fetch System Data ───────────────────────────────
  const fetchSystemData = async () => {
    setSystemLoading(true);

    // Show spinners in health panel immediately
    setHealthChecks([
      { name: "Supabase", subtitle: "Database & Auth", status: "checking", icon: Cloud },
      { name: "Pipeline API", subtitle: "Backend processing", status: "checking", icon: Activity },
      { name: "FireCrawl", subtitle: "Web scraping", status: "checking", icon: Server },
      { name: "AI/ML API", subtitle: "AI models", status: "checking", icon: Zap },
      { name: "ARES (Czech Registry)", subtitle: "Company data", status: "checking", icon: Database },
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const [usageRes, logRes] = await Promise.all([
      supabase
        .from("api_usage")
        .select("service, endpoint, request_count, tokens_used, cost_estimate, date")
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false }),
      supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, details, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const supabaseOk = !usageRes.error && !logRes.error;

    if (usageRes.error) {
      toast({ title: "Error loading API usage", description: usageRes.error.message, variant: "destructive" });
    }
    if (logRes.error) {
      toast({ title: "Error loading audit log", description: logRes.error.message, variant: "destructive" });
    }

    setApiUsage((usageRes.data as ApiUsageRow[]) ?? []);

    // Fetch user names for audit log
    const logData = (logRes.data ?? []) as Array<{
      id: string; action: string; entity_type: string | null;
      entity_id: string | null; details: Record<string, unknown>;
      created_at: string; user_id: string | null;
    }>;
    const userIds = [...new Set(logData.map(l => l.user_id).filter(Boolean))];
    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: names } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      nameMap = new Map(names?.map(n => [n.id, n.full_name ?? "Unknown"]) ?? []);
    }

    setAuditLog(logData.map(l => ({
      id: l.id,
      action: l.action,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      details: l.details,
      created_at: l.created_at,
      user_name: l.user_id ? nameMap.get(l.user_id) ?? "Unknown" : null,
    })));
    setSystemLoading(false);

    // Fetch Firecrawl credits from pipeline (async, non-blocking)
    const pipelineUrl = import.meta.env.VITE_PIPELINE_URL ?? "https://vsa-pipeline.azurewebsites.net";
    fetch(`${pipelineUrl}/firecrawl-credits`)
      .then(r => r.ok ? r.json() : null)
      .then((data: FirecrawlCredits | null) => { if (data) setFirecrawlCredits(data); })
      .catch(() => {/* credits panel stays hidden */});

    // Run health checks after data load (async, updates health panel independently)
    runHealthChecks(supabaseOk);
  };

  // ─── Health Check Helpers ────────────────────────────
  const updateHealth = (name: string, status: ServiceHealth["status"], detail?: string) => {
    setHealthChecks(prev => prev.map(h => h.name === name ? { ...h, status, detail } : h));
  };

  const runHealthChecks = async (supabaseOk: boolean) => {
    // 1. Supabase — inferred from whether the main queries succeeded
    updateHealth("Supabase", supabaseOk ? "ok" : "error");

    // 2. Pipeline API + 3–4. FireCrawl / AI/ML — from live GET /health
    const pipelineUrl = (import.meta.env.VITE_PIPELINE_URL as string | undefined) ?? "https://vsa-pipeline.azurewebsites.net";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${pipelineUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      const body = await res.json();
      updateHealth("Pipeline API", body?.ok === true ? "ok" : "error");
      // Pipeline reports whether API keys are configured for each service
      updateHealth("FireCrawl", body?.services?.firecrawl === true ? "ok" : "error");
      updateHealth("AI/ML API", body?.services?.aiml === true ? "ok" : "error");
    } catch {
      updateHealth("Pipeline API", "error");
      updateHealth("FireCrawl", "unknown");
      updateHealth("AI/ML API", "unknown");
    }

    // 5. ARES — from data_sources table (it IS registered there)
    const { data: sources } = await supabase
      .from("data_sources")
      .select("name, status, last_sync_at");

    if (sources) {
      const ares = sources.find(s => s.name.toLowerCase().includes("ares"));
      updateHealth(
        "ARES (Czech Registry)",
        ares ? (ares.status === "active" ? "ok" : "error") : "unknown",
        ares?.last_sync_at
          ? `Last sync: ${formatDistanceToNow(new Date(ares.last_sync_at), { addSuffix: true })}`
          : undefined
      );
    } else {
      updateHealth("ARES (Czech Registry)", "unknown");
    }
  };

  // ─── Log Audit Event ─────────────────────────────────
  const logAudit = (
    action: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    // Fire-and-forget — never blocks the calling handler
    supabase
      .from("audit_log")
      .insert({
        user_id: user?.id ?? null,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        details: details ?? {},
      })
      .then(({ error }) => {
        if (error) console.warn("[audit_log] insert failed:", error.message);
      });
  };

  useEffect(() => { fetchUsers(); fetchDataSources(); }, []);

  // ─── Role Change ─────────────────────────────────────
  const handleRoleChange = async () => {
    if (!selectedUser || !newRole) return;

    // Prevent self-demotion if last admin
    if (selectedUser.id === user?.id && selectedUser.role === "admin" && newRole !== "admin") {
      const adminCount = users.filter(u => u.role === "admin" && u.is_active).length;
      if (adminCount <= 1) {
        toast({ title: "Cannot change role", description: "You are the only admin. Promote another user first.", variant: "destructive" });
        return;
      }
    }

    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole as "admin" | "analyst" | "viewer" })
      .eq("user_id", selectedUser.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role updated", description: `${selectedUser.full_name}'s role changed to ${newRole}.` });
      logAudit("user.role_change", "user", selectedUser.id, {
        from_role: selectedUser.role,
        to_role: newRole,
        target_user: selectedUser.full_name,
      });
      fetchUsers();
    }
    setRoleDialogOpen(false);
  };

  // ─── Toggle Active ───────────────────────────────────
  const toggleUserActive = async (u: ProfileWithRole) => {
    if (u.id === user?.id) {
      toast({ title: "Cannot deactivate yourself", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !u.is_active })
      .eq("id", u.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: u.is_active ? "User deactivated" : "User activated" });
      logAudit(
        u.is_active ? "user.deactivate" : "user.activate",
        "user",
        u.id,
        { target_user: u.full_name }
      );
      fetchUsers();
    }
  };

  // ─── Copy Invite URL ─────────────────────────────────
  const handleCopyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/register`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  // ─── Source CRUD ─────────────────────────────────────
  const openEditSource = (ds: DataSource) => {
    setEditSource(ds);
    setIsAddingSource(false);
    setSourceForm({
      name: ds.name, module_type: ds.module_type, source_type: ds.source_type,
      base_url: ds.base_url ?? "", schedule_cron: ds.schedule_cron ?? "",
      notes: ds.notes ?? "", is_free: ds.is_free,
    });
    setSourceDialogOpen(true);
  };

  const openAddSource = () => {
    setEditSource(null);
    setIsAddingSource(true);
    setSourceForm({ name: "", module_type: "financial", source_type: "api", base_url: "", schedule_cron: "", notes: "", is_free: true });
    setSourceDialogOpen(true);
  };

  const saveSource = async () => {
    const payload = {
      name: sourceForm.name,
      module_type: sourceForm.module_type,
      source_type: sourceForm.source_type,
      base_url: sourceForm.base_url || null,
      schedule_cron: sourceForm.schedule_cron || null,
      notes: sourceForm.notes || null,
      is_free: sourceForm.is_free,
    };

    if (isAddingSource) {
      const { error } = await supabase.from("data_sources").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Data source added" });
      logAudit("source.create", "data_source", undefined, { name: sourceForm.name, module_type: sourceForm.module_type });
    } else if (editSource) {
      const { error } = await supabase.from("data_sources").update(payload as any).eq("id", editSource.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Data source updated" });
      logAudit("source.update", "data_source", editSource.id, { name: sourceForm.name });
    }
    setSourceDialogOpen(false);
    fetchDataSources();
  };

  const toggleSourceStatus = async (ds: DataSource) => {
    const newStatus = ds.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("data_sources").update({ status: newStatus } as any).eq("id", ds.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    logAudit("source.status_change", "data_source", ds.id, {
      name: ds.name,
      from_status: ds.status,
      to_status: newStatus,
    });
    fetchDataSources();
  };

  // ─── Source Stats ────────────────────────────────────
  const sourceStats = useMemo(() => ({
    total: dataSources.length,
    active: dataSources.filter(s => s.status === "active").length,
    inactive: dataSources.filter(s => s.status === "inactive").length,
    error: dataSources.filter(s => s.status === "error").length,
  }), [dataSources]);

  // ─── Grouped Sources ────────────────────────────────
  const groupedSources = useMemo(() => {
    const groups: Record<string, DataSource[]> = {};
    dataSources.forEach(ds => {
      (groups[ds.module_type] ??= []).push(ds);
    });
    return groups;
  }, [dataSources]);

  // ─── API Usage Stats ────────────────────────────────
  const usageStats = useMemo(() => ({
    totalRequests: apiUsage.reduce((s, r) => s + r.request_count, 0),
    totalTokens: apiUsage.reduce((s, r) => s + r.tokens_used, 0),
    totalCost: apiUsage.reduce((s, r) => s + Number(r.cost_estimate), 0),
    activeServices: new Set(apiUsage.map(r => r.service)).size,
  }), [apiUsage]);

  // ─── Usage Chart Data ────────────────────────────────
  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    apiUsage.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.service] = (byDate[r.date][r.service] ?? 0) + r.request_count;
    });
    return Object.entries(byDate)
      .map(([date, services]) => ({ date, ...services }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [apiUsage]);

  const chartServices = useMemo(() => [...new Set(apiUsage.map(r => r.service))], [apiUsage]);

  // ─── Filtered Audit Log ──────────────────────────────
  const filteredLogs = useMemo(() => {
    if (actionFilter === "all") return auditLog;
    return auditLog.filter(l => l.action.startsWith(actionFilter));
  }, [auditLog, actionFilter]);

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">System administration</p>
      </div>

      <Tabs defaultValue="users" onValueChange={(v) => {
        if (v === "sources") fetchDataSources();
        if (v === "system") fetchSystemData();
      }}>
        <TabsList>
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users</TabsTrigger>
          <TabsTrigger value="sources" className="gap-2"><Database className="h-4 w-4" /> Data Sources</TabsTrigger>
          <TabsTrigger value="system" className="gap-2"><Activity className="h-4 w-4" /> System</TabsTrigger>
        </TabsList>

        {/* ═══ USERS TAB ═══ */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Invite Card */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-medium">Invite new users</p>
                  <p className="text-xs text-muted-foreground">Share the registration link. New users will appear as Viewer.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleCopyInvite} className="gap-1.5 shrink-0">
                {inviteCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {inviteCopied ? "Copied!" : "Copy Link"}
              </Button>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Users ({users.length})</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchUsers}
                  disabled={usersLoading}
                  className="gap-1.5 h-7 px-2 text-xs"
                >
                  {usersLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize border ${ROLE_COLORS[u.role] ?? ""}`}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border ${u.is_active ? "bg-risk-low/10 text-risk-low border-risk-low/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                            {u.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(u.created_at), "d MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setSelectedUser(u);
                            setNewRole(u.role);
                            setRoleDialogOpen(true);
                          }}>
                            Change Role
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleUserActive(u)}
                            className={u.is_active ? "text-destructive hover:text-destructive" : "text-risk-low hover:text-risk-low"}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ DATA SOURCES TAB ═══ */}
        <TabsContent value="sources" className="mt-4 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", value: sourceStats.total, icon: Database },
              { label: "Active", value: sourceStats.active, icon: CheckCircle2, color: "text-risk-low" },
              { label: "Inactive", value: sourceStats.inactive, icon: Circle, color: "text-muted-foreground" },
              { label: "Errors", value: sourceStats.error, icon: AlertCircle, color: "text-destructive" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`h-5 w-5 ${s.color ?? "text-foreground"}`} />
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={openAddSource} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-3.5 w-3.5" /> Add Source
            </Button>
          </div>

          {sourcesLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : Object.keys(groupedSources).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Database className="h-8 w-8 opacity-30" />
              <p className="text-sm">No data sources found. The table may be empty or the database migration has not been applied.</p>
            </div>
          ) : (
            Object.entries(groupedSources).map(([moduleType, sources]) => (
              <div key={moduleType} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {MODULE_LABELS[moduleType] ?? moduleType}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sources.map(ds => (
                    <Card key={ds.id} className={ds.status === "error" ? "border-destructive/40" : ""}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${
                              ds.status === "active" ? "bg-risk-low" :
                              ds.status === "error" ? "bg-destructive animate-pulse" :
                              "bg-muted-foreground"
                            }`} />
                            <span className="font-medium text-sm">{ds.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={`text-[10px] border ${SOURCE_TYPE_COLORS[ds.source_type] ?? ""}`}>
                              {ds.source_type}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] border ${ds.is_free ? "bg-risk-low/10 text-risk-low border-risk-low/20" : "bg-risk-medium/10 text-risk-medium border-risk-medium/20"}`}>
                              {ds.is_free ? "Free" : "Paid"}
                            </Badge>
                          </div>
                        </div>

                        {ds.base_url && (
                          <a href={ds.base_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-accent flex items-center gap-1 hover:underline truncate">
                            {ds.base_url.replace(/https?:\/\//, "").slice(0, 40)}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        )}

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {ds.last_sync_at
                              ? `Synced ${formatDistanceToNow(new Date(ds.last_sync_at), { addSuffix: true })}`
                              : "Never synced"}
                          </span>
                          <span>{cronToHuman(ds.schedule_cron)}</span>
                        </div>

                        {ds.status === "error" && ds.last_error && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-destructive truncate cursor-help">
                                <AlertCircle className="inline h-3 w-3 mr-1" />
                                {ds.last_error}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>{ds.last_error}</TooltipContent>
                          </Tooltip>
                        )}

                        {ds.notes && <p className="text-xs text-muted-foreground">{ds.notes}</p>}

                        <div className="flex justify-end gap-1 pt-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEditSource(ds)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => toggleSourceStatus(ds)}
                          >
                            {ds.status === "active" ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* ═══ SYSTEM TAB ═══ */}
        <TabsContent value="system" className="mt-4 space-y-6">
          {/* API Usage Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Requests", value: usageStats.totalRequests.toLocaleString() },
              { label: "Total Tokens", value: usageStats.totalTokens.toLocaleString() },
              { label: "Est. Cost", value: `$${usageStats.totalCost.toFixed(2)}` },
              { label: "Active Services", value: usageStats.activeServices },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Usage Chart */}
          {chartData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">API Usage (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend />
                    {chartServices.map(svc => (
                      <Area key={svc} type="monotone" dataKey={svc} stackId="1"
                        stroke={SERVICE_COLORS[svc] ?? "hsl(var(--accent))"}
                        fill={SERVICE_COLORS[svc] ?? "hsl(var(--accent))"}
                        fillOpacity={0.3}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No API usage recorded yet. Usage tracking begins when evaluation modules run.</p>
              </CardContent>
            </Card>
          )}

          {/* Firecrawl Credits */}
          {firecrawlCredits && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Firecrawl Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining Credits</p>
                    <p className="text-2xl font-bold mt-1">
                      {firecrawlCredits.account?.remaining_credits.toLocaleString() ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scrape Runs (30d)</p>
                    <p className="text-2xl font-bold mt-1">{firecrawlCredits.last_30_days.total_runs}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Articles Found (30d)</p>
                    <p className="text-2xl font-bold mt-1">{firecrawlCredits.last_30_days.total_articles_found.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Success / Failed</p>
                    <p className="text-2xl font-bold mt-1">
                      <span className="text-risk-low">{firecrawlCredits.last_30_days.completed}</span>
                      <span className="text-muted-foreground text-base"> / </span>
                      <span className="text-risk-high">{firecrawlCredits.last_30_days.failed}</span>
                    </p>
                  </div>
                </div>
                {firecrawlCredits.account?.billing_period_start && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Billing period: {firecrawlCredits.account.billing_period_start} → {firecrawlCredits.account.billing_period_end}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Log */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Audit Log</CardTitle>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Filter actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="evaluation">Evaluations</SelectItem>
                  <SelectItem value="supplier">Suppliers</SelectItem>
                  <SelectItem value="report">Reports</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="source">Data Sources</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {filteredLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No audit entries yet. Actions will be logged as users interact with the system.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm">{l.user_name ?? "System"}</TableCell>
                        <TableCell className="text-sm">{formatAction(l.action)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.entity_type}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {healthChecks.map(svc => (
                  <div key={svc.name} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <svc.icon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">{svc.detail ?? svc.subtitle}</p>
                    </div>
                    {svc.status === "checking" ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        svc.status === "ok"    ? "bg-risk-low" :
                        svc.status === "error" ? "bg-destructive" :
                        "bg-muted-foreground/40"
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ ROLE CHANGE DIALOG ═══ */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Change {selectedUser?.full_name}'s role from <span className="font-medium capitalize">{selectedUser?.role}</span> to a new role.
            </DialogDescription>
          </DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="analyst">Analyst</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="plebian">Plebian</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRoleChange} disabled={newRole === selectedUser?.role}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ SOURCE EDIT/ADD DIALOG ═══ */}
      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isAddingSource ? "Add Data Source" : "Edit Data Source"}</DialogTitle>
            <DialogDescription>
              {isAddingSource ? "Configure a new data source." : `Editing ${editSource?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={sourceForm.name} onChange={e => setSourceForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            {isAddingSource && (
              <div>
                <Label className="text-xs">Module Type</Label>
                <Select value={sourceForm.module_type} onValueChange={v => setSourceForm(p => ({ ...p, module_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODULE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Source Type</Label>
              <Select value={sourceForm.source_type} onValueChange={v => setSourceForm(p => ({ ...p, source_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="scrape">Scrape</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Base URL</Label>
              <Input value={sourceForm.base_url} onChange={e => setSourceForm(p => ({ ...p, base_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Schedule (cron)</Label>
              <Input value={sourceForm.schedule_cron} onChange={e => setSourceForm(p => ({ ...p, schedule_cron: e.target.value }))} placeholder="0 6 * * *" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={sourceForm.notes} onChange={e => setSourceForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={sourceForm.is_free} onCheckedChange={v => setSourceForm(p => ({ ...p, is_free: v }))} />
              <Label className="text-xs">Free source</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSourceDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSource} disabled={!sourceForm.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
