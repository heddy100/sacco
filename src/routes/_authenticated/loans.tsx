import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PageTable, type Column } from "@/components/PageTable";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useBalances, useGuarantorMembers, useMembersList, useRoles, useSession, usePermissions, useSaccoSettings } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable, loanApplicationPdf, loanDisbursementPdf } from "@/lib/pdf";
import {
  LOAN_STATUS_LABEL,
  MONTHLY_INTEREST_RATE,
  SHARE_PRICE,
  loanLimitFromShares,
  loanTotals,
  monthlySchedule,
  shortDate,
  ugx,
} from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/loans")({
  head: () => ({
    meta: [
      { title: "Loans — Flobbeto SACCO" },
      { name: "description", content: "Loan applications, approvals, disbursement and portfolio health." },
      { property: "og:title", content: "Loans — Flobbeto SACCO" },
      { property: "og:description", content: "Manage the SACCO loan book end to end." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoansPage,
});

export type LoanRow = {
  id: string;
  loan_no: string;
  member_id: string;
  amount_requested: number;
  amount_approved: number | null;
  interest_rate: number;
  period_months: number;
  purpose: string | null;
  status: string;
  applied_at: string;
  disbursed_at: string | null;
  rejection_reason: string | null;
  guarantor1_name: string | null;
  guarantor1_contact: string | null;
  guarantor2_name: string | null;
  guarantor2_contact: string | null;
  members: { full_name: string; member_no: string } | null;
  loan_products: { name: string } | null;
};

const schema = z.object({
  member_id: z.string().uuid("Select a member"),
  product_id: z.string().uuid("Select a loan product"),
  amount_requested: z.coerce.number().positive("Enter the amount").max(1_000_000_000),
  period_months: z.coerce.number().int().positive().max(120),
  purpose: z.string().trim().max(300).optional(),
  guarantor1_member_id: z.string().uuid("Select guarantor 1"),
  guarantor1_contact: z.string().trim().min(5, "Guarantor 1 contact is required").max(30),
  guarantor2_member_id: z.string().uuid("Select guarantor 2"),
  guarantor2_contact: z.string().trim().min(5, "Guarantor 2 contact is required").max(30),
});

const STATUS_TONE: Record<string, "secondary" | "outline" | "destructive" | "default"> = {
  pending: "outline",
  under_review: "outline",
  approved: "secondary",
  disbursed: "default",
  completed: "secondary",
  rejected: "destructive",
};

function LoansPage() {
  const { canPost, isCommittee, isStaff, member } = useRoles();
  const { can } = usePermissions();
  const { user } = useSession();
  const settings = useSaccoSettings();
  const sharePrice = Number(settings.data?.share_price ?? SHARE_PRICE);
  const loanMultiplier = Number(settings.data?.loan_to_savings_ratio ?? 3);
  const monthlyInterestRate = Number(settings.data?.interest_rate ?? MONTHLY_INTEREST_RATE);
  const queryClient = useQueryClient();
  const members = useMembersList();
  const guarantorMembers = useGuarantorMembers();
  const balances = useBalances();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<Record<string, string>>({ period_months: "12" });

  useEffect(() => {
    if (!canPost && member?.id) {
      setForm((current) => (current.member_id === member.id ? current : { ...current, member_id: member.id }));
    }
  }, [canPost, member?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("loan-application-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "loans" }, () => {
        queryClient.invalidateQueries({ queryKey: ["loans"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["member-balances"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: async () =>
      (await supabase.from("loan_products").select("*").eq("active", true).order("name")).data ?? [],
  });

  const loans = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data: loanData, error } = await supabase
        .from("loans")
        .select("*")
        .order("applied_at", { ascending: false });
      if (error) throw new Error(`Could not load loan applications: ${error.message}`);
      const loanRows = loanData ?? [];
      const memberIds = [...new Set(loanRows.map((loan) => loan.member_id))];
      const productIds = [...new Set(loanRows.map((loan) => loan.product_id).filter(Boolean))];
      const [{ data: memberRows }, { data: productRows }] = await Promise.all([
        memberIds.length ? supabase.from("members").select("id, full_name, member_no").in("id", memberIds) : Promise.resolve({ data: [] }),
        productIds.length ? supabase.from("loan_products").select("id, name").in("id", productIds) : Promise.resolve({ data: [] }),
      ]);
      const memberMap = new Map((memberRows ?? []).map((row) => [row.id, row]));
      const productMap = new Map((productRows ?? []).map((row) => [row.id, row]));
      return loanRows.map((loan) => ({
        ...loan,
        members: memberMap.get(loan.member_id) ?? null,
        loan_products: loan.product_id ? productMap.get(loan.product_id) ?? null : null,
      })) as unknown as LoanRow[];
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const repayTotals = useQuery({
    queryKey: ["loan-repay-totals"],
    queryFn: async () => {
      const { data } = await supabase.from("loan_repayments").select("loan_id, amount");
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.loan_id] = (map[r.loan_id] ?? 0) + Number(r.amount);
      return map;
    },
  });

  const selectedMember = members.data?.find((m) => m.id === form['member_id']) ??
    (member?.id === form['member_id'] ? member : undefined);
  const memberShares = Number(
    balances.data?.find((b) => b.member_id === form['member_id'])?.shares_owned ?? 0,
  );
  const shareLimit = loanLimitFromShares(memberShares, sharePrice, loanMultiplier);

  const applicationPdf = async (l: LoanRow) => {
    const principal = Number(l.amount_approved ?? l.amount_requested);
    const sch = monthlySchedule(principal, l.period_months, monthlyInterestRate);
    const shares = Number(balances.data?.find((b) => b.member_id === l.member_id)?.shares_owned ?? 0);
    await loanApplicationPdf({
      filename: `loan-application-${l.loan_no}.pdf`,
      loanNo: l.loan_no,
      date: shortDate(l.applied_at),
      memberName: l.members?.full_name ?? "",
      memberNo: l.members?.member_no ?? "",
      amount: principal,
      loanLimit: loanLimitFromShares(shares, sharePrice, loanMultiplier),
      shares,
      months: l.period_months,
      purpose: l.purpose ?? "",
      interest: sch.interest,
      total: sch.total,
      monthly: sch.monthly,
      guarantors: [
        { name: l.guarantor1_name ?? "", contact: l.guarantor1_contact ?? "" },
        { name: l.guarantor2_name ?? "", contact: l.guarantor2_contact ?? "" },
      ],
    });
  };


  const apply = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const d = parsed.data;
      const product = products.data?.find((p) => p.id === d.product_id);
      if (!product) throw new Error("Select an active loan type");
      if (d.guarantor1_member_id === d.guarantor2_member_id)
        throw new Error("The two guarantors must be different members");
      if (d.guarantor1_member_id === d.member_id || d.guarantor2_member_id === d.member_id)
        throw new Error("A member cannot guarantee their own loan");
      const shares = Number(balances.data?.find((b) => b.member_id === d.member_id)?.shares_owned ?? 0);
      const cap = loanLimitFromShares(shares, sharePrice, loanMultiplier);
      if (d.amount_requested > cap)
        throw new Error(
          `Loan limit reached: with ${shares} share(s) (UGX ${sharePrice.toLocaleString()} each) this member can borrow up to ${ugx(cap)} (${loanMultiplier}x share capital).`,
        );
      if (d.amount_requested > product.max_amount)
        throw new Error(`${product.name} allows a maximum loan of ${ugx(Number(product.max_amount))}`);
      if (d.period_months > product.max_period_months)
        throw new Error(`${product.name} allows a maximum of ${product.max_period_months} months`);
      const g1 = guarantorMembers.data?.find((m) => m.id === d.guarantor1_member_id);
      const g2 = guarantorMembers.data?.find((m) => m.id === d.guarantor2_member_id);
      const { data: insertedLoan, error } = await supabase.from("loans").insert({
        member_id: d.member_id,
        product_id: d.product_id,
        amount_requested: d.amount_requested,
        period_months: d.period_months,
        interest_rate: Number(product.interest_rate),
        purpose: d.purpose || null,
        status: "pending",
        guarantor1_member_id: d.guarantor1_member_id,
        guarantor1_name: g1?.full_name ?? null,
        guarantor1_contact: d.guarantor1_contact,
        guarantor2_member_id: d.guarantor2_member_id,
        guarantor2_name: g2?.full_name ?? null,
        guarantor2_contact: d.guarantor2_contact,
      }).select("id").single();
      if (error) throw new Error(`Could not save loan application: ${error.message} (${error.code ?? "database error"})`);
      if (!insertedLoan) throw new Error("Loan application was not returned after saving");
    },
    onSuccess: () => {
      toast.success("Loan application submitted");
      setOpen(false);
      setForm({ period_months: "12" });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["member-balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit application"),
  });

  const decide = useMutation({
    mutationFn: async ({ loan, action }: { loan: LoanRow; action: string }) => {
      const now = new Date().toISOString();
      if (action === "review")
        return supabase
          .from("loans")
          .update({ status: "under_review", reviewed_at: now, reviewed_by: user?.id ?? null })
          .eq("id", loan.id)
          .throwOnError();
      if (action === "approve")
        return supabase
          .from("loans")
          .update({
            status: "approved",
            amount_approved: loan.amount_approved ?? loan.amount_requested,
            approved_at: now,
            approved_by: user?.id ?? null,
          })
          .eq("id", loan.id)
          .throwOnError();
      if (action === "reject") {
        const reason = window.prompt("Reason for rejection") ?? "";
        if (!reason.trim()) throw new Error("A rejection reason is required");
        return supabase
          .from("loans")
          .update({ status: "rejected", rejection_reason: reason.slice(0, 300), reviewed_at: now })
          .eq("id", loan.id)
          .throwOnError();
      }
      if (action === "disburse")
        return supabase
          .from("loans")
          .update({ status: "disbursed", disbursed_at: now })
          .eq("id", loan.id)
          .throwOnError();
      return null;
    },
    onSuccess: () => {
      toast.success("Loan updated");
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["member-balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update loan"),
  });

  const all = loans.data ?? [];
  const rows = statusFilter === "all" ? all : all.filter((l) => l.status === statusFilter);
  const canReviewLoans = isStaff && can("loans.review");
  const canApproveLoans = isStaff && (isCommittee || can("loans.approve"));

  const disbursed = all.filter((l) => l.status === "disbursed" || l.status === "completed");
  const portfolio = disbursed.reduce((a, l) => {
    const p = Number(l.amount_approved ?? l.amount_requested);
    return a + loanTotals(p, Number(l.interest_rate), l.period_months).total;
  }, 0);
  const repaid = Object.values(repayTotals.data ?? {}).reduce((a, b) => a + b, 0);
  const pending = all.filter((l) => l.status === "pending" || l.status === "under_review").length;
  const decisionQueue = all.filter((l) => ["pending", "under_review", "approved"].includes(l.status));

  const columns: Column<LoanRow>[] = [
    { key: "loan_no", header: "Loan No", cell: (l) => <span className="font-mono text-xs">{l.loan_no}</span> },
    {
      key: "member",
      header: "Member",
      cell: (l) => (
        <div>
          <span className="font-medium">{l.members?.full_name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{l.members?.member_no}</span>
        </div>
      ),
    },
    { key: "product", header: "Product", cell: (l) => l.loan_products?.name ?? "—" },
    {
      key: "amount",
      header: "Principal",
      className: "text-right",
      cell: (l) => ugx(Number(l.amount_approved ?? l.amount_requested)),
    },
    { key: "terms", header: "Terms", cell: (l) => `${l.interest_rate}% · ${l.period_months} mo` },
    {
      key: "due",
      header: "Total due",
      className: "text-right",
      cell: (l) =>
        ugx(
          loanTotals(Number(l.amount_approved ?? l.amount_requested), Number(l.interest_rate), l.period_months)
            .total,
        ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      className: "text-right",
      cell: (l) => {
        if (l.status !== "disbursed" && l.status !== "completed") return "—";
        const total = loanTotals(
          Number(l.amount_approved ?? l.amount_requested),
          Number(l.interest_rate),
          l.period_months,
        ).total;
        return (
          <span className="font-medium">{ugx(Math.max(0, total - (repayTotals.data?.[l.id] ?? 0)))}</span>
        );
      },
    },
    { key: "applied", header: "Applied", cell: (l) => shortDate(l.applied_at) },
    {
      key: "status",
      header: "Status",
      cell: (l) => (
        <Badge variant={STATUS_TONE[l.status] ?? "outline"}>{LOAN_STATUS_LABEL[l.status] ?? l.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "sticky right-0 bg-card text-right shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.35)]",
      cell: (l) => {
        const actions: Array<[string, string]> = [];
        if (l.status === "pending" && canReviewLoans) actions.push(["review", "Review"]);
        if ((l.status === "pending" || l.status === "under_review") && canApproveLoans) {
          actions.push(["approve", "Approve"], ["reject", "Reject"]);
        }
        if (l.status === "approved" && can("loans.disburse")) actions.push(["disburse", "Disburse"]);
        return (
          <div className="flex min-w-max justify-end gap-1">
            <Button size="sm" variant="outline" title="Preview loan application PDF" onClick={() => applicationPdf(l)}>
              <FileText className="size-4" /> Preview
            </Button>
            {actions.map(([action, label]) => (
              <Button
                key={action}
                size="sm"
                variant={action === "reject" ? "outline" : action === "approve" ? "default" : "secondary"}
                onClick={() => decide.mutate({ loan: l, action })}
                disabled={decide.isPending}
              >
                {label}
              </Button>
            ))}
            {!actions.length && !isStaff ? (
              <span className="px-2 text-xs text-muted-foreground">Staff approval access required</span>
            ) : null}
          </div>
        );
      },
    },
  ];

  const canApply = canPost || !!member;

  return (
    <AppShell title="Loans" description="Applications, approvals, disbursement and portfolio">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active loan book" value={ugx(portfolio)} tone="gold" />
        <StatCard label="Repaid to date" value={ugx(repaid)} tone="success" />
        <StatCard label="Outstanding" value={ugx(Math.max(0, portfolio - repaid))} tone="warning" />
        <StatCard label="Awaiting decision" value={String(pending)} />
      </div>

      {isStaff ? (
        <Card className="mb-6 border-primary/20 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Loan decisions</CardTitle>
            <CardDescription>Review applications, approve or reject them, then disburse approved loans.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisionQueue.map((loan) => (
              <div key={loan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{loan.members?.full_name ?? "Member"} <span className="font-mono text-xs text-muted-foreground">{loan.loan_no}</span></p>
                  <p className="text-sm text-muted-foreground">{ugx(Number(loan.amount_approved ?? loan.amount_requested))} · {LOAN_STATUS_LABEL[loan.status] ?? loan.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => applicationPdf(loan)}><FileText className="size-4" /> Preview</Button>
                  {loan.status === "pending" && canReviewLoans ? <Button size="sm" variant="secondary" onClick={() => decide.mutate({ loan, action: "review" })} disabled={decide.isPending}>Review</Button> : null}
                  {(loan.status === "pending" || loan.status === "under_review") && canApproveLoans ? <><Button size="sm" onClick={() => decide.mutate({ loan, action: "approve" })} disabled={decide.isPending}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ loan, action: "reject" })} disabled={decide.isPending}>Reject</Button></> : null}
                  {loan.status === "approved" && can("loans.disburse") ? <Button size="sm" onClick={() => decide.mutate({ loan, action: "disburse" })} disabled={decide.isPending}>Disburse</Button> : null}
                </div>
              </div>
            ))}
            {decisionQueue.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No loans currently awaiting action.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <PageTable
        rows={rows}
        columns={columns}
        searchable={(l) => `${l.members?.full_name ?? ""} ${l.members?.member_no ?? ""} ${l.loan_no} ${l.purpose ?? ""}`}
        searchPlaceholder="Search member, loan number or purpose…"
        empty={loans.isLoading ? "Loading…" : loans.isError ? (loans.error instanceof Error ? loans.error.message : "Could not load loan applications") : "No loan applications yet."}
        toolbar={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(LOAN_STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportMenu
              label="Export list"
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-loans.pdf",
                  title: "Loan register",
                  subtitle: `${rows.length} loan(s)`,
                  head: ["Loan No", "Member", "Member No", "Requested", "Approved", "Months", "Status", "Applied"],
                  body: rows.map((l) => [
                    l.loan_no,
                    l.members?.full_name ?? "",
                    l.members?.member_no ?? "",
                    Number(l.amount_requested).toLocaleString(),
                    Number(l.amount_approved ?? 0).toLocaleString(),
                    l.period_months,
                    LOAN_STATUS_LABEL[l.status] ?? l.status,
                    shortDate(l.applied_at),
                  ]),
                  orientation: "landscape",
                  columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
                })
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                loanDisbursementPdf({
                  filename: "flobbeto-loan-disbursement.pdf",
                  date: shortDate(new Date().toISOString()),
                  rows: rows
                    .filter((l) => l.status === "approved" || l.status === "disbursed")
                    .map((l) => {
                      const approved = Number(l.amount_approved ?? l.amount_requested);
                      return {
                        memberNo: l.members?.member_no ?? "",
                        memberName: l.members?.full_name ?? "",
                        applied: Number(l.amount_requested),
                        approved,
                        months: l.period_months,
                        interest: monthlySchedule(approved, l.period_months).interest,
                        guarantors: [
                          { name: l.guarantor1_name ?? "", contact: l.guarantor1_contact ?? "" },
                          { name: l.guarantor2_name ?? "", contact: l.guarantor2_contact ?? "" },
                        ],
                      };
                    }),
                })
              }
            >
              <FileText className="size-4" /> Disbursement sheet
            </Button>
            {canApply ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-4" /> New application
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Loan application</DialogTitle>
                    <DialogDescription>
                      Eligibility is checked against the member's savings before submission.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label>Member</Label>
                      <Select
                        value={form['member_id'] ?? ""}
                        onValueChange={(v) => setForm((f) => ({ ...f, member_id: v }))}
                        disabled={!canPost && !!member}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent>
                          {(canPost ? (members.data ?? []) : (members.data ?? []).filter((m) => m.id === member?.id)).map(
                            (m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.member_no} — {m.full_name}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="member_no">Member's number</Label>
                        <Input id="member_no" value={selectedMember?.member_no ?? ""} readOnly disabled />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="limit">Loan limit (3x share capital)</Label>
                        <Input id="limit" value={ugx(shareLimit)} readOnly disabled />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Loan product</Label>
                      <Select
                        value={form['product_id'] ?? ""}
                        onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {(products.data ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.interest_rate}% p.a.)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="amount">Amount (UGX)</Label>
                        <Input
                          id="amount"
                          type="number"
                          min={1}
                          value={form['amount_requested'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, amount_requested: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="months">Period (months)</Label>
                        <Input
                          id="months"
                          type="number"
                          min={1}
                          value={form['period_months'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, period_months: e.target.value }))}
                        />
                      </div>
                    </div>
                    {Number(form['amount_requested'] ?? 0) > 0 ? (
                      <div className="rounded-md bg-muted/60 p-3 text-sm">
                        {(() => {
                          const t = monthlySchedule(
                            Number(form['amount_requested'] ?? 0),
                            Number(form['period_months'] ?? 0),
                          );
                          return (
                            <ul className="space-y-1 text-muted-foreground">
                              <li>
                                Interest (1.5% per month):{" "}
                                <span className="font-medium text-foreground">{ugx(t.interest)}</span>
                              </li>
                              <li>
                                Total repayable: <span className="font-medium text-foreground">{ugx(t.total)}</span>
                              </li>
                              <li>
                                Monthly instalment:{" "}
                                <span className="font-medium text-foreground">{ugx(t.monthly)}</span>
                              </li>
                              <li>
                                Shares held: <span className="font-medium text-foreground">{memberShares}</span> ·
                                Limit: <span className="font-medium text-foreground">{ugx(shareLimit)}</span>
                              </li>
                            </ul>
                          );
                        })()}
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor="purpose">Purpose</Label>
                      <Textarea
                        id="purpose"
                        maxLength={300}
                        value={form['purpose'] ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                      />
                    </div>
                    {[1, 2].map((n) => (
                      <div key={n} className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Guarantor {n} (SACCO member)</Label>
                          <Select
                            value={form[`guarantor${n}_member_id`] ?? ""}
                            onValueChange={(v) => {
                              const g = (guarantorMembers.data ?? []).find((m) => m.id === v);
                              setForm((f) => ({
                                ...f,
                                [`guarantor${n}_member_id`]: v,
                                [`guarantor${n}_contact`]: g?.phone ?? "",
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select member" />
                            </SelectTrigger>
                            <SelectContent>
                              {(guarantorMembers.data ?? []).filter((m) => m.id !== form['member_id']).map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.member_no} — {m.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`g${n}c`}>Guarantor {n} contact</Label>
                          <Input
                            id={`g${n}c`}
                            value={form[`guarantor${n}_contact`] ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, [`guarantor${n}_contact`]: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
                      {apply.isPending ? "Submitting…" : "Submit application"}
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
