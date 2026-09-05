import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { exportCsv } from "@/components/PageTable";
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
import { supabase } from "@/integrations/supabase/client";
import { shortDate, ugx } from "@/lib/sacco";

export function MemberStatement({ memberId }: { memberId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const statement = useQuery({
    queryKey: ["statement", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("member_id", memberId)
        .order("txn_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const rows = (statement.data ?? []).filter(
    (t) => (!from || t.txn_date >= from) && (!to || t.txn_date <= to),
  );

  let running = 0;
  const withBalance = rows.map((t) => {
    running += t.direction === "in" ? Number(t.amount) : -Number(t.amount);
    return { ...t, balance: running };
  });

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <CardTitle className="text-base">Member statement</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCsv(
                "member-statement.csv",
                withBalance.map((t) => ({
                  date: t.txn_date,
                  reference: t.ref_no,
                  category: t.category,
                  method: t.method,
                  in: t.direction === "in" ? t.amount : "",
                  out: t.direction === "out" ? t.amount : "",
                  balance: t.balance,
                })),
              )
            }
          >
            Export CSV
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Money in</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead className="text-right">Running balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBalance.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{shortDate(t.txn_date)}</TableCell>
                <TableCell className="font-mono text-xs">{t.ref_no}</TableCell>
                <TableCell>{t.category}</TableCell>
                <TableCell className="text-right text-success">
                  {t.direction === "in" ? ugx(Number(t.amount)) : ""}
                </TableCell>
                <TableCell className="text-right text-destructive">
                  {t.direction === "out" ? ugx(Number(t.amount)) : ""}
                </TableCell>
                <TableCell className="text-right font-medium">{ugx(t.balance)}</TableCell>
              </TableRow>
            ))}
            {withBalance.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No transactions for the selected period.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
