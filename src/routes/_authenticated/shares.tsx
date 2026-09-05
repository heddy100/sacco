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
import { useBalances, useMembersList, useSession, usePermissions, useSaccoSettings } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable, receiptPdf } from "@/lib/pdf";
import { SHARE_PRICE, shortDate, ugx } from "@/lib/sacco";

async function shareReceipt(r: Row) {
  const value = r.shares * Number(r.price_per_share);
  await receiptPdf({
    filename: `share-receipt-${r.txn_no}.pdf`,
    title: "Share Capital Receipt",
    receiptNo: r.txn_no,
    date: shortDate(r.txn_date),
    memberName: r.members?.full_name ?? "\u2014",
    memberNo: r.members?.member_no ?? "\u2014",
    fields: [
      ["Number of shares", String(r.shares)],
      ["Price per share", ugx(Number(r.price_per_share))],
      ["Payment method", r.method.replace(/_/g, " ")],
      ["Reference", r.reference ?? "\u2014"],
    ],
    amount: value,
    amountLabel: "Share capital received",
    note: "Shares credited to the member's share capital account. Each share is valued at UGX 20,000.",
  });
}

export const Route = createFileRoute("/_authenticated/shares")({
  head: () => ({
    meta: [
      { title: "Shares — Flobbeto SACCO" },
      { name: "description", content: "Share purchases, share value and member shareholding." },
      { property: "og:title", content: "Shares — Flobbeto SACCO" },
      { property: "og:description", content: "Track SACCO share capital by member." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharesPage,
});

type Row = {
  id: string;
  txn_no: string;
  txn_date: string;
  shares: number;
  price_per_share: number;
  method: string;
  reference: string | null;
  members: { full_name: string; member_no: string } | null;
};

const schema = z.object({
  member_id: z.string().uuid("Select a member"),
  shares: z.coerce.number().int().positive("Enter the number of shares").max(100000),
  price_per_share: z.coerce.number().positive().max(SHARE_PRICE),
  method: z.string().min(1),
  txn_date: z.string().min(1),
  reference: z.string().trim().max(60).optional(),
});

function SharesPage() {
  const { can } = usePermissions();
  const canPost = can("shares.post");
  const { user } = useSession();
  const settings = useSaccoSettings();
  const sharePrice = Number(settings.data?.share_price ?? SHARE_PRICE);
  const queryClient = useQueryClient();
  const members = useMembersList();
  const balances = useBalances();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    price_per_share: String(sharePrice),
    method: "salary_deduction",
    txn_date: new Date().toISOString().slice(0, 10),
  });

  const shares = useQuery({
    queryKey: ["shares"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("share_transactions")
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
      const { error } = await supabase.from("share_transactions").insert({
        member_id: d.member_id,
        shares: d.shares,
        price_per_share: sharePrice,
        method: "salary_deduction" as never,
        txn_date: d.txn_date,
        reference: d.reference || null,
        recorded_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Share purchase recorded");
      setOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record share purchase"),
  });

  const rows = shares.data ?? [];
  const totalShares = (balances.data ?? []).reduce((a, b) => a + Number(b.shares_owned ?? 0), 0);
  const totalValue = (balances.data ?? []).reduce((a, b) => a + Number(b.shares_value ?? 0), 0);
  const holders = (balances.data ?? []).filter((b) => Number(b.shares_owned ?? 0) > 0).length;

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
    { key: "shares", header: "Shares", className: "text-right", cell: (r) => r.shares },
    { key: "price", header: "Price/share", className: "text-right", cell: (r) => ugx(Number(r.price_per_share)) },
    {
      key: "value",
      header: "Value",
      className: "text-right",
      cell: (r) => <span className="font-medium">{ugx(r.shares * Number(r.price_per_share))}</span>,
    },
    { key: "method", header: "Method", cell: (r) => r.method.replace("_", " ") },
    {
      key: "receipt",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => shareReceipt(r)}>
          <Receipt className="size-4" /> Receipt
        </Button>
      ),
    },
  ];

  return (
    <AppShell title="Shares" description="Share capital and member shareholding">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Shares issued" value={totalShares.toLocaleString()} />
        <StatCard label="Share capital" value={ugx(totalValue)} tone="gold" />
        <StatCard label="Shareholding members" value={String(holders)} />
      </div>

      <PageTable
        rows={rows}
        columns={columns}
        searchable={(r) => `${r.members?.full_name ?? ""} ${r.members?.member_no ?? ""} ${r.txn_no}`}
        searchPlaceholder="Search member or transaction…"
        empty={shares.isLoading ? "Loading…" : "No share transactions recorded."}
        toolbar={
          <>
            <ExportMenu
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-shares.pdf",
                  title: "Share purchases",
                  subtitle: `${rows.length} transaction(s)`,
                  head: ["Txn No", "Date", "Member", "Member No", "Shares", "Price/share", "Value (UGX)", "Method"],
                  body: rows.map((r) => [
                    r.txn_no,
                    shortDate(r.txn_date),
                    r.members?.full_name ?? "",
                    r.members?.member_no ?? "",
                    r.shares,
                    Number(r.price_per_share).toLocaleString(),
                    (r.shares * Number(r.price_per_share)).toLocaleString(),
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
                    <Plus className="size-4" /> Register shares
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Register share purchase</DialogTitle>
                    <DialogDescription>Total share value is calculated automatically.</DialogDescription>
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
                        <Label htmlFor="shares">Number of shares</Label>
                        <Input
                          id="shares"
                          type="number"
                          min={1}
                          value={form['shares'] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="price">Price per share (fixed)</Label>
                        <Input id="price" value={ugx(SHARE_PRICE)} readOnly disabled />
                                              <Input id="price" value={ugx(sharePrice)} readOnly disabled />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Total value:{" "}
                      <span className="font-medium text-foreground">
                        {ugx(Number(form['shares'] ?? 0) * SHARE_PRICE)}
                                              {ugx(Number(form['shares'] ?? 0) * sharePrice)}
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="method">Payment method</Label>
                        <Input id="method" value="Salary deduction" readOnly disabled />
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
                  </div>
                  <DialogFooter>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                      {create.isPending ? "Saving…" : "Register shares"}
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
