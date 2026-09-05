import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { MemberStatement } from "@/components/MemberStatement";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/members/$memberId")({
  head: () => ({
    meta: [
      { title: "Member profile — Flobbeto SACCO" },
      { name: "description", content: "Member profile, balances and full account statement." },
      { property: "og:title", content: "Member profile — Flobbeto SACCO" },
      { property: "og:description", content: "Savings, shares, loans and statement for a SACCO member." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MemberDetail,
});

function MemberDetail() {
  const { memberId } = Route.useParams();

  const member = useQuery({
    queryKey: ["member", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, departments(name)")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const balance = useQuery({
    queryKey: ["member-balance", memberId],
    queryFn: async () =>
      (await supabase.from("member_balances").select("*").eq("member_id", memberId).maybeSingle()).data,
  });

  const m = member.data;
  const b = balance.data;

  return (
    <AppShell
      title={m?.full_name ?? "Member"}
      description={m ? `${m.member_no} · ${(m.departments as { name?: string } | null)?.name ?? "—"}` : ""}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/members">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Savings balance" value={ugx(Number(b?.savings_balance ?? 0))} tone="success" />
        <StatCard label="Shares" value={`${b?.shares_owned ?? 0} · ${ugx(Number(b?.shares_value ?? 0))}`} tone="gold" />
        <StatCard label="Loan balance" value={ugx(Number(b?.loan_balance ?? 0))} tone="warning" />
        <StatCard label="Total repaid" value={ugx(Number(b?.total_repaid ?? 0))} />
      </div>

      {m ? (
        <div className="mt-6 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Staff number", m.staff_no],
            ["National ID", m.national_id],
            ["Gender", m.gender],
            ["Telephone", m.phone],
            ["Email", m.email],
            ["Address", m.address],
            ["Position", m.position],
            ["Date joined", m.join_date],
            ["Status", m.status],
            ["Next of kin", m.next_of_kin],
            ["Next of kin phone", m.next_of_kin_phone],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-medium">{value ? String(value) : "—"}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <MemberStatement memberId={memberId} />
      </div>
    </AppShell>
  );
}
