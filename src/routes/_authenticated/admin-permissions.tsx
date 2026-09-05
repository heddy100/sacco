import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  PERMISSIONS,
  useRolePermissions,
  useRoles,
  type AppRole,
} from "@/hooks/useSacco";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin-permissions")({
  head: () => ({
    meta: [
      { title: "Permission matrix — Flobbeto SACCO" },
      {
        name: "description",
        content: "Grant or revoke specific SACCO actions such as approving loans, posting repayments and exporting reports per role.",
      },
      { property: "og:title", content: "Permission matrix — Flobbeto SACCO" },
      { property: "og:description", content: "Control exactly which actions each SACCO role may perform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermissionsPage,
});

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Always full access" },
  { value: "treasurer", label: "Treasurer", hint: "Money posting" },
  { value: "committee", label: "Committee", hint: "Loan oversight" },
  { value: "member", label: "Member", hint: "Self-service" },
];

function PermissionsPage() {
  const { isAdmin, isLoading } = useRoles();
  const matrix = useRolePermissions();
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: async ({ role, permission, allowed }: { role: AppRole; permission: string; allowed: boolean }) => {
      const { error } = await supabase
        .from("role_permissions")
        .upsert({ role, permission, allowed }, { onConflict: "role,permission" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.allowed ? "Granted" : "Revoked"} “${v.permission}” for ${v.role}`);
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const value = (role: AppRole, permission: string) =>
    (matrix.data ?? []).find((r) => r.role === role && r.permission === permission)?.allowed ?? false;

  if (!isLoading && !isAdmin) {
    return (
      <AppShell title="Permission matrix">
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldAlert className="size-5 text-destructive" />
            Only administrators can manage permissions.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const groups = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

  return (
    <AppShell
      title="Permission matrix"
      description="Grant or revoke individual actions for each SACCO role. Admins always retain full access."
    >
      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
              <CardDescription>Changes apply immediately to everyone holding the role.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-3 font-medium">Action</th>
                    {ROLES.map((r) => (
                      <th key={r.value} className="px-4 py-3 text-center font-medium">
                        <div>{r.label}</div>
                        <div className="text-[11px] font-normal text-muted-foreground">{r.hint}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                    <tr key={p.key} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.key}</div>
                      </td>
                      {ROLES.map((r) => (
                        <td key={r.value} className="px-4 py-3 text-center">
                          <Switch
                            checked={r.value === "admin" ? true : value(r.value, p.key)}
                            disabled={r.value === "admin" || toggle.isPending || matrix.isLoading}
                            onCheckedChange={(on) =>
                              toggle.mutate({ role: r.value, permission: p.key, allowed: on })
                            }
                            aria-label={`${p.label} for ${r.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
