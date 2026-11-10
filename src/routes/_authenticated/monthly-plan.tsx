import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useRoles, useSaccoSettings, useSession } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/monthly-plan")({
  head: () => ({
    meta: [
      { title: "Monthly savings & shares — Flobbeto SACCO" },
      {
        name: "description",
        content: "Submit and track monthly savings and share-purchase plans.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonthlyPlanPage,
});

const planSchema = z
  .object({
    savings_amount: z.coerce.number().nonnegative().max(1_000_000_000),
    shares_count: z.coerce.number().int().nonnegative().max(100_000),
  })
  .refine((value) => value.savings_amount > 0 || value.shares_count > 0, {
    message: "Enter a savings amount or at least one share",
  });

function MonthlyPlanPage() {
  const { user } = useSession();
  const { isStaff, member } = useRoles();
  const settings = useSaccoSettings();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [savingsAmount, setSavingsAmount] = useState("");
  const [sharesCount, setSharesCount] = useState("");
  const sharePrice = Number(settings.data?.share_price ?? 10_000);
  const planMonth = `${month}-01`;

  const plans = useQuery({
    queryKey: ["monthly-member-plans", user?.id, member?.id, month, isStaff],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_member_plans")
        .select(
          "id, member_id, plan_month, savings_amount, shares_count, submitted_at, members(full_name, member_no)",
        )
        .eq("plan_month", planMonth)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ownPlan = plans.data?.find((plan) => plan.member_id === member?.id);

  useEffect(() => {
    setSavingsAmount(ownPlan ? String(ownPlan.savings_amount) : "");
    setSharesCount(ownPlan ? String(ownPlan.shares_count) : "");
  }, [ownPlan, planMonth]);

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!member?.id)
        throw new Error("Your account is not linked to a member record. Contact the SACCO office.");
      const parsed = planSchema.safeParse({
        savings_amount: savingsAmount || 0,
        shares_count: sharesCount || 0,
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Check your monthly plan");
      const { error } = await supabase.from("monthly_member_plans").upsert(
        {
          member_id: member.id,
          plan_month: planMonth,
          savings_amount: parsed.data.savings_amount,
          shares_count: parsed.data.shares_count,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "member_id,plan_month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Monthly plan saved");
      queryClient.invalidateQueries({ queryKey: ["monthly-member-plans"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = plans.data ?? [];
  const savingsTotal = rows.reduce((total, plan) => total + Number(plan.savings_amount), 0);
  const sharesTotal = rows.reduce((total, plan) => total + Number(plan.shares_count), 0);

  return (
    <AppShell
      title="Monthly savings & shares"
      description="Member plans are tracked by month and do not post payments"
    >
      {member ? (
        <Card className="mb-6 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Your monthly plan</CardTitle>
            <CardDescription>
              Submit the savings amount and number of shares you plan to contribute for a month.
              Only verified payments entered by SACCO staff change your financial balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plans.isError ? (
              <p className="mb-4 text-sm text-destructive">
                Could not load your monthly plan: {plans.error.message}
              </p>
            ) : null}
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                savePlan.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="plan-month">Month</Label>
                <Input
                  id="plan-month"
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-savings">Planned savings (UGX)</Label>
                <Input
                  id="plan-savings"
                  type="number"
                  min="0"
                  step="1000"
                  value={savingsAmount}
                  onChange={(event) => setSavingsAmount(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-shares">Shares to buy</Label>
                <Input
                  id="plan-shares"
                  type="number"
                  min="0"
                  step="1"
                  value={sharesCount}
                  onChange={(event) => setSharesCount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Estimated share value: {ugx((Number(sharesCount) || 0) * sharePrice)}
                </p>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={savePlan.isPending || !member.id}>
                  {savePlan.isPending
                    ? "Saving…"
                    : ownPlan
                      ? "Update monthly plan"
                      : "Submit monthly plan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Your account is not linked to a member record, so you cannot submit a monthly plan.
            Contact the SACCO office to link your account.
          </CardContent>
        </Card>
      )}

      {plans.isError && !isStaff ? (
        <p className="text-sm text-destructive">
          Could not load monthly plans: {plans.error.message}
        </p>
      ) : null}

      {isStaff ? (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">Monthly plan tracking</CardTitle>
              <CardDescription>
                {rows.length} submitted plan(s) · Planned savings {ugx(savingsTotal)} ·{" "}
                {sharesTotal.toLocaleString()} shares
              </CardDescription>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tracking-month">Track month</Label>
              <Input
                id="tracking-month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {plans.isError ? (
              <p className="mb-4 text-sm text-destructive">
                Could not load monthly plans: {plans.error.message}
              </p>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Member no.</TableHead>
                  <TableHead className="text-right">Planned savings</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Estimated share value</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((plan) => {
                  const planMember = plan.members as {
                    full_name: string;
                    member_no: string;
                  } | null;
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>{planMember?.full_name ?? "—"}</TableCell>
                      <TableCell>{planMember?.member_no ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {ugx(Number(plan.savings_amount))}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(plan.shares_count).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {ugx(Number(plan.shares_count) * sharePrice)}
                      </TableCell>
                      <TableCell>{new Date(plan.submitted_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
                {!rows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {plans.isLoading
                        ? "Loading monthly plans…"
                        : "No plans submitted for this month."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
