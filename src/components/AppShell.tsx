import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Banknote,
  CircleUserRound,
  ClipboardList,
  FileSpreadsheet,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRoles, useSaccoSettings, useSession } from "@/hooks/useSacco";
import { SACCO_SHORT, SACCO_TAGLINE } from "@/lib/sacco";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Users; staffOnly?: boolean; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/members", label: "Members", icon: Users, staffOnly: true },
  { to: "/monthly-plan", label: "Monthly plan", icon: Wallet },
  { to: "/savings", label: "Savings", icon: Wallet, staffOnly: true },
  { to: "/shares", label: "Shares", icon: PieChart, staffOnly: true },
  { to: "/loans", label: "Loans", icon: HandCoins },
  { to: "/repayments", label: "Repayments", icon: Banknote, staffOnly: true },
  { to: "/transactions", label: "Transactions", icon: FileSpreadsheet, staffOnly: true },
  { to: "/expenses", label: "Expenses", icon: ClipboardList, staffOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, staffOnly: true },
  { to: "/admin-users", label: "Users & roles", icon: ShieldCheck, adminOnly: true },
  { to: "/admin-permissions", label: "Permissions", icon: SlidersHorizontal, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
  { to: "/my-account", label: "My account", icon: CircleUserRound },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { isStaff, isAdmin, ready, isLoading } = useRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!ready || isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-sidebar-accent/40" aria-label="Loading navigation" />;
  }

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((i) => (!i.staffOnly || isStaff) && (!i.adminOnly || isAdmin)).map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
            )}
          >
            <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ shortName, tagline }: { shortName: string; tagline: string }) {
  return (
    <div className="flex items-center gap-3 px-1 py-4">
      <img src="/favicon.png" alt="Flobbeto SACCO logo" className="size-11 rounded-lg bg-white p-1" />
      <div className="leading-tight">
        <p className="font-display text-sm font-semibold text-sidebar-foreground">{shortName}</p>
        <p className="text-xs text-sidebar-primary">{tagline}</p>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { roles, member, ready: rolesReady, isLoading: rolesLoading } = useRoles();
  const settings = useSaccoSettings();
  const config = settings.data;
  const roleStateLoading = !!user && (!rolesReady || rolesLoading);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-sidebar px-4 py-3 lg:flex">
        <div>
          <Brand shortName={config?.sacco_short ?? SACCO_SHORT} tagline={config?.tagline ?? SACCO_TAGLINE} />
          <div className="mb-4 h-px gold-rule" />
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border pt-3">
          <p className="truncate px-3 text-xs text-sidebar-foreground/70">{user?.email}</p>
            <p className="px-3 text-xs uppercase tracking-wide text-sidebar-primary">
            {roleStateLoading ? "loading" : roles.join(" · ") || "member"}
          </p>
          <Button variant="ghost" className="mt-2 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card/85 px-4 py-3 backdrop-blur md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar px-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Brand shortName={config?.sacco_short ?? SACCO_SHORT} tagline={config?.tagline ?? SACCO_TAGLINE} />
              <div className="mb-4 h-px gold-rule" />
              <NavLinks onNavigate={() => setOpen(false)} />
              <Button variant="ghost" className="mt-4 w-full justify-start text-sidebar-foreground/80" onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold">{title}</h1>
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          {roleStateLoading ? (
            <div className="h-72 animate-pulse rounded-xl border bg-muted/30" aria-label="Loading account" />
          ) : (
            children
          )}
        </main>

        <footer className="border-t px-4 py-4 text-xs text-muted-foreground md:px-8">
          {config?.sacco_short ?? SACCO_SHORT} — every transaction is recorded in the SACCO ledger.
        </footer>
      </div>
    </div>
  );
}
