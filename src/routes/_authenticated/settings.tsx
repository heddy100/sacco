import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, RotateCcw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoles, useSaccoSettings } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Flobetto SACCO" }, { name: "description", content: "Customize SACCO identity and financial rules." }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const settingsSchema = z.object({
  sacco_name: z.string().trim().min(2).max(160),
  sacco_short: z.string().trim().min(2).max(60),
  tagline: z.string().trim().min(2).max(80),
  address: z.string().trim().max(160),
  phone: z.string().trim().max(80),
  email: z.string().trim().email().or(z.literal("")),
  currency: z.string().trim().min(3).max(10),
  share_price: z.coerce.number().positive().max(1_000_000_000),
  min_savings: z.coerce.number().nonnegative().max(1_000_000_000),
  loan_to_savings_ratio: z.coerce.number().positive().max(100),
  interest_rate: z.coerce.number().nonnegative().max(100),
  registration_fee: z.coerce.number().nonnegative().max(1_000_000_000),
  subscription_fee: z.coerce.number().nonnegative().max(1_000_000_000),
  financial_year: z.coerce.number().int().min(2000).max(2200),
});

type SettingsForm = Record<keyof typeof settingsSchema.shape, string>;
type LoanProduct = {
  id: string;
  name: string;
  interest_rate: number;
  max_amount: number;
  max_period_months: number;
  processing_fee_pct: number;
  penalty_rate: number;
  savings_multiplier: number;
  active: boolean;
};

