export function normalizeUgandanPhone(value: string): string | null {
  const phone = value.trim().replace(/[\s()-]/g, "");

  if (/^\+256[0-9]{9}$/.test(phone)) return phone;
  if (/^256[0-9]{9}$/.test(phone)) return `+${phone}`;
  if (/^0[0-9]{9}$/.test(phone)) return `+256${phone.slice(1)}`;

  return null;
}

export function isSixDigitPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}
