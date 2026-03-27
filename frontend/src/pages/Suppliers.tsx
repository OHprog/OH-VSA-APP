import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Building2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const sectors = ["Telecom", "Construction", "IT", "Energy", "Logistics", "Other"];
const countries = [
  { code: "CZ", name: "Czech Republic" },
  { code: "SK", name: "Slovakia" },
  { code: "HU", name: "Hungary" },
  { code: "RS", name: "Serbia" },
  { code: "BG", name: "Bulgaria" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "PL", name: "Poland" },
  { code: "INT", name: "International / Other" },
];

interface Supplier {
  id: string;
  company_name: string;
  ico: string | null;
  dic: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  sector: string | null;
  website_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  evaluation_count: number;
  last_evaluated_at: string | null;
  parent_id: string | null;
  parent_company_name: string | null;
  subsidiary_count: number;
}

interface SupplierForm {
  company_name: string;
  ico: string;
  dic: string;
  country: string;
  city: string;
  address: string;
  sector: string;
  website_url: string;
  notes: string;
  parent_id: string | null;
}

const emptyForm: SupplierForm = {
  company_name: "", ico: "", dic: "", country: "CZ", city: "", address: "", sector: "", website_url: "", notes: "", parent_id: null,
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [parentResults, setParentResults] = useState<{ id: string; company_name: string; ico: string | null }[]>([]);
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const { role, isAdmin, isAnalyst, user, profile } = useAuth();
  const { toast } = useToast();
  const canEdit = isAdmin || isAnalyst;

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      if (search.trim()) {
        const { data, error } = await supabase.rpc("search_suppliers", {
          search_term: search.trim(),
          p_limit: 50,
        });
        if (error) throw error;
        setSuppliers((data as Supplier[]) ?? []);
      } else {
        const { data, error } = await supabase
          .from("supplier_summary")
          .select("*")
          .order("company_name");
        if (error) throw error;
        setSuppliers((data as Supplier[]) ?? []);
      }
    } catch (err: any) {
      toast({ title: "Error loading suppliers", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    const timeout = setTimeout(fetchSuppliers, 300);
    return () => clearTimeout(timeout);
  }, [fetchSuppliers]);

  useEffect(() => {
    if (!parentSearch.trim() || form.parent_id) {
      setParentResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase.rpc("search_suppliers", { search_term: parentSearch.trim(), p_limit: 8 });
      setParentResults((data as any[] ?? []).map((r) => ({ id: r.id, company_name: r.company_name, ico: r.ico })));
    }, 300);
    return () => clearTimeout(timeout);
  }, [parentSearch, form.parent_id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !profile?.organization_id) {
      toast({ title: "Not authenticated", description: "Please log in to add a supplier.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("suppliers").insert({
        organization_id: profile.organization_id,
        company_name: form.company_name,
        ico: form.ico || null,
        dic: form.dic || null,
        country: form.country || null,
        city: form.city || null,
        address: form.address || null,
        sector: form.sector || null,
        website_url: form.website_url || null,
        notes: form.notes || null,
        parent_id: form.parent_id || null,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      toast({ title: "Supplier added" });
      setAddOpen(false);
      setForm(emptyForm);
      setParentSearch("");
      setParentResults([]);
      fetchSuppliers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      company_name: s.company_name,
      ico: s.ico || "",
      dic: s.dic || "",
      country: s.country || "CZ",
      city: s.city || "",
      address: s.address || "",
      sector: s.sector || "",
      website_url: s.website_url || "",
      notes: s.notes || "",
      parent_id: s.parent_id,
    });
    setParentSearch(s.parent_company_name || "");
    setParentResults([]);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("suppliers").update({
        company_name: form.company_name,
        ico: form.ico || null,
        dic: form.dic || null,
        country: form.country || null,
        city: form.city || null,
        address: form.address || null,
        sector: form.sector || null,
        website_url: form.website_url || null,
        notes: form.notes || null,
        parent_id: form.parent_id || null,
      }).eq("id", editingId);
      if (error) throw error;
      toast({ title: "Supplier updated" });
      setEditOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setParentSearch("");
      setParentResults([]);
      fetchSuppliers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { data: deleted, error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", deleteId)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Could not delete supplier. You may not have permission, or the record has linked data.");
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== deleteId));
      toast({ title: "Supplier deleted" });
      fetchSuppliers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your supplier database</p>
        </div>
        {canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2" onClick={() => setForm(emptyForm)}>
                <Plus className="h-4 w-4" /> Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add New Supplier</DialogTitle></DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={handleAdd}>
                <div className="grid grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-1">
                  <div className="space-y-2 col-span-2">
                    <Label>Company Name</Label>
                    <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme Corp" required />
                  </div>
                  {form.country === "CZ" && (
                    <div className="space-y-2">
                      <Label>IČO (8-digit)</Label>
                      <Input value={form.ico} onChange={(e) => setForm({ ...form, ico: e.target.value })} placeholder="12345678" maxLength={8} pattern="\d{8}" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{form.country === "CZ" ? "DIČ (VAT)" : "VAT Number"}</Label>
                    <Input value={form.dic} onChange={(e) => setForm({ ...form, dic: e.target.value })} placeholder={form.country === "CZ" ? "CZ12345678" : "e.g. DE123456789"} />
                  </div>
                  <div className={`space-y-2 ${form.country === "CZ" ? "col-span-2" : ""}`}>
                    <Label>Country</Label>
                    <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v, ico: v !== "CZ" ? "" : form.ico })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Prague" />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street 123" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sector</Label>
                    <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                      <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://..." type="url" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Parent Company <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search for parent company..."
                        value={parentSearch}
                        onChange={(e) => { setParentSearch(e.target.value); setParentDropdownOpen(true); if (form.parent_id) setForm({ ...form, parent_id: null }); }}
                        onFocus={() => setParentDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setParentDropdownOpen(false), 150)}
                        className="pl-9 pr-8"
                      />
                      {form.parent_id && (
                        <button type="button" onClick={() => { setForm({ ...form, parent_id: null }); setParentSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {parentDropdownOpen && parentSearch.trim() && !form.parent_id && parentResults.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                          {parentResults.map((r) => (
                            <button key={r.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b border-border/50 last:border-0"
                              onMouseDown={() => { setForm({ ...form, parent_id: r.id }); setParentSearch(r.company_name); setParentDropdownOpen(false); }}>
                              <p className="font-medium">{r.company_name}</p>
                              {r.ico && <p className="text-xs text-muted-foreground">IČO: {r.ico}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {form.parent_id && <p className="text-xs text-muted-foreground">Selected: <span className="font-medium">{parentSearch}</span></p>}
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditOpen(false); }}>Cancel</Button>
                  <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Supplier"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, IČO, or sector..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleEdit}>
            <div className="grid grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-2 col-span-2">
                <Label>Company Name</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme Corp" required />
              </div>
              {form.country === "CZ" && (
                <div className="space-y-2">
                  <Label>IČO (8-digit)</Label>
                  <Input value={form.ico} onChange={(e) => setForm({ ...form, ico: e.target.value })} placeholder="12345678" maxLength={8} pattern="\d{8}" />
                </div>
              )}
              <div className="space-y-2">
                <Label>{form.country === "CZ" ? "DIČ (VAT)" : "VAT Number"}</Label>
                <Input value={form.dic} onChange={(e) => setForm({ ...form, dic: e.target.value })} placeholder={form.country === "CZ" ? "CZ12345678" : "e.g. DE123456789"} />
              </div>
              <div className={`space-y-2 ${form.country === "CZ" ? "col-span-2" : ""}`}>
                <Label>Country</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v, ico: v !== "CZ" ? "" : form.ico })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Prague" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street 123" />
              </div>
              <div className="space-y-2">
                <Label>Sector</Label>
                <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                  <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://..." type="url" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Parent Company <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search for parent company..."
                    value={parentSearch}
                    onChange={(e) => { setParentSearch(e.target.value); setParentDropdownOpen(true); if (form.parent_id) setForm({ ...form, parent_id: null }); }}
                    onFocus={() => setParentDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setParentDropdownOpen(false), 150)}
                    className="pl-9 pr-8"
                  />
                  {form.parent_id && (
                    <button type="button" onClick={() => { setForm({ ...form, parent_id: null }); setParentSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {parentDropdownOpen && parentSearch.trim() && !form.parent_id && parentResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                      {parentResults.filter((r) => r.id !== editingId).map((r) => (
                        <button key={r.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b border-border/50 last:border-0"
                          onMouseDown={() => { setForm({ ...form, parent_id: r.id }); setParentSearch(r.company_name); setParentDropdownOpen(false); }}>
                          <p className="font-medium">{r.company_name}</p>
                          {r.ico && <p className="text-xs text-muted-foreground">IČO: {r.ico}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.parent_id && <p className="text-xs text-muted-foreground">Selected: <span className="font-medium">{parentSearch}</span></p>}
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditOpen(false); }}>Cancel</Button>
              <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={submitting}>
                {submitting ? "Saving..." : "Update Supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the supplier and all associated data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-4 font-medium">Company Name</th>
                  <th className="text-left p-4 font-medium">IČO</th>
                  <th className="text-left p-4 font-medium">DIČ / VAT</th>
                  <th className="text-left p-4 font-medium">Country</th>
                  <th className="text-left p-4 font-medium">Sector</th>
                  <th className="text-left p-4 font-medium">Parent / Subs</th>
                  <th className="text-left p-4 font-medium">Last Evaluated</th>
                  <th className="text-left p-4 font-medium">Evals</th>
                  {canEdit && <th className="text-right p-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                      {canEdit && <td className="p-4"><Skeleton className="h-4 w-16 ml-auto" /></td>}
                    </tr>
                  ))
                ) : suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8} className="p-12 text-center">
                      <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">No suppliers found</p>
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{s.company_name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{s.ico ?? "—"}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{s.dic ?? "—"}</td>
                      <td className="p-4">{s.country}</td>
                      <td className="p-4 text-muted-foreground">{s.sector}</td>
                      <td className="p-4 text-sm">
                        {s.parent_company_name && (
                          <div className="text-xs">
                            <span className="text-muted-foreground/70">Parent: </span>
                            <button className="text-accent hover:underline truncate max-w-[140px] inline-block align-bottom" title={s.parent_company_name}
                              onClick={() => setSearch(s.parent_company_name!)}>
                              {s.parent_company_name}
                            </button>
                          </div>
                        )}
                        {s.subsidiary_count > 0 && (
                          <div className="text-xs">
                            <button className="text-muted-foreground hover:text-accent hover:underline"
                              onClick={() => setSearch(s.company_name)}>
                              {s.subsidiary_count} {s.subsidiary_count === 1 ? "subsidiary" : "subsidiaries"}
                            </button>
                          </div>
                        )}
                        {!s.parent_company_name && s.subsidiary_count === 0 && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {s.last_evaluated_at ? new Date(s.last_evaluated_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-4 text-muted-foreground">{s.evaluation_count}</td>
                      {canEdit && (
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            {isAdmin && (
                              <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
