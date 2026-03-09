import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { moduleTypes } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Rocket, Search, Plus, Check } from "lucide-react";

interface SupplierResult {
  id: string;
  company_name: string;
  ico: string | null;
  sector: string | null;
  country: string | null;
}

const sectors = ["Telecom", "Construction", "IT", "Energy", "Logistics", "Other"];
const countries = [
  { code: "CZ", name: "Czech Republic" },
  { code: "SK", name: "Slovakia" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "PL", name: "Poland" },
];

const steps = ["Select Supplier", "Choose Modules", "Review & Launch"];

export default function NewEvaluation() {
  const [step, setStep] = useState(1);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierResult | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SupplierResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ company_name: "", ico: "", country: "CZ", sector: "" });
  const [quickAdding, setQuickAdding] = useState(false);

  const navigate = useNavigate();
  const { isAdmin, isAnalyst, user, profile } = useAuth();
  const { toast } = useToast();

  // Permission check
  useEffect(() => {
    if (!isAdmin && !isAnalyst) {
      toast({ title: "Access denied", description: "You don't have permission to create evaluations.", variant: "destructive" });
      navigate("/");
    }
  }, [isAdmin, isAnalyst, navigate, toast]);

  // Debounced search
  const searchSuppliers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("search_suppliers", { search_term: query.trim(), p_limit: 10 });
      if (error) throw error;
      setSearchResults((data as SupplierResult[]) ?? []);
    } catch (err: any) {
      toast({ title: "Search error", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }, [toast]);

  useEffect(() => {
    const timeout = setTimeout(() => searchSuppliers(searchTerm), 300);
    return () => clearTimeout(timeout);
  }, [searchTerm, searchSuppliers]);

  const toggleModule = (key: string) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const selectAll = () => setSelectedModules(moduleTypes.map((m) => m.key));
  const deselectAll = () => setSelectedModules([]);

  const handleLaunch = async () => {
    if (!selectedSupplier) return;
    setLaunching(true);
    try {
      const { data, error } = await supabase.rpc("create_evaluation", {
        p_supplier_id: selectedSupplier.id,
        p_module_types: selectedModules,
      });
      if (error) throw error;

      // Fire-and-forget: tell pipeline to start processing (don't await)
      const pipelineUrl = import.meta.env.VITE_PIPELINE_URL ?? "http://localhost:3001";
      fetch(`${pipelineUrl}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluation_id: data,
          ico: selectedSupplier.ico ?? "",
          company_name: selectedSupplier.company_name,
          modules: selectedModules,
        }),
      }).catch((e) => console.warn("[pipeline] call failed:", e));

      toast({ title: "Evaluation started!", description: `Evaluation for ${selectedSupplier.company_name} has been launched.` });
      navigate(`/evaluations/${data}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !profile?.organization_id) {
      toast({ title: "Not authenticated", description: "Please log in to add a supplier.", variant: "destructive" });
      return;
    }
    setQuickAdding(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          organization_id: profile.organization_id,
          company_name: quickForm.company_name,
          ico: quickForm.ico || null,
          country: quickForm.country || null,
          sector: quickForm.sector || null,
          created_by: user.id,
        })
        .select("id, company_name, ico, sector, country")
        .single();
      if (error) throw error;
      setSelectedSupplier(data as SupplierResult);
      setSearchTerm(data.company_name);
      setShowDropdown(false);
      setQuickAddOpen(false);
      setQuickForm({ company_name: "", ico: "", country: "CZ", sector: "" });
      toast({ title: "Supplier added and selected" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setQuickAdding(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1">Launch a supplier risk assessment</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => stepNum < step && setStep(stepNum)}
                disabled={stepNum > step}
                className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                  isActive ? "text-accent" : isDone ? "text-foreground cursor-pointer hover:text-accent" : "text-muted-foreground"
                }`}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  isActive ? "border-accent bg-accent text-accent-foreground" : isDone ? "border-accent bg-accent/10 text-accent" : "border-muted-foreground/30"
                }`}>
                  {isDone ? <Check className="h-3.5 w-3.5" /> : stepNum}
                </div>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded ${stepNum < step ? "bg-accent" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1 – Select Supplier */}
      {step === 1 && (
        <Card className="animate-fade-in">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold">Select a Supplier</h2>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, IČO, or sector..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  if (selectedSupplier && e.target.value !== selectedSupplier.company_name) {
                    setSelectedSupplier(null);
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                className="pl-9"
              />
              {showDropdown && searchTerm.trim() && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searching ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">No suppliers found</div>
                  ) : (
                    searchResults.map((s) => (
                      <button
                        key={s.id}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm border-b border-border/50 last:border-0"
                        onClick={() => {
                          setSelectedSupplier(s);
                          setSearchTerm(s.company_name);
                          setShowDropdown(false);
                        }}
                      >
                        <p className="font-medium">{s.company_name}</p>
                        <p className="text-xs text-muted-foreground">{s.ico && `IČO: ${s.ico}`}{s.sector && ` · ${s.sector}`}{s.country && ` · ${s.country}`}</p>
                      </button>
                    ))
                  )}
                  <button
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm text-accent flex items-center gap-2"
                    onClick={() => {
                      setQuickAddOpen(true);
                      setShowDropdown(false);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Quick Add Supplier
                  </button>
                </div>
              )}
            </div>

            {selectedSupplier && (
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1 border border-accent/20">
                <p className="font-medium">{selectedSupplier.company_name}</p>
                <p className="text-muted-foreground">
                  {selectedSupplier.ico && `IČO: ${selectedSupplier.ico}`}
                  {selectedSupplier.sector && ` · ${selectedSupplier.sector}`}
                  {selectedSupplier.country && ` · ${selectedSupplier.country}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Add Supplier Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Quick Add Supplier</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={handleQuickAdd}>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={quickForm.company_name} onChange={(e) => setQuickForm({ ...quickForm, company_name: e.target.value })} placeholder="Acme Corp" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IČO</Label>
                <Input value={quickForm.ico} onChange={(e) => setQuickForm({ ...quickForm, ico: e.target.value })} placeholder="12345678" maxLength={8} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={quickForm.country} onValueChange={(v) => setQuickForm({ ...quickForm, country: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sector</Label>
              <Select value={quickForm.sector} onValueChange={(v) => setQuickForm({ ...quickForm, sector: v })}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={quickAdding}>
                {quickAdding ? "Adding..." : "Add & Select"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Step 2 – Select Modules */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
            </div>
            <span className="text-sm text-muted-foreground">{selectedModules.length} modules selected</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moduleTypes.map((mod) => {
              const selected = selectedModules.includes(mod.key);
              return (
                <Card
                  key={mod.key}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selected ? "border-accent ring-1 ring-accent/30 bg-accent/5" : ""
                  }`}
                  onClick={() => toggleModule(mod.key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selected} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{mod.icon}</span>
                          <span className="font-medium text-sm">{mod.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{mod.description}</p>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground">{mod.estimatedTime}</span>
                          <span className="text-muted-foreground">·</span>
                          <div className="flex gap-1 flex-wrap">
                            {mod.sources.map((src) => (
                              <Badge key={src} variant="secondary" className="text-[10px] px-1.5 py-0">{src}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 – Review & Launch */}
      {step === 3 && (
        <Card className="animate-fade-in">
          <CardContent className="p-6 space-y-6">
            <h2 className="font-semibold">Review & Launch</h2>
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Supplier</p>
                <p className="font-medium">{selectedSupplier?.company_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedSupplier?.ico && `IČO: ${selectedSupplier.ico}`}
                  {selectedSupplier?.sector && ` · ${selectedSupplier.sector}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Selected Modules ({selectedModules.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedModules.map((key) => {
                    const mod = moduleTypes.find((m) => m.key === key)!;
                    return (
                      <Badge key={key} variant="outline" className="gap-1">
                        <span>{mod.icon}</span> {mod.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
            <Button
              onClick={handleLaunch}
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              size="lg"
              disabled={launching}
            >
              <Rocket className="h-4 w-4" /> {launching ? "Starting..." : "Start Evaluation"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 1} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 3 && (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 1 && !selectedSupplier) || (step === 2 && selectedModules.length === 0)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          >
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
