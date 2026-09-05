import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Receipt, Trash2, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { PageTable, type Column } from "@/components/PageTable";
import { StatCard } from "@/components/StatCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoles } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable } from "@/lib/pdf";
import { PAYMENT_METHODS, shortDate, ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Flobbeto SACCO" }, { name: "description", content: "Record and review SACCO expenses with receipts." }, { name: "robots", content: "noindex" }] }),
  component: ExpensesPage,
});

const expenseSchema = z.object({
  expense_date: z.string().min(1, "Enter the expense date"),
  category: z.string().trim().min(2, "Enter an expense category").max(80),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  method: z.string().min(1),
  carried_by: z.string().trim().min(2, "Enter the person who carried the expense").max(120),
  description: z.string().trim().max(300).optional(),
});

type Expense = {
  id: string;
  expense_no: string;
  expense_date: string;
  category: string;
  amount: number;
  method: string;
  carried_by: string;
  description: string | null;
  receipt_path: string | null;
};

const emptyForm = () => ({
  expense_date: new Date().toISOString().slice(0, 10),
  category: "",
  amount: "",
  method: "cash",
  carried_by: "",
  description: "",
});

function ExpensesPage() {
  const { isAdmin, canPost } = useRoles();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await (supabase as any).from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const userResult = await supabase.auth.getUser();
      if (userResult.error) throw new Error(`Could not verify login: ${userResult.error.message}`);
      if (!userResult.data.user) throw new Error("Your session has expired. Sign in again.");
      const { data: inserted, error } = await (supabase as any).from("expenses").insert({ ...parsed.data, recorded_by: userResult.data.user.id }).select("id").single();
      if (error) throw new Error(`Could not save expense: ${error.message} (${error.code ?? "database error"})`);
      if (receipt && inserted) {
        const path = `${inserted.id}/${receipt.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const upload = await supabase.storage.from("expense-receipts").upload(path, receipt, { upsert: true });
        if (upload.error) {
          await (supabase as any).from("expenses").delete().eq("id", inserted.id);
          throw new Error(`Receipt upload failed: ${upload.error.message}`);
        }
        const update = await (supabase as any).from("expenses").update({ receipt_path: path }).eq("id", inserted.id);
        if (update.error) {
          await supabase.storage.from("expense-receipts").remove([path]);
          await (supabase as any).from("expenses").delete().eq("id", inserted.id);
          throw new Error(`Could not attach receipt: ${update.error.message}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Expense recorded");
      setOpen(false);
      setForm(emptyForm());
      setReceipt(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) => {
      const details = error as { message?: string; code?: string; details?: string; hint?: string };
      toast.error(
        details.message ??
          (details.code ? `Could not record expense: ${details.code}` : "Could not record expense"),
      );
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      const { error } = await (supabase as any).from("expenses").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      if (deleteTarget.receipt_path) await supabase.storage.from("expense-receipts").remove([deleteTarget.receipt_path]);
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete expense"),
  });

  const rows = (expenses.data ?? []).filter((expense) => (category === "all" || expense.category === category) && (!from || expense.expense_date >= from) && (!to || expense.expense_date <= to));
  const categories = Array.from(new Set((expenses.data ?? []).map((expense) => expense.category))).sort();
  const total = rows.reduce((sum, expense) => sum + Number(expense.amount), 0);

  const openReceipt = async (expense: Expense) => {
    if (!expense.receipt_path) return;
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(expense.receipt_path, 300);
    if (error) toast.error(error.message);
    else if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const columns: Column<Expense>[] = [
    { key: "number", header: "Reference", cell: (expense) => <span className="font-mono text-xs">{expense.expense_no}</span> },
    { key: "date", header: "Date", cell: (expense) => shortDate(expense.expense_date) },
    { key: "category", header: "Category", cell: (expense) => <span className="capitalize">{expense.category}</span> },
    { key: "carried", header: "Carried by", cell: (expense) => expense.carried_by },
    { key: "method", header: "Payment method", cell: (expense) => <span className="capitalize">{expense.method.replace(/_/g, " ")}</span> },
    { key: "amount", header: "Amount", className: "text-right", cell: (expense) => <span className="font-medium">{ugx(Number(expense.amount))}</span> },
    { key: "receipt", header: "Receipt", cell: (expense) => expense.receipt_path ? <Button variant="link" size="sm" className="px-0" onClick={() => openReceipt(expense)}><Receipt className="size-4" /> View</Button> : <span className="text-muted-foreground">None</span> },
    ...(isAdmin ? [{ key: "actions", header: "", className: "text-right", cell: (expense: Expense) => <Button variant="ghost" size="icon" title="Delete expense" aria-label={`Delete ${expense.expense_no}`} onClick={() => setDeleteTarget(expense)}><Trash2 className="size-4 text-destructive" /></Button> }] : []),
  ];

  return (
    <AppShell title="Expenses" description="Record, receipt and review SACCO expenses">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total expenses" value={ugx(total)} tone="destructive" icon={WalletCards} />
        <StatCard label="Expense records" value={String(rows.length)} icon={Receipt} />
        <StatCard label="With receipts" value={String(rows.filter((expense) => expense.receipt_path).length)} tone="gold" icon={Download} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Expense register</CardTitle></CardHeader>
        <CardContent>
          <PageTable rows={rows} columns={columns} searchable={(expense) => `${expense.expense_no} ${expense.category} ${expense.carried_by} ${expense.description ?? ""}`} searchPlaceholder="Search reference, category or person…" empty={expenses.isLoading ? "Loading expenses…" : "No expenses recorded yet."} toolbar={<>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-36" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-36" />
            <Button variant="outline" size="sm" onClick={() => exportPdfTable({ filename: "flobbeto-expenses.pdf", title: "Expense register", subtitle: `${rows.length} record(s)`, head: ["Reference", "Date", "Category", "Carried by", "Method", "Amount"], body: rows.map((expense) => [expense.expense_no, shortDate(expense.expense_date), expense.category, expense.carried_by, expense.method.replace(/_/g, " "), Number(expense.amount).toLocaleString()]), footNote: `Total expenses: ${ugx(total)}` })}><Download className="size-4" /> Export PDF</Button>
            {canPost ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm"><Receipt className="size-4" /> Record expense</Button></DialogTrigger><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Record an expense</DialogTitle><DialogDescription>Keep the payment details and receipt together with the person who carried the expense.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="expense-date">Date</Label><Input id="expense-date" type="date" value={form.expense_date} onChange={(event) => setForm((current) => ({ ...current, expense_date: event.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor="expense-category">Category</Label><Input id="expense-category" placeholder="Stationery" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor="expense-amount">Amount</Label><Input id="expense-amount" type="number" min="1" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div><div className="space-y-1.5"><Label>Payment method</Label><Select value={form.method} onValueChange={(value) => setForm((current) => ({ ...current, method: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="expense-carried-by">Carried by</Label><Input id="expense-carried-by" placeholder="Full name" value={form.carried_by} onChange={(event) => setForm((current) => ({ ...current, carried_by: event.target.value }))} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="expense-description">Description</Label><Input id="expense-description" placeholder="What was purchased or paid for?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="expense-receipt">Receipt</Label><Input id="expense-receipt" type="file" accept="image/*,.pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></div></div><DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Save expense"}</Button></DialogFooter></DialogContent></Dialog> : null}
          </>} />
        </CardContent>
      </Card>
      <AlertDialog open={!!deleteTarget} onOpenChange={(value) => !value && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete expense?</AlertDialogTitle><AlertDialogDescription>This permanently removes {deleteTarget?.expense_no ?? "this expense"} and its receipt record.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate()} disabled={remove.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{remove.isPending ? "Deleting…" : "Delete expense"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </AppShell>
  );
}