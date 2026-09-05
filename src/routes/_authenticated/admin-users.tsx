import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { PageTable, type Column } from "@/components/PageTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRoles, useSession, type AppRole } from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";
import { createSaccoUser, deleteSaccoUser, resetSaccoUserPassword, setSaccoUserPassword, updateSaccoUser } from "@/lib/admin-user-management";
import { shortDate } from "@/lib/sacco";

export const Route = createFileRoute("/_authenticated/admin-users")({
  head: () => ({
    meta: [
      { title: "Users & roles — Flobbeto SACCO" },
      { name: "description", content: "Assign administrator, treasurer and committee permissions to SACCO staff." },
      { property: "og:title", content: "Users & roles — Flobbeto SACCO" },
      { property: "og:description", content: "Control access for SACCO staff accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsersPage,
});

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access: members, settings, roles" },
  { value: "treasurer", label: "Treasurer", hint: "Posts savings, shares, repayments" },
  { value: "committee", label: "Committee", hint: "Reviews loans, reads all records" },
  { value: "member", label: "Member", hint: "Self-service portal only" },
];

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  roles: AppRole[];
  member_no: string | null;
};

type MemberOption = {
  id: string;
  member_no: string;
  full_name: string;
  user_id: string | null;
};

function AdminUsersPage() {
  const { isAdmin, isLoading } = useRoles();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const createUserFn = useServerFn(createSaccoUser);
  const resetPasswordFn = useServerFn(resetSaccoUserPassword);
  const setPasswordFn = useServerFn(setSaccoUserPassword);
  const updateUserFn = useServerFn(updateSaccoUser);
  const deleteUserFn = useServerFn(deleteSaccoUser);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", phone: "" });
  const [passwordResetUser, setPasswordResetUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "member" as AppRole,
    member_id: "" as string,
  });

  const requestPasswordReset = useMutation({
    mutationFn: async (email: string) => {
      const result = await resetPasswordFn({ data: { email: email.trim() } });
      if (!result.success) {
        throw new Error(result.error ?? "Password reset failed");
      }
    },
    onSuccess: () => {
      toast.success("Password reset email sent");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const setUserPassword = useMutation({
    mutationFn: async () => {
      if (!passwordResetUser) {
        throw new Error("Select a user first");
      }

      const result = await setPasswordFn({
        data: {
          user_id: passwordResetUser.id,
          password: newPassword,
        },
      });

      if (!result.success) {
        throw new Error(result.error ?? "Password update failed");
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Password updated successfully");
      setPasswordResetUser(null);
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const result = await createUserFn({
        data: {
          full_name: createForm.full_name,
          email: createForm.email,
          password: createForm.password,
          role: createForm.role,
          member_id: createForm.member_id || null,
        },
      });

      if (!result.success) {
        throw new Error(result.error ?? "User creation failed");
      }

      return result.data;
    },
    onSuccess: () => {
      toast.success("User account created");
      setCreateOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", role: "member", member_id: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-member-options"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const users = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async (): Promise<UserRow[]> => {
      const [{ data: profiles, error }, { data: roleRows }, { data: members }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("members").select("user_id, member_no"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roleRows ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
        member_no: (members ?? []).find((m) => m.user_id === p.id)?.member_no ?? null,
      }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: AppRole; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.on ? "Granted" : "Revoked"} ${v.role}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!editingUser) {
        throw new Error("Select a user first");
      }
      const result = await updateUserFn({
        data: {
          user_id: editingUser.id,
          full_name: editForm.full_name,
          email: editForm.email,
          phone: editForm.phone,
        },
      });
      if (!result.success) {
        throw new Error(result.error ?? "User update failed");
      }
    },
    onSuccess: () => {
      toast.success("User details updated");
      setEditingUser(null);
      setEditForm({ full_name: "", email: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeUser = useMutation({
    mutationFn: async () => {
      if (!deleteUser) {
        throw new Error("Select a user first");
      }
      if (deleteUser.roles.includes("admin")) {
        throw new Error("Admin accounts cannot be removed from the system.");
      }
      const result = await deleteUserFn({ data: { user_id: deleteUser.id } });
      if (!result.success) {
        throw new Error(result.error ?? "User removal failed");
      }
    },
    onSuccess: () => {
      toast.success("User account removed");
      setDeleteUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-member-options"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberOptions = useQuery({
    queryKey: ["admin-member-options"],
    enabled: isAdmin,
    queryFn: async (): Promise<MemberOption[]> => {
      const { data, error } = await supabase
        .from("members")
        .select("id, member_no, full_name, user_id")
        .order("member_no");
      if (error) throw error;
      return (data ?? []) as MemberOption[];
    },
  });

  const linkMember = useMutation({
    mutationFn: async ({ userId, memberId }: { userId: string; memberId: string | null }) => {
      const selected = memberOptions.data?.find((member) => member.id === memberId);
      if (selected?.user_id && selected.user_id !== userId) {
        throw new Error("That member is already linked to another account");
      }

      const current = memberOptions.data?.find((member) => member.user_id === userId);
      if (current && current.id !== memberId) {
        const { error } = await supabase.from("members").update({ user_id: null }).eq("id", current.id);
        if (error) throw error;
      }
      if (memberId) {
        const { error } = await supabase.from("members").update({ user_id: userId }).eq("id", memberId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Membership link updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-member-options"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: "Staff member",
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.full_name || "—"}</p>
          <p className="text-xs text-muted-foreground">{r.email ?? "no email"}</p>
          {r.id === user?.id ? (
            <Badge variant="outline" className="mt-1 text-[10px]">
              You
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "member",
      header: "Member no.",
      cell: (r) => (
        <Select
          value={memberOptions.data?.find((member) => member.user_id === r.id)?.id ?? "__none"}
          disabled={linkMember.isPending || memberOptions.isLoading}
          onValueChange={(value) => linkMember.mutate({ userId: r.id, memberId: value === "__none" ? null : value })}
        >
          <SelectTrigger className="w-48" aria-label={`Membership for ${r.full_name}`}>
            <SelectValue placeholder={r.member_no ?? "Not linked"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Not linked</SelectItem>
            {(memberOptions.data ?? []).map((member) => (
              <SelectItem key={member.id} value={member.id} disabled={!!member.user_id && member.user_id !== r.id}>
                {member.member_no} · {member.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (r) => <span className="text-sm">{shortDate(r.created_at)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {isAdmin ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingUser(r);
                  setEditForm({
                    full_name: r.full_name ?? "",
                    email: r.email ?? "",
                    phone: r.phone ?? "",
                  });
                }}
              >
                Edit
              </Button>
              {!r.roles.includes("admin") ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteUser(r)}
                >
                  Remove
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!r.email || setUserPassword.isPending}
            onClick={() => r.email && setPasswordResetUser({ id: r.id, name: r.full_name || "User", email: r.email })}
          >
            <KeyRound className="mr-1 size-3.5" />
            Set password
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!r.email || requestPasswordReset.isPending}
            onClick={() => r.email && requestPasswordReset.mutate(r.email)}
          >
            Email reset
          </Button>
        </div>
      ),
    },
    ...ROLES.map<Column<UserRow>>((role) => ({
      key: role.value,
      header: role.label,
      className: "text-center",
      cell: (r) => (
        <div className="flex justify-center">
          <Switch
            checked={r.roles.includes(role.value)}
            disabled={toggle.isPending}
            aria-label={`${role.label} for ${r.full_name}`}
            onCheckedChange={(on) =>
              toggle.mutate({ userId: r.id, role: role.value, on })
            }
          />
        </div>
      ),
    })),
  ];

  if (!isLoading && !isAdmin) {
    return (
      <AppShell title="Users & roles" description="Administrator area">
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <ShieldAlert className="size-5 text-destructive" />
            Only administrators can manage users and roles.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users & roles"
      description="Grant or revoke permissions for SACCO staff accounts"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <Card key={r.value}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{r.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{r.hint}</CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" /> Create user
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create SACCO account</DialogTitle>
              <DialogDescription>Create a user account, assign a role, and set an initial password.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-user-name">Full name</Label>
                <Input
                  id="new-user-name"
                  placeholder="Jane Doe"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-user-email">Email</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  placeholder="member@flobbeto.ac.ug"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-user-password">Initial password</Label>
                <Input
                  id="new-user-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-user-role">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, role: value as AppRole }))}
                >
                  <SelectTrigger id="new-user-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-user-member">Link to member (optional)</Label>
                <Select
                  value={createForm.member_id || "__none"}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, member_id: value === "__none" ? "" : value }))}
                >
                  <SelectTrigger id="new-user-member">
                    <SelectValue placeholder="No member selected" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No member selected</SelectItem>
                    {(memberOptions.data ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id} disabled={!!member.user_id && member.user_id !== ""}>
                        {member.member_no} · {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createUser.mutate()} disabled={createUser.isPending}>
                {createUser.isPending ? "Creating…" : "Create account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update the selected user profile details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="admin-edit-name">Full name</Label>
              <Input
                id="admin-edit-name"
                value={editForm.full_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-edit-email">Email</Label>
              <Input
                id="admin-edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-edit-phone">Phone</Label>
              <Input
                id="admin-edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditingUser(null);
              setEditForm({ full_name: "", email: "", phone: "" });
            }}>
              Cancel
            </Button>
            <Button onClick={() => updateUser.mutate()} disabled={updateUser.isPending || !editForm.full_name.trim()}>
              {updateUser.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove user account?</DialogTitle>
            <DialogDescription>
              This removes {deleteUser?.full_name ?? "this account"} and its access. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removeUser.mutate()} disabled={removeUser.isPending}>
              {removeUser.isPending ? "Removing…" : "Yes, remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordResetUser} onOpenChange={(open) => !open && setPasswordResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set user password</DialogTitle>
            <DialogDescription>
              Directly set a new password for {passwordResetUser?.name ?? "this user"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="admin-set-password-email">Email</Label>
              <Input id="admin-set-password-email" value={passwordResetUser?.email ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-set-password">New password</Label>
              <Input
                id="admin-set-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPasswordResetUser(null);
              setNewPassword("");
            }}>
              Cancel
            </Button>
            <Button onClick={() => setUserPassword.mutate()} disabled={setUserPassword.isPending || !newPassword}>
              {setUserPassword.isPending ? "Updating…" : "Save password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageTable
        rows={users.data ?? []}
        columns={columns}
        searchable={(r) => `${r.full_name} ${r.email ?? ""} ${r.member_no ?? ""} ${r.roles.join(" ")}`}
        searchPlaceholder="Search staff by name, email or member no…"
        empty={users.isLoading ? "Loading accounts…" : "No user accounts yet."}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        The system always keeps at least one administrator — the final admin role cannot be revoked.
      </p>
    </AppShell>
  );
}
