import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

import { AppShell } from "@/components/AppShell";
import { MemberStatement } from "@/components/MemberStatement";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoles } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { LOAN_STATUS_LABEL, loanTotals, shortDate, ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/my-account")({
  head: () => ({
    meta: [
      { title: "My account — Flobbeto SACCO" },
      { name: "description", content: "Your savings, shares, loans and personal SACCO statement." },
      { property: "og:title", content: "My account — Flobbeto SACCO" },
      { property: "og:description", content: "Personal SACCO member portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyAccountPage,
});

function MyAccountPage() {
  const { member, isLoading } = useRoles();
  const memberId = member?.id as string | undefined;

  const balance = useQuery({
    queryKey: ["my-balance", memberId],
    enabled: !!memberId,
    queryFn: async () =>
      (await supabase.from("member_balances").select("*").eq("member_id", memberId!).maybeSingle()).data,
  });

  const loans = useQuery({
    queryKey: ["my-loans", memberId],
    enabled: !!memberId,
    queryFn: async () =>
      (
        await supabase
          .from("loans")
          .select("*, loan_products(name)")
          .eq("member_id", memberId!)
          .order("applied_at", { ascending: false })
      ).data ?? [],
  });

  if (!isLoading && !memberId) {
    return (
      <AppShell title="My account" description="Personal SACCO portal">
        <Card className="mx-auto max-w-lg text-center shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">No membership record linked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your sign-in is not yet linked to a membership record. Ask the SACCO administrator to link your
              account so your savings, shares and loans appear here.
            </p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const b = balance.data;

  return (
    <AppShell
      title="My account"
      description={member ? `${member.member_no} · ${member.full_name}` : "Personal SACCO portal"}
      actions={
        <Button asChild size="sm">
          <Link to="/loans">Apply for a loan</Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My savings" value={ugx(Number(b?.savings_balance ?? 0))} tone="success" />
        <StatCard label="My shares" value={`${b?.shares_owned ?? 0} · ${ugx(Number(b?.shares_value ?? 0))}`} tone="gold" />
        <StatCard label="Loan balance" value={ugx(Number(b?.loan_balance ?? 0))} tone="warning" />
        <StatCard label="Total repaid" value={ugx(Number(b?.total_repaid ?? 0))} />
      </div>

      <Card className="mt-6 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">My loans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(loans.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">You have no loan applications yet.</p>
          ) : (
            (loans.data ?? []).map((l) => {
              const p = Number(l.amount_approved ?? l.amount_requested);
              const s = loanTotals(p, Number(l.interest_rate), l.period_months);
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {(l.loan_products as { name?: string } | null)?.name ?? "Loan"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">{l.loan_no}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Applied {shortDate(l.applied_at)} · {l.interest_rate}% · {l.period_months} months
                    </p>
                    {l.rejection_reason ? (
                      <p className="mt-1 text-xs text-destructive">Reason: {l.rejection_reason}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{ugx(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      Monthly {ugx(s.monthly)} · Total {ugx(s.total)}
                    </p>
                  </div>
                  <Badge variant={l.status === "rejected" ? "destructive" : "secondary"}>
                    {LOAN_STATUS_LABEL[l.status] ?? l.status}
                  </Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {memberId ? (
        <div className="mt-6">
          <MemberStatement memberId={memberId} />
        </div>
      ) : null}
    </AppShell>
  );
}
