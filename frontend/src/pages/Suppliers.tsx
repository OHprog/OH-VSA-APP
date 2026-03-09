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
import { Plus, Search, Pencil, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const sectors = ["Telecom", "Construction", "IT", "Energy", "Logistics", "Other"];
const countries = [
  { code: "CZ", name: "Czech Republic" },
  { code: "SK", name: "Slovakia" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "PL", name: "Poland" },
  { code: "INT", name: "International / Other" },
];

interface Supplier {
  id: string;
  company_name: string;
  ico: string | null;
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
  last_evaluated: string | null;
}

interface SupplierForm {
  company_name: string;
  ico: string;
  country: string;
  city: string;
  address: string;
  sector: string;
  website_url: string;
  notes: string;
}

const emptyForm: SupplierForm = {
  company_name: "", ico: "", country: "CZ", city: "", address: "", sector: "", website_url: "", notes: "",
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
        country: form.country || null,
        city: form.city || null,
        address: form.address || null,
        sector: form.sector || null,
        website_url: form.website_url || null,
        notes: form.notes || null,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      toast({ title: "Supplier added" });
      setAddOpen(false);
      setForm(emptyForm);
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
      country: s.country || "CZ",
      city: s.city || "",
      address: s.address || "",
      sector: s.sector || "",
      website_url: s.website_url || "",
      notes: s.notes || "",
    });
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
        country: form.country || null,
        city: form.city || null,
        address: form.address || null,
        sector: form.sector || null,
        website_url: form.website_url || null,
        notes: form.notes || null,
      }).eq("id", editingId);
      if (error) throw error;
      toast({ title: "Supplier updated" });
      setEditOpen(false);
      setEditingId(null);
      setForm(emptyForm);
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
      const { error } = await supabase.from("suppliers").delete().eq("id", deleteId);
      if (error) throw error;
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
              <form className="space-y-4" onSubmit={handleAdd}>
                <div className="grid grid-cols-2 gap-4">
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
                  <div className={`space-y-2 ${form.country !== "CZ" ? "col-span-2" : ""}`}>
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
          <form className="space-y-4" onSubmit={handleEdit}>
            <div className="grid grid-cols-2 gap-4">
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
              <div className={`space-y-2 ${form.country !== "CZ" ? "col-span-2" : ""}`}>
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
                  <th className="text-left p-4 font-medium">Country</th>
                  <th className="text-left p-4 font-medium">Sector</th>
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
                      <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-8" /></td>
                      {canEdit && <td className="p-4"><Skeleton className="h-4 w-16 ml-auto" /></td>}
                    </tr>
                  ))
                ) : suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="p-12 text-center">
                      <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">No suppliers found</p>
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{s.company_name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{s.ico}</td>
                      <td className="p-4">{s.country}</td>
                      <td className="p-4 text-muted-foreground">{s.sector}</td>
                      <td className="p-4 text-muted-foreground">
                        {s.last_evaluated ? new Date(s.last_evaluated).toLocaleDateString() : "—"}
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
