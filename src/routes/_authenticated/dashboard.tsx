import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  Clock,
  HandCoins,
  PieChart,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBalances, useRoles, useSaccoSettings } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { LOAN_STATUS_LABEL, SACCO_SHORT, shortDate, ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Flobbeto SACCO" },
      { name: "description", content: "Live savings, shares, loans and cash position for the SACCO." },
      { property: "og:title", content: "Dashboard — Flobbeto SACCO" },
      { property: "og:description", content: "Live SACCO performance at a glance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function monthKey(d: string) {
  return new Date(d).toISOString().slice(0, 7);
}

function Dashboard() {
  const { isStaff, member } = useRoles();
  const settings = useSaccoSettings();
  const balances = useBalances();

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [members, loans, savings, repayments, txns] = await Promise.all([
        supabase.from("members").select("id, status"),
        supabase.from("loans").select("*"),
        supabase.from("savings_transactions").select("txn_date, txn_type, amount"),
        supabase.from("loan_repayments").select("txn_date, amount"),
        supabase
          .from("transactions")
          .select("*, members(full_name, member_no)")
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      return {
        members: members.data ?? [],
        loans: loans.data ?? [],
        savings: savings.data ?? [],
        repayments: repayments.data ?? [],
        ledger: txns.data ?? [],
      };
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const b = balances.data ?? [];
  const s = stats.data;
  const totalSavings = b.reduce((a, r) => a + Number(r.savings_balance ?? 0), 0);
  const totalShares = b.reduce((a, r) => a + Number(r.shares_value ?? 0), 0);
  const totalWithdrawals = b.reduce((a, r) => a + Number(r.total_withdrawals ?? 0), 0);
  const loanBalance = b.reduce((a, r) => a + Number(r.loan_balance ?? 0), 0);
  const disbursedLoans = (s?.loans ?? []).filter((l) => ["disbursed", "completed"].includes(l.status));
  const issued = disbursedLoans.reduce(
    (a, l) => a + Number(l.amount_approved ?? l.amount_requested ?? 0),
    0,
  );
  const repaid = (s?.repayments ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const pending = (s?.loans ?? []).filter((l) => ["pending", "under_review"].includes(l.status));
  const ledger = s?.ledger ?? [];
  const recentSince = settings.data?.recent_transactions_since;
  const recent = ledger.filter((transaction) => !recentSince || transaction.created_at >= recentSince).slice(0, 8);
  const cashIn = ledger.filter((transaction) => transaction.direction === "in").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const cashOut = ledger.filter((transaction) => transaction.direction === "out").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const cash = cashIn - cashOut;

  const months: Record<string, { month: string; savings: number; repayments: number; withdrawals: number }> = {};
  for (const t of s?.savings ?? []) {
    const k = monthKey(t.txn_date);
    months[k] ??= { month: k, savings: 0, repayments: 0, withdrawals: 0 };
    if (t.txn_type === "deposit") months[k]!.savings += Number(t.amount);
    else months[k]!.withdrawals += Number(t.amount);
  }
  for (const r of s?.repayments ?? []) {
    const k = monthKey(r.txn_date);
    months[k] ??= { month: k, savings: 0, repayments: 0, withdrawals: 0 };
    months[k]!.repayments += Number(r.amount);
  }
  const series = Object.values(months)
    .sort((a, z) => a.month.localeCompare(z.month))
    .slice(-12)
    .map((m) => ({
      ...m,
      label: new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }));

  const portfolio = Object.entries(
    (s?.loans ?? []).reduce<Record<string, number>>((acc, l) => {
      acc[LOAN_STATUS_LABEL[l.status] ?? l.status] =
        (acc[LOAN_STATUS_LABEL[l.status] ?? l.status] ?? 0) +
        Number(l.amount_approved ?? l.amount_requested ?? 0);
      return acc;
    }, {}),
  ).map(([status, amount]) => ({ status, amount }));

  const mine = b.find((r) => r.member_id === member?.id);

  return (
    <AppShell
      title={isStaff ? "SACCO Dashboard" : "My SACCO"}
      description={`${SACCO_SHORT} — live position`}
      actions={
        isStaff ? (
          <div className="hidden gap-2 md:flex">
            <Button asChild size="sm" variant="outline">
              <Link to="/savings">Record savings</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/loans">Review loans</Link>
            </Button>
          </div>
        ) : null
      }
    >
      {!isStaff && mine ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="My savings" value={ugx(Number(mine.savings_balance))} icon={Wallet} />
          <StatCard label="My shares" value={ugx(Number(mine.shares_value))} icon={PieChart} tone="gold" />
          <StatCard label="Loan balance" value={ugx(Number(mine.loan_balance))} icon={HandCoins} tone="warning" />
          <StatCard label="Total repaid" value={ugx(Number(mine.total_repaid))} icon={Banknote} tone="success" />
        </div>
      ) : null}

      {isStaff ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Registered members"
            value={String(s?.members.length ?? 0)}
            hint={`${(s?.members ?? []).filter((m) => m.status === "active").length} active`}
            icon={Users}
          />
          <StatCard label="Total savings" value={ugx(totalSavings)} hint={`${ugx(totalWithdrawals)} withdrawn`} icon={Wallet} tone="success" />
          <StatCard label="Share capital" value={ugx(totalShares)} icon={PieChart} tone="gold" />
          <StatCard label="Cash in" value={ugx(cashIn)} tone="success" icon={Banknote} />
          <StatCard label="Cash out" value={ugx(cashOut)} tone="destructive" icon={Banknote} />
          <StatCard label="Cash & bank position" value={ugx(cash)} icon={Banknote} />
          <StatCard label="Loans issued" value={ugx(issued)} hint={`${disbursedLoans.length} loans`} icon={HandCoins} />
          <StatCard label="Outstanding loans" value={ugx(loanBalance)} tone="warning" icon={AlertTriangle} />
          <StatCard label="Loan repayments" value={ugx(repaid)} tone="success" icon={Banknote} />
          <StatCard label="Pending applications" value={String(pending.length)} hint="Awaiting review or approval" icon={Clock} tone="destructive" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Monthly savings vs repayments</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="sv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tickFormatter={(v) => ugx(Number(v), { compact: true })} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={80} />
                <Tooltip formatter={(v) => ugx(Number(v))} />
                <Legend />
                <Area name="Savings" type="monotone" dataKey="savings" stroke="var(--chart-1)" fill="url(#sv)" />
                <Area name="Repayments" type="monotone" dataKey="repayments" stroke="var(--chart-2)" fill="url(#rp)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Loan portfolio</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={portfolio} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tickFormatter={(v) => ugx(Number(v), { compact: true })} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={70} />
                <Tooltip formatter={(v) => ugx(Number(v))} />
                <Bar dataKey="amount" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.ref_no}</TableCell>
                  <TableCell>{shortDate(t.txn_date)}</TableCell>
                  <TableCell>
                    {(t.members as { full_name?: string } | null)?.full_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.direction === "in" ? "secondary" : "outline"}>{t.category}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${t.direction === "in" ? "text-success" : "text-destructive"}`}>
                    {t.direction === "in" ? "+" : "−"}
                    {ugx(Number(t.amount))}
                  </TableCell>
                </TableRow>
              ))}
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
