import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Pencil, Power, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PageTable, type Column } from "@/components/PageTable";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBalances, usePermissions, useRoles, useSaccoSettings, useSession } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { exportPdfTable } from "@/lib/pdf";
import { shortDate, ugx } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({
    meta: [
      { title: "Members — Flobbeto SACCO" },
      { name: "description", content: "Membership register with savings, shares and loan balances." },
      { property: "og:title", content: "Members — Flobbeto SACCO" },
      { property: "og:description", content: "Manage the SACCO membership register." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MembersPage,
});

const memberSchema = z.object({
  member_no: z.string().trim().min(2).max(20).optional(),
  full_name: z.string().trim().min(3).max(120),
  staff_no: z.string().trim().max(30).optional(),
  national_id: z.string().trim().max(40).optional(),
  gender: z.string().optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(255).or(z.literal("")).optional(),
  address: z.string().trim().max(160).optional(),
  position: z.string().trim().max(80).optional(),
  department_id: z.string().uuid().optional(),
  department_name: z.string().trim().max(80).optional(),
  next_of_kin: z.string().trim().max(120).optional(),
  next_of_kin_phone: z.string().trim().max(20).optional(),
  registration_fee: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  subscription_fee: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
});

type MemberRow = {
  id: string;
  member_no: string;
  full_name: string;
  staff_no: string | null;
  national_id: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  position: string | null;
  department_id: string | null;
  next_of_kin: string | null;
  next_of_kin_phone: string | null;
  registration_fee: number;
  subscription_fee: number;
  join_date: string;
  status: "active" | "inactive" | "suspended" | "exited";
  departments: { name: string } | null;
};

function MembersPage() {
  const { isAdmin } = useRoles();
  const { can } = usePermissions();
  const { user } = useSession();
  const settings = useSaccoSettings();
  const canManageMembers = isAdmin || can("members.manage");
  const queryClient = useQueryClient();
  const balances = useBalances();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ full_name: "", registration_fee: "0", subscription_fee: "0" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);

  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const members = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, member_no, full_name, staff_no, national_id, gender, phone, email, address, position, department_id, next_of_kin, next_of_kin_phone, registration_fee, subscription_fee, join_date, status, departments(name)")
        .order("member_no");
      if (error) throw error;
      return data as unknown as MemberRow[];
    },
  });

  const edit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const parsed = memberSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const payload = Object.fromEntries(
        Object.entries(parsed.data).map(([key, value]) => [key, value === "" ? null : value]),
      );
      const feeEntries = [
        { category: "Registration fee", amount: Number(parsed.data.registration_fee ?? 0) - Number(editing.registration_fee ?? 0) },
        { category: "Subscription fee", amount: Number(parsed.data.subscription_fee ?? 0) - Number(editing.subscription_fee ?? 0) },
      ].filter((fee) => fee.amount > 0);
      const { error } = await supabase.from("members").update(payload as never).eq("id", editing.id);
      if (error) throw error;
      if (feeEntries.length) {
        const { error: feeError } = await supabase.from("transactions").insert(
          feeEntries.map((fee) => ({
            txn_date: new Date().toISOString().slice(0, 10),
            category: fee.category,
            direction: "in",
            member_id: editing.id,
            amount: fee.amount,
            method: "cash" as never,
            description: `${fee.category} adjustment for ${parsed.data.full_name}`,
            source_table: "members",
            source_id: editing.id,
            created_by: user?.id ?? null,
          })),
        );
        if (feeError) throw feeError;
      }
    },
    onSuccess: () => {
      toast.success("Member updated");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update member"),
  });

  const changeStatus = useMutation({
    mutationFn: async (member: MemberRow) => {
      const { error } = await supabase
        .from("members")
        .update({ status: member.status === "active" ? "inactive" : "active" })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member status updated");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      const { error } = await supabase.from("members").delete().eq("id", deleteTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete member; check related records"),
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = memberSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const payload = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== "" && v !== undefined),
      );
      delete payload.member_no;
      delete payload.staff_no;
      delete payload.department_name;
      const departmentName = parsed.data.department_name?.trim();
      if (departmentName) {
        const existing = await supabase.from("departments").select("id").eq("name", departmentName).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) payload.department_id = existing.data.id;
        else {
          const created = await supabase.from("departments").insert({ name: departmentName }).select("id").single();
          if (created.error) throw created.error;
          payload.department_id = created.data.id;
        }
      }
      const registrationFee = Number(payload.registration_fee ?? 0);
      const subscriptionFee = Number(payload.subscription_fee ?? 0);
      const { data: inserted, error } = await supabase
        .from("members")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      const feeEntries = [
        registrationFee > 0 ? { category: "Registration fee", amount: registrationFee } : null,
        subscriptionFee > 0 ? { category: "Subscription fee", amount: subscriptionFee } : null,
      ].filter(Boolean) as { category: string; amount: number }[];
      if (feeEntries.length) {
        const { error: feeError } = await supabase.from("transactions").insert(
          feeEntries.map((fee) => ({
            txn_date: new Date().toISOString().slice(0, 10),
            category: fee.category,
            direction: "in",
            member_id: inserted.id,
            amount: fee.amount,
            method: "cash" as never,
            description: `${fee.category} for ${parsed.data.full_name}`,
            source_table: "members",
            source_id: inserted.id,
            created_by: user?.id ?? null,
          })),
        );
        if (feeError) throw feeError;
      }
      if (photo && inserted) {
        const ext = photo.name.split(".").pop() ?? "jpg";
        const path = `${inserted.id}/photo.${ext}`;
        const up = await supabase.storage.from("member-photos").upload(path, photo, { upsert: true });
        if (up.error) throw up.error;
        await supabase.from("members").update({ photo_url: path }).eq("id", inserted.id);
      }
    },
    onSuccess: () => {
      toast.success("Member registered");
      setOpen(false);
      setForm({ full_name: "", registration_fee: "0", subscription_fee: "0" });
      setPhoto(null);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not register member"),
  });

  const bal = (id: string) => balances.data?.find((b) => b.member_id === id);

  const columns: Column<MemberRow>[] = [
    {
      key: "member",
      header: "Member",
      cell: (m) => (
        <Link to="/members/$memberId" params={{ memberId: m.id }} className="block hover:underline">
          <span className="font-medium">{m.full_name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{m.member_no}</span>
        </Link>
      ),
    },
    { key: "dept", header: "Department", cell: (m) => m.departments?.name ?? "—" },
    { key: "position", header: "Position", cell: (m) => m.position ?? "—" },
    { key: "phone", header: "Phone", cell: (m) => m.phone ?? "—" },
    { key: "joined", header: "Joined", cell: (m) => shortDate(m.join_date) },
    {
      key: "savings",
      header: "Savings",
      className: "text-right",
      cell: (m) => ugx(Number(bal(m.id)?.savings_balance ?? 0)),
    },
    {
      key: "shares",
      header: "Shares",
      className: "text-right",
      cell: (m) => Number(bal(m.id)?.shares_owned ?? 0).toLocaleString(),
    },
    {
      key: "share_capital",
      header: "Share capital",
      className: "text-right",
      cell: (m) => ugx(Number(bal(m.id)?.shares_value ?? 0)),
    },
    {
      key: "loan",
      header: "Loan balance",
      className: "text-right",
      cell: (m) => ugx(Number(bal(m.id)?.loan_balance ?? 0)),
    },
    {
      key: "status",
      header: "Status",
      cell: (m) => (
        <Badge variant={m.status === "active" ? "secondary" : "outline"} className="capitalize">
          {m.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (m) =>
        canManageMembers ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Edit member"
              aria-label={`Edit ${m.full_name}`}
              onClick={() => {
                setEditing(m);
                setForm(Object.fromEntries(Object.entries(m).filter(([key]) => key !== "departments").map(([key, value]) => [key, String(value ?? "")])));
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={m.status === "active" ? "Deactivate member" : "Activate member"}
              aria-label={`${m.status === "active" ? "Deactivate" : "Activate"} ${m.full_name}`}
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate(m)}
            >
              <Power className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Delete member"
              aria-label={`Delete ${m.full_name}`}
              onClick={() => setDeleteTarget(m)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const rows = members.data ?? [];

  return (
    <AppShell title="Members" description="Membership register and balances">
      <PageTable
        rows={rows}
        columns={columns}
        searchable={(m) => `${m.full_name} ${m.member_no} ${m.staff_no ?? ""} ${m.phone ?? ""}`}
        searchPlaceholder="Search name, member no, staff no, phone…"
        empty={members.isLoading ? "Loading members…" : "No members registered yet."}
        toolbar={
          <>
            <ExportMenu
              onPdf={() =>
                exportPdfTable({
                  filename: "flobbeto-members.pdf",
                  title: "Membership register",
                  subtitle: `${rows.length} member(s)`,
                  head: ["Member No", "Name", "Department", "Phone", "Savings", "Shares", "Share capital", "Loan balance"],
                  body: rows.map((m) => [
                    m.member_no,
                    m.full_name,
                    m.departments?.name ?? "",
                    m.phone ?? "",
                    Number(bal(m.id)?.savings_balance ?? 0).toLocaleString(),
                    Number(bal(m.id)?.shares_owned ?? 0).toLocaleString(),
                    Number(bal(m.id)?.shares_value ?? 0).toLocaleString(),
                    Number(bal(m.id)?.loan_balance ?? 0).toLocaleString(),
                  ]),
                  orientation: "landscape",
                  columnStyles: Object.fromEntries([4, 5, 6, 7].map((i) => [i, { halign: "right" as const }])),
                })
              }
            />
            {canManageMembers ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        registration_fee: settings.data?.registration_fee ?? "0",
                        subscription_fee: settings.data?.subscription_fee ?? "0",
                      }))
                    }
                  >
                    <UserPlus className="size-4" /> Register member
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Register a new member</DialogTitle>
                    <DialogDescription>Fill in the member details for the SACCO register.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["full_name", "Full name *"],
                      ["national_id", "National ID"],
                      ["phone", "Telephone"],
                      ["email", "Email"],
                      ["position", "Position"],
                      ["address", "Residential address"],
                      ["next_of_kin", "Next of kin"],
                      ["next_of_kin_phone", "Next of kin phone"],
                    ].map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={key}>{label}</Label>
                        <Input
                          id={key}
                          value={form[key!] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, [key!]: e.target.value }))}
                        />
                      </div>
                    ))}
                    {["registration_fee", "subscription_fee"].map((key) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={key}>{key === "registration_fee" ? "Registration fee" : "Subscription fee"}</Label>
                        <Input id={key} type="number" min="0" step="0.01" value={form[key] ?? "0"} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <Label>Gender</Label>
                      <Select value={form['gender'] ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="department_name">Department</Label>
                      <Input id="department_name" placeholder="Type department name" value={form.department_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, department_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="photo">Member photo</Label>
                      <Input
                        id="photo"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                      />
                      {photo ? (
                        <p className="text-xs text-muted-foreground">Selected: {photo.name}</p>
                      ) : null}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                      {create.isPending ? "Saving…" : "Register member"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        }
      />

      <Dialog open={!!editing} onOpenChange={(value) => !value && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>Update the member details in the SACCO register.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["member_no", "Member No *"], ["full_name", "Full name *"], ["staff_no", "Staff number"],
              ["national_id", "National ID"], ["phone", "Telephone"], ["email", "Email"], ["position", "Position"],
              ["address", "Residential address"], ["next_of_kin", "Next of kin"], ["next_of_kin_phone", "Next of kin phone"], ["registration_fee", "Registration fee"], ["subscription_fee", "Subscription fee"],
            ].map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`edit-${key}`}>{label}</Label>
                <Input id={`edit-${key}`} value={form[key] ?? ""} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender ?? ""} onValueChange={(value) => setForm((current) => ({ ...current, gender: value }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="Female">Female</SelectItem><SelectItem value="Male">Male</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id ?? ""} onValueChange={(value) => setForm((current) => ({ ...current, department_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(departments.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={() => edit.mutate()} disabled={edit.isPending}>{edit.isPending ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(value) => !value && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.full_name ?? "this member"}. Members with savings, shares, loans, or transactions may not be deletable; deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} disabled={remove.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{remove.isPending ? "Deleting…" : "Delete member"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
