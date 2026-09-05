import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { usePermissions } from "@/hooks/useSacco";
import { PageTable, type Column } from "@/components/PageTable";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { exportExcel, exportPdfTable } from "@/lib/pdf";
import { shortDate, ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Flobbeto SACCO" },
      { name: "description", content: "Central ledger of all SACCO money in and money out." },
      { property: "og:title", content: "Transactions — Flobbeto SACCO" },
      { property: "og:description", content: "Every savings, share, loan and repayment entry in one ledger." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransactionsPage,
});

type Row = {
  id: string;
  ref_no: string;
  txn_date: string;
  category: string;
  direction: string;
  amount: number;
  method: string;
  description: string | null;
  members: { full_name: string; member_no: string } | null;
};

function TransactionsPage() {
  const { can } = usePermissions();
  const canExport = can("reports.export");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const txns = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, members(full_name, member_no)")
        .order("txn_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const all = txns.data ?? [];
  const categories = Array.from(new Set(all.map((t) => t.category))).sort();
  const rows = all.filter(
    (t) =>
      (category === "all" || t.category === category) &&
      (!from || t.txn_date >= from) &&
      (!to || t.txn_date <= to),
  );

  const inflow = rows.filter((t) => t.direction === "in").reduce((a, t) => a + Number(t.amount), 0);
  const outflow = rows.filter((t) => t.direction === "out").reduce((a, t) => a + Number(t.amount), 0);

  const columns: Column<Row>[] = [
    { key: "ref", header: "Reference", cell: (t) => <span className="font-mono text-xs">{t.ref_no}</span> },
    { key: "date", header: "Date", cell: (t) => shortDate(t.txn_date) },
    {
      key: "member",
      header: "Member",
      cell: (t) => (t.members ? `${t.members.full_name} (${t.members.member_no})` : "SACCO"),
    },
    {
      key: "category",
      header: "Category",
      cell: (t) => <Badge variant="outline">{t.category.replace(/_/g, " ")}</Badge>,
    },
    { key: "method", header: "Method", cell: (t) => t.method.replace(/_/g, " ") },
    {
      key: "in",
      header: "Money in",
      className: "text-right",
      cell: (t) => (t.direction === "in" ? <span className="text-success">{ugx(Number(t.amount))}</span> : ""),
    },
    {
      key: "out",
      header: "Money out",
      className: "text-right",
      cell: (t) =>
        t.direction === "out" ? <span className="text-destructive">{ugx(Number(t.amount))}</span> : "",
    },
  ];

  return (
    <AppShell title="Transactions" description="Central ledger of every SACCO movement">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Money in" value={ugx(inflow)} tone="success" />
        <StatCard label="Money out" value={ugx(outflow)} tone="destructive" />
        <StatCard label="Net position" value={ugx(inflow - outflow)} tone="gold" />
      </div>

      <PageTable
        rows={rows}
        columns={columns}
        searchable={(t) => `${t.members?.full_name ?? ""} ${t.ref_no} ${t.category} ${t.description ?? ""}`}
        searchPlaceholder="Search reference, member or category…"
        empty={txns.isLoading ? "Loading ledger…" : "No transactions in this period."}
        toolbar={
          <>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            <ExportMenu
              disabled={!canExport}
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-ledger.pdf",
                  title: "Transaction ledger",
                  subtitle: `${rows.length} entries${from || to ? ` · ${from || "start"} to ${to || "today"}` : ""}`,
                  head: ["Reference", "Date", "Member", "Category", "Method", "Money in", "Money out"],
                  body: rows.map((t) => [
                    t.ref_no,
                    shortDate(t.txn_date),
                    t.members ? `${t.members.full_name} (${t.members.member_no})` : "SACCO",
                    t.category.replace(/_/g, " "),
                    t.method.replace(/_/g, " "),
                    t.direction === "in" ? Number(t.amount).toLocaleString() : "",
                    t.direction === "out" ? Number(t.amount).toLocaleString() : "",
                  ]),
                  orientation: "landscape",
                  columnStyles: { 5: { halign: "right" }, 6: { halign: "right" } },
                  footNote: `Money in: ${ugx(inflow)}    Money out: ${ugx(outflow)}    Net: ${ugx(inflow - outflow)}`,
                })
              }
              onExcel={() =>
                exportExcel(
                  "flobbeto-ledger.xlsx",
                  "Ledger",
                  rows.map((t) => ({
                    Reference: t.ref_no,
                    Date: t.txn_date,
                    Member: t.members?.full_name ?? "SACCO",
                    "Member No": t.members?.member_no ?? "",
                    Category: t.category,
                    Method: t.method,
                    "Money in": t.direction === "in" ? Number(t.amount) : 0,
                    "Money out": t.direction === "out" ? Number(t.amount) : 0,
                  })),
                )
              }
            />
          </>
        }
      />
    </AppShell>
  );
}
