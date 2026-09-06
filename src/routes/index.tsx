import { Link, createFileRoute } from "@tanstack/react-router";
import { HandCoins, PieChart, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SACCO_ADDRESS, SACCO_NAME, SACCO_PHONE, SACCO_TAGLINE } from "@/lib/sacco";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flobbeto SACCO — Staff Savings & Credit Cooperative, Hoima" },
      {
        name: "description",
        content:
          "Member savings, shares, loans and repayments for Flobbeto Primary Staff Savings and Credit Cooperative Ltd, Hoima City.",
      },
      { property: "og:title", content: "Flobbeto SACCO — Staff Savings & Credit Cooperative" },
      {
        property: "og:description",
        content: "Sign in to manage members, savings, shares, loans and SACCO reports.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Wallet, title: "Savings", body: "Payroll, monthly and voluntary savings tracked to the shilling." },
  { icon: PieChart, title: "Shares", body: "Share purchases and member share value calculated automatically." },
  { icon: HandCoins, title: "Loans", body: "Applications, committee approval, disbursement and repayments." },
  { icon: ShieldCheck, title: "Controls", body: "Role-based access with a central, traceable transaction ledger." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="surface-gradient text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Flobbeto SACCO logo" className="size-12 rounded-lg bg-white p-1" />
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">FLOBBETO SACCO</p>
              <p className="text-xs text-gold">{SACCO_TAGLINE}</p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-20 pt-12">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Information Management System</p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {SACCO_NAME}
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-primary-foreground/80">
            One secure place for the school staff SACCO: member records, savings, shares, loan
            approvals, repayments and financial reports with every transaction traceable from
            initiation to reconciliation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Open the system</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create an account
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="shadow-[var(--shadow-card)]">
              <CardContent className="p-5">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                  <f.icon className="size-5" />
                </span>
                <h2 className="mt-4 font-display text-base font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{SACCO_NAME}</p>
          <p className="mt-1">{SACCO_ADDRESS}</p>
          <p>Tel: {SACCO_PHONE}</p>
        </div>
      </footer>
    </div>
  );
}
