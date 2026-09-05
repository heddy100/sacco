import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "treasurer" | "committee" | "member";

export const DEFAULT_SETTINGS = {
  sacco_name: "FLOBBETO PRIMARY STAFF SAVINGS AND CREDIT COOPERATIVE LTD",
  sacco_short: "FLOBBETO SACCO",
  tagline: "Growing Together",
  address: "P.O.Box 137 Hoima City (U)",
  phone: "0787760259 / 0772364375",
  email: "info@flobbetosacco.co.ug",
  currency: "UGX",
  share_price: "10000",
  min_savings: "50000",
  loan_to_savings_ratio: "3",
  interest_rate: "1.5",
  registration_fee: "0",
  subscription_fee: "0",
  recent_transactions_since: "",
  financial_year: "2026",
} as const;

export function useSaccoSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("key, value");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? ""]));
    },
    select: (data) => ({ ...DEFAULT_SETTINGS, ...data }),
    staleTime: 60_000,
  });
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, user: session?.user ?? null };
}

export function useRoles() {
  const { user, ready } = useSession();
  const query = useQuery({
    queryKey: ["roles", user?.id],
    enabled: ready && !!user,
    queryFn: async () => {
      const [{ data: roles }, { data: profile }, { data: member }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("members").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);
      return {
        roles: (roles ?? []).map((r) => r.role as AppRole),
        profile,
        member,
      };
    },
  });

  const roles = query.data?.roles ?? [];
  return {
    ...query,
    ready,
    roles,
    profile: query.data?.profile ?? null,
    member: query.data?.member ?? null,
    isAdmin: roles.includes("admin"),
    isStaff: roles.some((r) => r === "admin" || r === "treasurer" || r === "committee"),
    canPost: roles.some((r) => r === "admin" || r === "treasurer"),
    isCommittee: roles.includes("committee") || roles.includes("admin"),
  };
}

export function useMembersList() {
  return useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, member_no, full_name, status, phone, email")
        .order("member_no");
      if (error) throw error;
      return data;
    },
  });
}

export function useGuarantorMembers() {
  return useQuery({
    queryKey: ["guarantor-members"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_guarantor_members");
      if (error) throw error;
      return data as { id: string; member_no: string; full_name: string; phone: string | null }[];
    },
  });
}

export function useBalances() {
  return useQuery({
    queryKey: ["member-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("member_balances").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export const PERMISSIONS = [
  { key: "members.manage", label: "Register & edit members", group: "Members" },
  { key: "savings.post", label: "Post savings deposits & withdrawals", group: "Savings" },
  { key: "shares.post", label: "Post share purchases", group: "Shares" },
  { key: "loans.review", label: "Review loan applications", group: "Loans" },
  { key: "loans.approve", label: "Approve or reject loans", group: "Loans" },
  { key: "loans.disburse", label: "Disburse approved loans", group: "Loans" },
  { key: "repayments.post", label: "Post loan repayments", group: "Loans" },
  { key: "transactions.post", label: "Post ledger entries", group: "Transactions" },
  { key: "reports.view", label: "View reports", group: "Reports" },
  { key: "reports.export", label: "Export reports & statements", group: "Reports" },
  { key: "roles.manage", label: "Manage users, roles & permissions", group: "Administration" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("id, role, permission, allowed");
      if (error) throw error;
      return data;
    },
  });
}

export function usePermissions() {
  const { roles, isAdmin, isLoading: rolesLoading } = useRoles();
  const matrix = useRolePermissions();

  const granted = new Set<string>();
  for (const row of matrix.data ?? []) {
    if (row.allowed && roles.includes(row.role as AppRole)) granted.add(row.permission);
  }

  const can = (permission: PermissionKey) => isAdmin || granted.has(permission);
  return { can, granted, isLoading: rolesLoading || matrix.isLoading };
}
