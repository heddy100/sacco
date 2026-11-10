import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset PIN — Flobbeto SACCO" },
      { name: "description", content: "Set a new PIN for your Flobbeto SACCO account." },
      { property: "og:title", content: "Reset PIN — Flobbeto SACCO" },
      { property: "og:description", content: "Choose a new PIN for your SACCO account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z
      .string()
      .regex(/^\d{6}$/, "PIN must be exactly 6 digits")
      .safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user?.id ?? "");
      const isAdmin = (roleData ?? []).some((row) => row.role === "admin");
      toast.success("PIN updated");
      navigate({ to: isAdmin ? "/admin-users" : "/dashboard", replace: true });
    } catch {
      toast.success("PIN updated");
      navigate({ to: "/dashboard", replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="font-display">Set a new 6-digit PIN</CardTitle>
          <CardDescription>Choose a six-digit numeric PIN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New PIN</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Update PIN"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
