import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PageTable, type Column } from "@/components/PageTable";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBalances, useMembersList, useSession, usePermissions } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable, receiptPdf } from "@/lib/pdf";
import { PAYMENT_METHODS, paymentReference, shortDate, ugx } from "@/lib/sacco";

async function savingsReceipt(r: {
  txn_no: string;
  txn_date: string;
  txn_type: string;
  category: string;
  method: string;
  reference: string | null;
  description: string | null;
  amount: number;
  members: { full_name: string; member_no: string } | null;
}) {
  const isDeposit = r.txn_type === "deposit";
  await receiptPdf({
    filename: `receipt-${r.txn_no}.pdf`,
    title: isDeposit ? "Savings Deposit Receipt" : "Savings Withdrawal Voucher",
    receiptNo: r.txn_no,
    date: shortDate(r.txn_date),
    memberName: r.members?.full_name ?? "—",
    memberNo: r.members?.member_no ?? "—",
    fields: [
      ["Transaction type", isDeposit ? "Deposit" : "Withdrawal"],
      ["Savings category", r.category.replace(/_/g, " ")],
      ["Payment method", r.method.replace(/_/g, " ")],
      ["Reference", r.reference ?? "—"],
      ["Narration", r.description ?? "—"],
    ],
    amount: Number(r.amount),
    amountLabel: isDeposit ? "Amount received" : "Amount paid out",
    note: isDeposit
      ? "Received with thanks and credited to the member's savings account."
      : "Paid out and debited from the member's savings account.",
  });
}

