export const SACCO_NAME = "FLOBBETO PRIMARY STAFF SAVINGS AND CREDIT COOPERATIVE LTD";
export const SACCO_SHORT = "FLOBBETO SACCO";
export const SACCO_TAGLINE = "Growing Together";
export const SACCO_ADDRESS = "P.O.Box 137 Hoima City (U)";
export const SACCO_PHONE = "0787760259 / 0772364375";

export function ugx(value: number | null | undefined, opts?: { compact?: boolean }) {
  const n = Number(value ?? 0);
  if (opts?.compact && Math.abs(n) >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (opts?.compact && Math.abs(n) >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}K`;
  return `UGX ${n.toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "salary_deduction", label: "Salary deduction" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export function paymentReference(txnType: string, method: string, date = new Date()) {
  const nature = txnType === "withdrawal" ? "WDL" : "DEP";
  const methodCode: Record<string, string> = {
    cash: "CASH",
    bank_transfer: "BANK",
    mobile_money: "MOMO",
    salary_deduction: "PAYROLL",
    cheque: "CHQ",
    other: "OTHER",
  };
  const dateCode = date.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
    : Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SV-${nature}-${methodCode[method] ?? "OTHER"}-${dateCode}-${suffix}`;
}

export const LOAN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  disbursed: "Disbursed",
  completed: "Completed",
};

/** Simple flat-rate schedule used across the SACCO. */
export function loanTotals(principal: number, rate: number, months: number) {
  const interest = principal * (rate / 100) * (months / 12);
  const total = principal + interest;
  return { interest, total, monthly: months > 0 ? total / months : total };
}

/** Each share is fixed at UGX 20,000. */
export const SHARE_PRICE = 20000;

/** A member may borrow up to 3× their share capital. */
export const LOAN_SHARE_MULTIPLIER = 3;

/** Loan interest is a flat 1.5% per month of the principal. */
export const MONTHLY_INTEREST_RATE = 1.5;

export function loanLimitFromShares(shares: number, sharePrice = SHARE_PRICE, multiplier = LOAN_SHARE_MULTIPLIER) {
  return shares * sharePrice * multiplier;
}

/** Flat monthly interest schedule: 1.5% of principal per month. */
export function monthlySchedule(principal: number, months: number, monthlyRate = MONTHLY_INTEREST_RATE) {
  const interest = principal * (monthlyRate / 100) * months;
  const total = principal + interest;
  return { interest, total, monthly: months > 0 ? total / months : total };
}
