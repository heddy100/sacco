import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PageTable, type Column } from "@/components/PageTable";
import { StatCard } from "@/components/StatCard";
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
import { useSession, usePermissions } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable, receiptPdf } from "@/lib/pdf";
import { MONTHLY_INTEREST_RATE, PAYMENT_METHODS, monthlySchedule, shortDate, ugx } from "@/lib/sacco";

async function repaymentReceipt(r: Row) {
  await receiptPdf({
    filename: `repayment-receipt-${r.txn_no}.pdf`,
    title: "Loan Repayment Receipt",
    receiptNo: r.txn_no,
    date: shortDate(r.txn_date),
    memberName: r.members?.full_name ?? "\u2014",
    memberNo: r.members?.member_no ?? "\u2014",
    fields: [
      ["Loan number", r.loans?.loan_no ?? "\u2014"],
      ["Principal paid", ugx(Number(r.principal))],
      ["Interest paid (1.5% per month)", ugx(Number(r.interest))],
      ["Payment method", r.method.replace(/_/g, " ")],
      ["Reference", r.reference ?? "\u2014"],
    ],
    amount: Number(r.amount),
    amountLabel: "Total received",
    note: "Received with thanks and posted against the member's loan account.",
  });
}

export const Route = createFileRoute("/_authenticated/repayments")({
  head: () => ({
    meta: [
      { title: "Repayments — Flobbeto SACCO" },
      { name: "description", content: "Record loan repayments and track outstanding balances." },
      { property: "og:title", content: "Repayments — Flobbeto SACCO" },
      { property: "og:description", content: "Loan repayment posting and history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepaymentsPage,
});

type Row = {
  id: string;
  txn_no: string;
  txn_date: string;
  amount: number;
  principal: number;
  interest: number;
  method: string;
  reference: string | null;
  loans: { loan_no: string } | null;
  members: { full_name: string; member_no: string } | null;
};

const schema = z.object({
  loan_id: z.string().uuid("Select a loan"),
  amount: z.coerce.number().positive("Enter the amount").max(1_000_000_000),
  principal: z.coerce.number().min(0).optional(),
  interest: z.coerce.number().min(0).optional(),
  method: z.string().min(1),
  txn_date: z.string().min(1),
  reference: z.string().trim().max(60).optional(),
});

function RepaymentsPage() {
  const { can } = usePermissions();
  const canPost = can("repayments.post");
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    method: "salary_deduction",
    txn_date: new Date().toISOString().slice(0, 10),
  });

  const activeLoans = useQuery({
    queryKey: ["active-loans"],
    queryFn: async () => {
      const { data: loanRows, error } = await supabase
        .from("loans")
        .select("id, loan_no, member_id, amount_approved, amount_requested, interest_rate, period_months")
        .in("status", ["disbursed"])
        .order("loan_no");
      if (error) throw new Error(`Could not load borrower loans: ${error.message}`);
      const rows = loanRows ?? [];
      const memberIds = [...new Set(rows.map((loan) => loan.member_id))];
      const { data: memberRows, error: memberError } = memberIds.length
        ? await supabase.from("members").select("id, full_name, member_no").in("id", memberIds)
        : { data: [], error: null };
      if (memberError) throw new Error(`Could not load borrower names: ${memberError.message}`);
      const memberMap = new Map((memberRows ?? []).map((member) => [member.id, member]));
      return rows.map((loan) => ({ ...loan, members: memberMap.get(loan.member_id) ?? null }));
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
    retry: false,
  });

  const repayments = useQuery({
    queryKey: ["repayments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_repayments")
        .select("*, loans(loan_no), members(full_name, member_no)")
        .order("txn_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const selected = activeLoans.data?.find((l) => l.id === form['loan_id']);
  const principalDue = selected ? Number(selected.amount_approved ?? selected.amount_requested) : 0;
  const schedule = selected ? monthlySchedule(principalDue, selected.period_months) : null;
  const fixedInterest = principalDue * (MONTHLY_INTEREST_RATE / 100);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const d = parsed.data;
      const loan = activeLoans.data?.find((l) => l.id === d.loan_id);
      if (!loan) throw new Error("Loan not found");
      const { data: inserted, error } = await supabase.from("loan_repayments").insert({
        loan_id: d.loan_id,
        member_id: loan.member_id,
        amount: d.amount,
        principal: principalDue || d.amount,
        interest: principalDue * (MONTHLY_INTEREST_RATE / 100),
        penalty: 0,
        method: d.method as never,
        txn_date: d.txn_date,
        reference: d.reference || null,
        recorded_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw new Error(`Could not save repayment: ${error.message} (${error.code ?? "database error"})`);
      if (!inserted) throw new Error("Repayment was not returned after saving");
    },
    onSuccess: () => {
      toast.success("Repayment recorded");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["repayments"] });
      queryClient.invalidateQueries({ queryKey: ["active-loans"] });
      queryClient.invalidateQueries({ queryKey: ["member-balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record repayment"),
  });

  const rows = repayments.data ?? [];
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const interest = rows.reduce((a, r) => a + Number(r.interest), 0);

  const columns: Column<Row>[] = [
    { key: "txn", header: "Txn No", cell: (r) => <span className="font-mono text-xs">{r.txn_no}</span> },
    { key: "date", header: "Date", cell: (r) => shortDate(r.txn_date) },
    {
      key: "member",
      header: "Member",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.members?.full_name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{r.loans?.loan_no}</span>
        </div>
      ),
    },
    { key: "principal", header: "Principal", className: "text-right", cell: (r) => ugx(Number(r.principal)) },
    { key: "interest", header: "Interest", className: "text-right", cell: (r) => ugx(Number(r.interest)) },
    {
      key: "amount",
      header: "Total paid",
      className: "text-right",
      cell: (r) => <span className="font-medium text-success">{ugx(Number(r.amount))}</span>,
    },
    { key: "method", header: "Method", cell: (r) => r.method.replace("_", " ") },
    {
      key: "receipt",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => repaymentReceipt(r)}>
          <Receipt className="size-4" /> Receipt
        </Button>
      ),
    },
  ];

  return (
    <AppShell title="Repayments" description="Loan repayment posting and history">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total collected" value={ugx(total)} tone="success" />
        <StatCard label="Interest earned" value={ugx(interest)} tone="gold" />
        <StatCard label="Principal collected" value={ugx(rows.reduce((a, r) => a + Number(r.principal), 0))} />
      </div>

      <PageTable
        rows={rows}
        columns={columns}
        searchable={(r) => `${r.members?.full_name ?? ""} ${r.loans?.loan_no ?? ""} ${r.txn_no}`}
        searchPlaceholder="Search member, loan or transaction no…"
        empty={
          repayments.isLoading
            ? "Loading…"
            : repayments.isError
              ? repayments.error instanceof Error
                ? repayments.error.message
                : "Could not load repayments"
              : "No repayments recorded."
        }
        toolbar={
          <>
            <ExportMenu
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-repayments.pdf",
                  title: "Loan repayments",
                  subtitle: `${rows.length} repayment(s)`,
                  head: ["Txn No", "Date", "Member", "Loan No", "Principal", "Interest", "Total paid", "Method"],
                  body: rows.map((r) => [
                    r.txn_no,
                    shortDate(r.txn_date),
                    r.members?.full_name ?? "",
                    r.loans?.loan_no ?? "",
                    Number(r.principal).toLocaleString(),
                    Number(r.interest).toLocaleString(),
                    Number(r.amount).toLocaleString(),
                    r.method.replace(/_/g, " "),
                  ]),
                  orientation: "landscape",
                  columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
                })
              }
            />
            {canPost ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-4" /> Record repayment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Record loan repayment</DialogTitle>
                    <DialogDescription>Only disbursed loans can receive repayments.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label>Loan</Label>
                      {activeLoans.isError ? <p className="text-xs text-destructive">{activeLoans.error instanceof Error ? activeLoans.error.message : "Could not load borrower loans"}</p> : null}
                      <Select
                        value={form['loan_id'] ?? ""}
                        onValueChange={(v) => setForm((f) => ({ ...f, loan_id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select loan" />
                        </SelectTrigger>
                        <SelectContent>
                          {(activeLoans.data ?? []).map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.loan_no} — {(l.members as { full_name?: string } | null)?.full_name}
                            </SelectItem>
                          ))}
                          {(activeLoans.data ?? []).length === 0 ? (
                            <SelectItem value="__none" disabled>
                              {activeLoans.isLoading ? "Loading borrower loans…" : "No disbursed borrower loans available"}
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    {schedule ? (
                      <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                        Expected monthly instalment:{" "}
                        <span className="font-medium text-foreground">{ugx(schedule.monthly)}</span>
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="amount">Amount paid</Label>
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
                        <Label htmlFor="principal">Principal (approved loan amount)</Label>
                        <Input id="principal" value={ugx(principalDue)} readOnly disabled />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="interest">Interest (1.5% of principal)</Label>
                        <Input id="interest" value={ugx(fixedInterest)} readOnly disabled />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Method</Label>
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
                          maxLength={60}
                          value={form['reference'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                      {create.isPending ? "Posting…" : "Post repayment"}
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