export const Route = createFileRoute("/_authenticated/savings")({
  head: () => ({
    meta: [
      { title: "Savings — Flobbeto SACCO" },
      { name: "description", content: "Record and track member savings deposits and withdrawals." },
      { property: "og:title", content: "Savings — Flobbeto SACCO" },
      { property: "og:description", content: "Deposits, withdrawals and payroll savings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SavingsPage,
});

type Row = {
  id: string;
  txn_no: string;
  txn_date: string;
  txn_type: string;
  category: string;
  amount: number;
  method: string;
  reference: string | null;
  description: string | null;
  members: { full_name: string; member_no: string } | null;
};

const schema = z.object({
  member_id: z.string().uuid("Select a member"),
  txn_type: z.enum(["deposit", "withdrawal"]),
  category: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(1_000_000_000),
  method: z.string().min(1),
  txn_date: z.string().min(1),
  reference: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional(),
});

function SavingsPage() {
  const { can } = usePermissions();
  const canPost = can("savings.post");
  const { user } = useSession();
  const queryClient = useQueryClient();
  const members = useMembersList();
  const balances = useBalances();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    txn_type: "deposit",
    category: "monthly",
    method: "salary_deduction",
    txn_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      reference: paymentReference(current.txn_type ?? "deposit", current.method ?? "cash", new Date(`${current.txn_date}T00:00:00`)),
    }));
  }, [form.txn_type, form.method, form.txn_date]);

  const savings = useQuery({
    queryKey: ["savings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_transactions")
        .select("*, members(full_name, member_no)")
        .order("txn_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const d = parsed.data;
      if (d.txn_type === "withdrawal") {
        const bal = Number(
          balances.data?.find((b) => b.member_id === d.member_id)?.savings_balance ?? 0,
        );
        if (d.amount > bal)
          throw new Error(
            `Withdrawal rejected: member savings balance is ${ugx(bal)}. A member cannot withdraw more than they have saved.`,
          );
      }
      const { error } = await supabase.from("savings_transactions").insert({
        member_id: d.member_id,
        txn_type: d.txn_type,
        category: d.category,
        amount: d.amount,
        method: d.method as never,
        txn_date: d.txn_date,
        reference: d.reference || paymentReference(d.txn_type, d.method, new Date(`${d.txn_date}T00:00:00`)),
        description: d.description || null,
        recorded_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Savings transaction recorded");
      setOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record transaction"),
  });

  const rows = savings.data ?? [];
  const deposits = rows.filter((r) => r.txn_type === "deposit").reduce((a, r) => a + Number(r.amount), 0);
  const withdrawals = rows.filter((r) => r.txn_type === "withdrawal").reduce((a, r) => a + Number(r.amount), 0);

  const columns: Column<Row>[] = [
    { key: "txn", header: "Txn No", cell: (r) => <span className="font-mono text-xs">{r.txn_no}</span> },
    { key: "date", header: "Date", cell: (r) => shortDate(r.txn_date) },
    {
      key: "member",
      header: "Member",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.members?.full_name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{r.members?.member_no}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => (
        <Badge variant={r.txn_type === "deposit" ? "secondary" : "outline"} className="capitalize">
          {r.txn_type} · {r.category}
        </Badge>
      ),
    },
    { key: "method", header: "Method", cell: (r) => r.method.replace("_", " ") },
    { key: "ref", header: "Reference", cell: (r) => r.reference ?? "—" },
    {
      key: "amount",
      header: "Amount",
      className: "text-right",
      cell: (r) => (
        <span className={r.txn_type === "deposit" ? "text-success" : "text-destructive"}>
          {r.txn_type === "deposit" ? "+" : "−"}
          {ugx(Number(r.amount))}
        </span>
      ),
    },
    {
      key: "receipt",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => savingsReceipt(r)}>
          <Receipt className="size-4" /> Receipt
        </Button>
      ),
    },
  ];

  return (
    <AppShell title="Savings" description="Deposits, withdrawals and payroll savings">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total deposits" value={ugx(deposits)} tone="success" />
        <StatCard label="Total withdrawals" value={ugx(withdrawals)} tone="destructive" />
        <StatCard label="Net savings held" value={ugx(deposits - withdrawals)} tone="gold" />
      </div>

      <PageTable
        rows={rows}
        columns={columns}
        searchable={(r) => `${r.members?.full_name ?? ""} ${r.members?.member_no ?? ""} ${r.txn_no} ${r.reference ?? ""}`}
        searchPlaceholder="Search member, transaction or receipt no…"
        empty={savings.isLoading ? "Loading…" : "No savings transactions recorded."}
        toolbar={
          <>
            <ExportMenu
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-savings.pdf",
                  title: "Savings transactions",
                  subtitle: `${rows.length} transaction(s)`,
                  head: ["Txn No", "Date", "Member", "Member No", "Type", "Category", "Method", "Amount (UGX)"],
                  body: rows.map((r) => [
                    r.txn_no,
                    shortDate(r.txn_date),
                    r.members?.full_name ?? "",
                    r.members?.member_no ?? "",
                    r.txn_type,
                    r.category,
                    r.method.replace(/_/g, " "),
                    Number(r.amount).toLocaleString(),
                  ]),
                  orientation: "landscape",
                  columnStyles: { 7: { halign: "right" } },
                })
              }
            />
            {canPost ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-4" /> Record savings
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Record savings transaction</DialogTitle>
                    <DialogDescription>
                      The member balance and the SACCO ledger update immediately.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label>Member</Label>
                      <Select
                        value={form['member_id'] ?? ""}
                        onValueChange={(v) => setForm((f) => ({ ...f, member_id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent>
                          {(members.data ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.member_no} — {m.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Type</Label>
                        <Select
                          value={form['txn_type'] ?? "deposit"}
                          onValueChange={(v) => setForm((f) => ({ ...f, txn_type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="deposit">Deposit</SelectItem>
                            <SelectItem value="withdrawal">Withdrawal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select
                          value={form['category'] ?? "monthly"}
                          onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="voluntary">Voluntary</SelectItem>
                            <SelectItem value="special">Special</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="amount">Amount (UGX)</Label>
                        <Input
                          id="amount"
                          type="number"
                          min={1}
                          value={form['amount'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={form['txn_date'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, txn_date: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Payment method</Label>
                        <Select
                          value={form['method'] ?? "cash"}
                          onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reference">Receipt / reference</Label>
                        <Input
                          id="reference"
                          value={form['reference'] ?? ""}
                          maxLength={60}
                          readOnly
                          aria-describedby="reference-help"
                        />
                        <p id="reference-help" className="text-xs text-muted-foreground">Generated from the transaction type, payment method and date.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        maxLength={300}
                        value={form['description'] ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                      {create.isPending ? "Posting…" : "Post transaction"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        }
      />
    </AppShell>
  );
}
