import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { SACCO_NAME } from "@/lib/sacco";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Flobbeto SACCO" },
      { name: "description", content: "Secure sign in for Flobbeto SACCO members and staff." },
      { property: "og:title", content: "Sign in — Flobbeto SACCO" },
      { property: "og:description", content: "Access your SACCO savings, shares and loan records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(120).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function redirectAfterAuth(userId: string) {
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const roles = (data ?? []).map((row) => row.role);
      navigate({ to: roles.includes("admin") ? "/admin-users" : "/dashboard", replace: true });
      if (error) console.error("Role lookup failed during auth redirect:", error);
    } catch (error) {
      console.error("Could not determine auth redirect route:", error);
      navigate({ to: "/dashboard", replace: true });
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) redirectAfterAuth(data.session.user.id);
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: parsed.data.fullName ?? "" },
          },
        });
        if (error) throw error;
        if (data.session) {
          await redirectAfterAuth(data.session.user.id);
        } else {
          toast.success("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) await redirectAfterAuth(data.session.user.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("Enter your email address first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent to your email");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="surface-gradient hidden flex-col justify-between p-10 text-primary-foreground lg:flex">
        <img src="/favicon.png" alt="Flobbeto SACCO logo" className="size-16 rounded-xl bg-white p-1.5" />
        <div>
          <h2 className="max-w-md font-display text-3xl font-semibold leading-tight">{SACCO_NAME}</h2>
          <p className="mt-4 max-w-md text-sm text-primary-foreground/80">
            Accurate savings, shares and loan records for every member of staff — auditable from the
            first receipt to the final reconciliation.
          </p>
        </div>
        <p className="text-xs text-gold">Growing Together</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md shadow-[var(--shadow-card)]">
          <CardHeader>
            <img src="/favicon.png" alt="" className="mb-2 size-12 lg:hidden" />
            <CardTitle className="font-display">
              {mode === "signin" ? "Sign in to the SACCO" : "Create your SACCO account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Use the email registered with the SACCO office."
                : "The first account created becomes the system administrator."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Register</TabsTrigger>
              </TabsList>
            </Tabs>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    maxLength={120}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Grace Nabbosa"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={255}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@flobbeto.ac.ug"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  maxLength={72}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={resetPassword}
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
