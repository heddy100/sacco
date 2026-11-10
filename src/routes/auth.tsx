import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { SACCO_NAME } from "@/lib/sacco";
import { isSixDigitPin, normalizeUgandanPhone } from "@/lib/phone";
import { migrateSaccoAccountToPhonePin } from "@/lib/admin-user-management";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Flobbeto SACCO" },
      { name: "description", content: "Secure sign in for Flobbeto SACCO members and staff." },
      { property: "og:title", content: "Sign in — Flobbeto SACCO" },
      {
        property: "og:description",
        content: "Access your SACCO savings, shares and loan records.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  fullName: z.string().trim().max(120).optional(),
});

const memberRegistration = z.object({
  nationalId: z.string().trim().max(40),
  gender: z.string().trim().max(30),
  dateOfBirth: z.string(),
  phone: z.string().trim().min(7, "Enter a valid Ugandan phone number").max(20),
  address: z.string().trim().max(160),
  department: z.string().trim().max(80),
  position: z.string().trim().max(80),
  nextOfKin: z.string().trim().max(120),
  nextOfKinPhone: z.string().trim().max(20),
});

function AuthPage() {
  const navigate = useNavigate();
  const migrateAccount = useServerFn(migrateSaccoAccountToPhonePin);
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [fullName, setFullName] = useState("");
  const [memberDetails, setMemberDetails] = useState({
    nationalId: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    address: "",
    department: "",
    position: "",
    nextOfKin: "",
    nextOfKinPhone: "",
  });
  const [showMigration, setShowMigration] = useState(false);
  const [legacyEmail, setLegacyEmail] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [migrationPhone, setMigrationPhone] = useState("");
  const [migrationPin, setMigrationPin] = useState("");
  const [migrationPinConfirm, setMigrationPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectAfterAuth = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        const roles = (data ?? []).map((row) => row.role);
        navigate({ to: roles.includes("admin") ? "/admin-users" : "/dashboard", replace: true });
        if (error) console.error("Role lookup failed during auth redirect:", error);
      } catch (error) {
        console.error("Could not determine auth redirect route:", error);
        navigate({ to: "/dashboard", replace: true });
      }
    },
    [navigate],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) redirectAfterAuth(data.session.user.id);
    });
  }, [redirectAfterAuth]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const parsed = credentials.safeParse({ email, fullName });
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "Check your details");
        if (!parsed.data.fullName?.trim()) throw new Error("Enter your full name");
        const parsedMember = memberRegistration.safeParse(memberDetails);
        if (!parsedMember.success) {
          throw new Error(parsedMember.error.issues[0]?.message ?? "Check your member details");
        }
        const phone = normalizeUgandanPhone(parsedMember.data.phone);
        if (!phone) throw new Error("Enter a valid phone number, for example +256 7XX XXX XXX");
        if (!isSixDigitPin(pin)) throw new Error("Your PIN must be exactly 6 digits");
        if (pin !== confirmPin) throw new Error("PINs do not match");

        const { data, error } = await supabase.auth.signUp({
          phone,
          password: pin,
          options: {
            data: {
              full_name: parsed.data.fullName,
              sacco_member_details: {
                email: parsed.data.email,
                national_id: parsedMember?.data.nationalId ?? "",
                gender: parsedMember?.data.gender ?? "",
                date_of_birth: parsedMember?.data.dateOfBirth ?? "",
                phone,
                address: parsedMember?.data.address ?? "",
                department: parsedMember?.data.department ?? "",
                position: parsedMember?.data.position ?? "",
                next_of_kin: parsedMember?.data.nextOfKin ?? "",
                next_of_kin_phone: parsedMember?.data.nextOfKinPhone ?? "",
              },
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          await redirectAfterAuth(data.session.user.id);
        } else {
          toast.error(
            "Supabase still requires phone confirmation. Disable phone confirmations in Supabase Auth to register without SMS.",
          );
        }
      } else {
        const phone = normalizeUgandanPhone(authPhone);
        if (!phone) throw new Error("Enter a valid phone number, for example +256 7XX XXX XXX");
        if (!isSixDigitPin(pin)) throw new Error("Enter your 6-digit PIN");
        const { error } = await supabase.auth.signInWithPassword({
          phone,
          password: pin,
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

  async function startLegacyMigration(event: React.FormEvent) {
    event.preventDefault();
    const parsedEmail = z.string().trim().email().safeParse(legacyEmail);
    if (!parsedEmail.success || !legacyPassword) {
      toast.error("Enter your current email and password");
      return;
    }
    const phone = normalizeUgandanPhone(migrationPhone);
    if (!phone) {
      toast.error("Enter a valid phone number, for example +256 7XX XXX XXX");
      return;
    }
    if (!isSixDigitPin(migrationPin)) {
      toast.error("Your new PIN must be exactly 6 digits");
      return;
    }
    if (migrationPin !== migrationPinConfirm) {
      toast.error("PINs do not match");
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password: legacyPassword,
      });
      if (signInError) throw signInError;
      const result = await migrateAccount({ data: { phone, pin: migrationPin } });
      if (!result.success) throw new Error(result.error ?? "Could not update sign-in");
      toast.success("Phone sign-in and PIN are ready");
      await redirectAfterAuth(result.data.user_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not migrate your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="surface-gradient hidden flex-col justify-between p-10 text-primary-foreground lg:flex">
        <img
          src="/favicon.png"
          alt="Flobbeto SACCO logo"
          className="size-16 rounded-xl bg-white p-1.5"
        />
        <div>
          <h2 className="max-w-md font-display text-3xl font-semibold leading-tight">
            {SACCO_NAME}
          </h2>
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
              {showMigration
                ? "Move your account to phone + PIN"
                : mode === "signin"
                  ? "Sign in to the SACCO"
                  : "Create your SACCO account"}
            </CardTitle>
            <CardDescription>
              {showMigration
                ? "Sign in with your existing email and password once, then set the phone number already recorded for your membership and choose a PIN."
                : mode === "signin"
                  ? "Sign in using your registered phone number and 6-digit PIN."
                  : "Your staff number is generated automatically. No SMS code is sent."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showMigration ? (
              <Tabs
                value={mode}
                onValueChange={(value) => {
                  setMode(value as "signin" | "signup");
                  setPin("");
                  setConfirmPin("");
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Register</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}

            {showMigration ? (
              <form className="mt-5 space-y-4" onSubmit={startLegacyMigration}>
                <div className="space-y-1.5">
                  <Label htmlFor="legacy-email">Current account email</Label>
                  <Input
                    id="legacy-email"
                    type="email"
                    autoComplete="email"
                    value={legacyEmail}
                    onChange={(event) => setLegacyEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="legacy-password">Current password</Label>
                  <Input
                    id="legacy-password"
                    type="password"
                    autoComplete="current-password"
                    value={legacyPassword}
                    onChange={(event) => setLegacyPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="migration-phone">Registered phone number</Label>
                  <Input
                    id="migration-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+256 7XX XXX XXX"
                    value={migrationPhone}
                    onChange={(event) => setMigrationPhone(event.target.value)}
                    required
                  />
                </div>
                <PinInput
                  id="migration-pin"
                  label="New 6-digit PIN"
                  value={migrationPin}
                  onChange={setMigrationPin}
                />
                <PinInput
                  id="migration-pin-confirm"
                  label="Confirm new PIN"
                  value={migrationPinConfirm}
                  onChange={setMigrationPinConfirm}
                />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : "Change to phone + PIN"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs underline"
                  onClick={() => setShowMigration(false)}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submit}>
                {mode === "signup" ? (
                  <div className="grid max-h-[45vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        maxLength={120}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Grace Nabbosa"
                        required
                      />
                    </div>
                    <p className="text-sm text-muted-foreground sm:col-span-2">
                      Your staff ID will be generated automatically when you register.
                    </p>
                    {(
                      [
                        ["nationalId", "National ID", "Optional", false],
                        ["phone", "Phone number (sign-in ID)", "+256 7XX XXX XXX", true],
                        ["dateOfBirth", "Date of birth", "", false, "date"],
                        ["gender", "Gender", "Optional", false],
                        ["department", "Department", "e.g. Administration", false],
                        ["position", "Position", "e.g. Teacher", false],
                        ["address", "Address", "Optional", false],
                        ["nextOfKin", "Next of kin", "Optional", false],
                        ["nextOfKinPhone", "Next of kin phone", "Optional", false],
                      ] as const
                    ).map(([key, label, placeholder, required, type]) => (
                      <div className="space-y-1.5" key={key}>
                        <Label htmlFor={key}>
                          {label}
                          {required ? " *" : ""}
                        </Label>
                        <Input
                          id={key}
                          type={type ?? "text"}
                          value={memberDetails[key]}
                          maxLength={key === "address" ? 160 : 120}
                          onChange={(e) =>
                            setMemberDetails((current) => ({ ...current, [key]: e.target.value }))
                          }
                          placeholder={placeholder}
                          required={required}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="sign-in-phone">Phone number</Label>
                    <Input
                      id="sign-in-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+256 7XX XXX XXX"
                      value={authPhone}
                      onChange={(event) => setAuthPhone(event.target.value)}
                      required
                    />
                  </div>
                )}
                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email (contact)</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      maxLength={255}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@flobbeto.ac.ug"
                      required
                    />
                  </div>
                ) : null}
                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-pin">6-digit PIN</Label>
                    <Input
                      id="signup-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                ) : (
                  <PinInput id="signin-pin" label="6-digit PIN" value={pin} onChange={setPin} />
                )}
                {mode === "signup" ? (
                  <PinInput
                    id="confirm-pin"
                    label="Confirm 6-digit PIN"
                    value={confirmPin}
                    onChange={setConfirmPin}
                  />
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signin" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        toast.info("Contact the SACCO administrator to reset your PIN.")
                      }
                      className="w-full text-center text-xs underline"
                    >
                      Forgot your PIN? Contact the SACCO administrator.
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMigration(true)}
                      className="w-full text-center text-xs underline"
                    >
                      Have an existing email/password account? Set up phone + PIN
                    </button>
                  </>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PinInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        required
      />
    </div>
  );
}