function SettingsPage() {
  const { isAdmin, isLoading: rolesLoading } = useRoles();
  const settings = useSaccoSettings();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LoanProduct | null>(null);
  const [productForm, setProductForm] = useState({ name: "", interest_rate: "", max_amount: "", max_period_months: "12", processing_fee_pct: "1", penalty_rate: "2", savings_multiplier: "3" });

  const products = useQuery({
    queryKey: ["loan-products-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("loan_products").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as LoanProduct[];
    },
  });

  useEffect(() => {
    if (settings.data && !form) {
      setForm(Object.fromEntries(Object.entries(settings.data).map(([key, value]) => [key, String(value)])) as SettingsForm);
    }
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const parsed = settingsSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the settings");
      const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value: String(value) }));
      const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save settings"),
  });

  const clearRecent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("system_settings").upsert(
        { key: "recent_transactions_since", value: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recent transaction view cleared");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not clear recent transactions"),
  });

  const saveProduct = useMutation({
    mutationFn: async () => {
      const product = {
        name: productForm.name.trim(),
        interest_rate: Number(productForm.interest_rate),
        max_amount: Number(productForm.max_amount),
        max_period_months: Number(productForm.max_period_months),
        processing_fee_pct: Number(productForm.processing_fee_pct),
        penalty_rate: Number(productForm.penalty_rate),
        savings_multiplier: Number(productForm.savings_multiplier),
        active: true,
      };
      if (!product.name || !Number.isFinite(product.interest_rate) || product.interest_rate < 0 || !Number.isFinite(product.max_amount) || product.max_amount <= 0 || !Number.isFinite(product.max_period_months) || product.max_period_months <= 0) {
        throw new Error("Enter a name, percentage, maximum amount and repayment period");
      }
      const result = editingProduct
        ? await supabase.from("loan_products").update(product).eq("id", editingProduct.id)
        : await supabase.from("loan_products").insert(product);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(editingProduct ? "Loan type updated" : "Loan type added");
      setProductOpen(false);
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ["loan-products-settings"] });
      queryClient.invalidateQueries({ queryKey: ["loan-products"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save loan type"),
  });

  const toggleProduct = useMutation({
    mutationFn: async (product: LoanProduct) => {
      const { error } = await supabase.from("loan_products").update({ active: !product.active }).eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan-products-settings"] });
      queryClient.invalidateQueries({ queryKey: ["loan-products"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update loan type"),
  });

  const deleteProduct = useMutation({
    mutationFn: async (product: LoanProduct) => {
      const { error } = await supabase.from("loan_products").delete().eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan type deleted");
      queryClient.invalidateQueries({ queryKey: ["loan-products-settings"] });
      queryClient.invalidateQueries({ queryKey: ["loan-products"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete loan type"),
  });


  if (!rolesLoading && !isAdmin) {
    return <AppShell title="Settings"><Card><CardContent className="flex items-center gap-3 py-10 text-muted-foreground"><ShieldAlert className="size-5 text-destructive" />Only administrators can change system settings.</CardContent></Card></AppShell>;
  }

  const update = (key: keyof SettingsForm, value: string) => setForm((current) => current ? { ...current, [key]: value } : current);
  const organization = [["sacco_name", "Organization name"], ["sacco_short", "Short name"], ["tagline", "Tagline"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"]] as const;
  const financial = [["currency", "Currency code"], ["share_price", "Share price"], ["min_savings", "Minimum savings"], ["registration_fee", "Registration fee"], ["subscription_fee", "Subscription fee"], ["loan_to_savings_ratio", "Loan to savings multiplier"], ["interest_rate", "Annual interest rate (%)"], ["financial_year", "Financial year"]] as const;

  return (
    <AppShell title="Settings" description="Customize the SACCO identity and operating rules">
      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader><CardTitle>Organization profile</CardTitle><CardDescription>These details appear in the app navigation and exported documents.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {organization.map(([key, label]) => <div key={key} className={`space-y-1.5 ${key === "sacco_name" || key === "address" ? "sm:col-span-2" : ""}`}><Label htmlFor={`setting-${key}`}>{label}</Label><Input id={`setting-${key}`} value={form?.[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Financial rules</CardTitle><CardDescription>New transactions and loan calculations use these saved values.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {financial.map(([key, label]) => <div key={key} className="space-y-1.5"><Label htmlFor={`setting-${key}`}>{label}</Label><Input id={`setting-${key}`} type={key === "currency" ? "text" : "number"} min="0" step="0.01" value={form?.[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></div>)}
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2"><Button onClick={() => save.mutate()} disabled={!form || settings.isLoading || save.isPending}><Save className="size-4" />{save.isPending ? "Saving..." : "Save settings"}</Button><Button variant="outline" onClick={() => clearRecent.mutate()} disabled={clearRecent.isPending}><RotateCcw className="size-4" />{clearRecent.isPending ? "Clearing..." : "Start fresh recent transactions"}</Button></div>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle>Loan types and rates</CardTitle><CardDescription>Admins can configure the loan options available to applicants.</CardDescription></div>
            <Dialog open={productOpen} onOpenChange={(value) => { setProductOpen(value); if (!value) setEditingProduct(null); }}>
              <DialogTrigger asChild><Button size="sm" onClick={() => { setEditingProduct(null); setProductForm({ name: "", interest_rate: "", max_amount: "", max_period_months: "12", processing_fee_pct: "1", penalty_rate: "2", savings_multiplier: "3" }); }}><Plus className="size-4" /> Add loan type</Button></DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{editingProduct ? "Edit loan type" : "Add loan type"}</DialogTitle><DialogDescription>Set the rate and limits for this loan option.</DialogDescription></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">{[["name", "Loan type"], ["interest_rate", "Annual interest (%)"], ["max_amount", "Maximum amount"], ["max_period_months", "Maximum period (months)"], ["processing_fee_pct", "Processing fee (%)"], ["penalty_rate", "Penalty rate (%)"], ["savings_multiplier", "Savings multiplier"]].map(([key, label]) => <div key={key} className="space-y-1.5"><Label htmlFor={`product-${key}`}>{label}</Label><Input id={`product-${key}`} type={key === "name" ? "text" : "number"} min="0" step="0.01" value={productForm[key as keyof typeof productForm]} onChange={(event) => setProductForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}</div>
                <DialogFooter><Button onClick={() => saveProduct.mutate()} disabled={saveProduct.isPending}>{saveProduct.isPending ? "Saving..." : "Save loan type"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-2">{(products.data ?? []).map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{product.name} <span className="text-sm text-muted-foreground">{product.interest_rate}% annual</span></p><p className="text-xs text-muted-foreground">Up to {product.max_amount.toLocaleString()} for {product.max_period_months} months · {product.active ? "Active" : "Inactive"}</p></div><div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => { setEditingProduct(product); setProductForm({ name: product.name, interest_rate: String(product.interest_rate), max_amount: String(product.max_amount), max_period_months: String(product.max_period_months), processing_fee_pct: String(product.processing_fee_pct), penalty_rate: String(product.penalty_rate), savings_multiplier: String(product.savings_multiplier) }); setProductOpen(true); }}><Pencil className="size-4" /> Edit</Button><Button variant="outline" size="sm" onClick={() => toggleProduct.mutate(product)}>{product.active ? "Deactivate" : "Activate"}</Button><Button variant="ghost" size="icon" title="Delete loan type" aria-label={`Delete ${product.name}`} onClick={() => { if (window.confirm(`Delete ${product.name}?`)) deleteProduct.mutate(product); }}><Trash2 className="size-4 text-destructive" /></Button></div></div>)}{products.data?.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No loan types configured.</p> : null}</CardContent>
        </Card>
      </div>
    </AppShell>
  );
}