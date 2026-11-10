import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { MemberStatement } from "@/components/MemberStatement";
import { StatCard } from "@/components/StatCard";
import { ExportMenu } from "@/components/ExportMenu";
import { exportExcel, exportPdfTable } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBalances, useMembersList, usePermissions } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { LOAN_STATUS_LABEL, loanTotals, shortDate, ugx } from "@/lib/sacco";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Flobbeto SACCO" },
      { name: "description", content: "Financial summaries, member reports and loan portfolio analysis." },
      { property: "og:title", content: "Reports — Flobbeto SACCO" },
      { property: "og:description", content: "Export SACCO financial and membership reports." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { can } = usePermissions();
  const canExport = can("reports.export");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const balances = useBalances();
  const memberOptions = useMembersList();

  const txns = useQuery({
    queryKey: ["report-transactions"],
    queryFn: async () => (await supabase.from("transactions").select("*").order("txn_date")).data ?? [],
  });

  const loans = useQuery({
    queryKey: ["report-loans"],
    queryFn: async () =>
      (await supabase.from("loans").select("*, members(full_name, member_no)").order("applied_at")).data ?? [],
  });

  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const t = (txns.data ?? []).filter((x) => inRange(x.txn_date));
  const sum = (cat: string, dir: string) =>
    t.filter((x) => x.category === cat && x.direction === dir).reduce((a, x) => a + Number(x.amount), 0);

  const deposits = sum("savings_deposit", "in");
  const withdrawals = sum("savings_withdrawal", "out");
  const shares = sum("share_purchase", "in");
  const disbursed = sum("loan_disbursement", "out");
  const repayments = sum("loan_repayment", "in");
  const inflow = t.filter((x) => x.direction === "in").reduce((a, x) => a + Number(x.amount), 0);
  const outflow = t.filter((x) => x.direction === "out").reduce((a, x) => a + Number(x.amount), 0);
  const summaryRows = [
    { item: "Savings deposits", amount: deposits },
    { item: "Savings withdrawals", amount: withdrawals },
    { item: "Share capital raised", amount: shares },
    { item: "Loans disbursed", amount: disbursed },
    { item: "Loan repayments received", amount: repayments },
    { item: "Total inflow", amount: inflow },
    { item: "Total outflow", amount: outflow },
    { item: "Net position", amount: inflow - outflow },
  ];

  const members = balances.data ?? [];
  const selectedMember = members.find((member) => member.member_id === selectedMemberId);
  const loanRows = (loans.data ?? []).filter((l) => inRange(String(l.applied_at).slice(0, 10)));

  const statusSummary = Object.keys(LOAN_STATUS_LABEL).map((s) => {
    const set = loanRows.filter((l) => l.status === s);
    return {
      status: LOAN_STATUS_LABEL[s]!,
      count: set.length,
      value: set.reduce((a, l) => a + Number(l.amount_approved ?? l.amount_requested), 0),
    };
  });

  return (
    <AppShell
      title="Reports"
      description="Financial statements, membership and loan portfolio"
      actions={
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      }
    >
      <Card className="mb-6 shadow-[var(--shadow-card)]">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">
              Period from
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">
              Period to
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total inflow" value={ugx(inflow)} tone="success" />
        <StatCard label="Total outflow" value={ugx(outflow)} tone="destructive" />
        <StatCard label="Net cash position" value={ugx(inflow - outflow)} tone="gold" />
        <StatCard label="Active members" value={String(members.length)} />
      </div>

      <Tabs defaultValue="financial" className="mt-6">
        <TabsList>
          <TabsTrigger value="financial">Financial summary</TabsTrigger>
          <TabsTrigger value="members">Member report</TabsTrigger>
          <TabsTrigger value="loans">Loan portfolio</TabsTrigger>
        </TabsList>

        <TabsContent value="financial">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Income and movement summary</CardTitle>
              <ExportMenu
              disabled={!canExport}
                onPdf={() =>
                  exportPdfTable({
                    filename: "flobbeto-financial-summary.pdf",
                    title: "Financial summary",
                    subtitle: `${from || "start"} to ${to || "today"}`,
                    head: ["Item", "Amount (UGX)"],
                    body: summaryRows.map((r) => [r.item, r.amount.toLocaleString()]),
                    columnStyles: { 1: { halign: "right" } },
                  })
                }
                onExcel={() => exportExcel("flobbeto-financial-summary.xlsx", "Summary", summaryRows)}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Savings deposits", deposits],
                    ["Savings withdrawals", withdrawals],
                    ["Share capital raised", shares],
                    ["Loans disbursed", disbursed],
                    ["Loan repayments received", repayments],
                  ].map(([label, value]) => (
                    <TableRow key={String(label)}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right">{ugx(Number(value))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Net position</TableCell>
                    <TableCell className="text-right">{ugx(inflow - outflow)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card className="mb-6 shadow-[var(--shadow-card)]">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Member balances</CardTitle>
              <ExportMenu
              disabled={!canExport}
                onPdf={() =>
                  exportPdfTable({
                    filename: "flobbeto-member-report.pdf",
                    title: "Member balances report",
                    subtitle: `${members.length} member(s)`,
                    head: ["Member No", "Name", "Savings", "Shares", "Share value", "Borrowed", "Repaid", "Loan balance"],
                    body: members.map((m) => [
                      m.member_no ?? "",
                      m.full_name ?? "",
                      Number(m.savings_balance ?? 0).toLocaleString(),
                      Number(m.shares_owned ?? 0).toLocaleString(),
                      Number(m.shares_value ?? 0).toLocaleString(),
                      Number(m.total_borrowed ?? 0).toLocaleString(),
                      Number(m.total_repaid ?? 0).toLocaleString(),
                      Number(m.loan_balance ?? 0).toLocaleString(),
                    ]),
                    orientation: "landscape",
                    columnStyles: Object.fromEntries([2, 3, 4, 5, 6, 7].map((i) => [i, { halign: "right" as const }])),
                  })
                }
                onExcel={() =>
                  exportExcel(
                    "flobbeto-member-report.xlsx",
                    "Members",
                    members.map((m) => ({
                      "Member No": m.member_no ?? "",
                      Name: m.full_name ?? "",
                      Savings: Number(m.savings_balance ?? 0),
                      Shares: Number(m.shares_owned ?? 0),
                      "Share value": Number(m.shares_value ?? 0),
                      Borrowed: Number(m.total_borrowed ?? 0),
                      Repaid: Number(m.total_repaid ?? 0),
                      "Loan balance": Number(m.loan_balance ?? 0),
                    })),
                  )
                }
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Savings</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Share value</TableHead>
                    <TableHead className="text-right">Borrowed</TableHead>
                    <TableHead className="text-right">Repaid</TableHead>
                    <TableHead className="text-right">Loan balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.member_id}>
                      <TableCell>
                        <span className="font-medium">{m.full_name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{m.member_no}</span>
                      </TableCell>
                      <TableCell className="text-right">{ugx(Number(m.savings_balance))}</TableCell>
                      <TableCell className="text-right">{m.shares_owned ?? 0}</TableCell>
                      <TableCell className="text-right">{ugx(Number(m.shares_value))}</TableCell>
                      <TableCell className="text-right">{ugx(Number(m.total_borrowed))}</TableCell>
                      <TableCell className="text-right">{ugx(Number(m.total_repaid))}</TableCell>
                      <TableCell className="text-right font-medium">{ugx(Number(m.loan_balance))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="mb-6 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Individual member financial report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-md space-y-1.5">
                <Label htmlFor="report-member">Select a member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger id="report-member">
                    <SelectValue placeholder="Choose a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {(memberOptions.data ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.member_no} — {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedMemberId && selectedMember ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Savings balance" value={ugx(Number(selectedMember.savings_balance ?? 0))} />
                    <StatCard
                      label="Shares"
                      value={`${Number(selectedMember.shares_owned ?? 0).toLocaleString()} · ${ugx(Number(selectedMember.shares_value ?? 0))}`}
                    />
                    <StatCard label="Total borrowed" value={ugx(Number(selectedMember.total_borrowed ?? 0))} />
                    <StatCard label="Loan balance" value={ugx(Number(selectedMember.loan_balance ?? 0))} />
                  </div>
                  <MemberStatement memberId={selectedMemberId} />
                </>
              ) : selectedMemberId ? (
                <p className="text-sm text-muted-foreground">Member balances are loading or unavailable.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Choose a member to view and print their financial statement.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-base">Portfolio by status</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Loans</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusSummary.map((s) => (
                      <TableRow key={s.status}>
                        <TableCell>{s.status}</TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                        <TableCell className="text-right">{ugx(s.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Loan schedule detail</CardTitle>
                <ExportMenu
              disabled={!canExport}
                  onPdf={() =>
                    exportPdfTable({
                      filename: "flobbeto-loan-portfolio.pdf",
                      title: "Loan portfolio",
                      subtitle: `${loanRows.length} loan(s)`,
                      head: ["Loan No", "Member", "Principal", "Interest", "Total due", "Monthly", "Status", "Applied"],
                      body: loanRows.map((l) => {
                        const p = Number(l.amount_approved ?? l.amount_requested);
                        const sch = loanTotals(p, Number(l.interest_rate), l.period_months);
                        return [
                          l.loan_no,
                          (l.members as { full_name?: string } | null)?.full_name ?? "",
                          p.toLocaleString(),
                          sch.interest.toLocaleString(),
                          sch.total.toLocaleString(),
                          sch.monthly.toLocaleString(),
                          LOAN_STATUS_LABEL[l.status] ?? l.status,
                          shortDate(l.applied_at),
                        ];
                      }),
                      orientation: "landscape",
                      columnStyles: Object.fromEntries([2, 3, 4, 5].map((i) => [i, { halign: "right" as const }])),
                    })
                  }
                  onExcel={() =>
                    exportExcel(
                      "flobbeto-loan-portfolio.xlsx",
                      "Loans",
                      loanRows.map((l) => {
                        const p = Number(l.amount_approved ?? l.amount_requested);
                        const sch = loanTotals(p, Number(l.interest_rate), l.period_months);
                        return {
                          "Loan No": l.loan_no,
                          Member: (l.members as { full_name?: string } | null)?.full_name ?? "",
                          Principal: p,
                          Interest: sch.interest,
                          "Total due": sch.total,
                          Monthly: sch.monthly,
                          Status: l.status,
                          Applied: l.applied_at,
                        };
                      }),
                    )
                  }
                />
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Total due</TableHead>
                      <TableHead>Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loanRows.map((l) => {
                      const p = Number(l.amount_approved ?? l.amount_requested);
                      return (
                        <TableRow key={l.id}>
                          <TableCell>
                            <span className="font-mono text-xs">{l.loan_no}</span>
                            <span className="block text-xs text-muted-foreground">
                              {(l.members as { full_name?: string } | null)?.full_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{ugx(p)}</TableCell>
                          <TableCell className="text-right">
                            {ugx(loanTotals(p, Number(l.interest_rate), l.period_months).total)}
                          </TableCell>
                          <TableCell>{shortDate(l.applied_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
