export function normalizeE164(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (hadPlus) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+1") && d.length === 11) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function isPhone(raw: string | null | undefined): boolean {
  return !!raw && /^\+?\d[\d\s()-]{6,}$/.test(raw);
}

export function looksLikeTwilioAccountSid(sid: string | null | undefined): boolean {
  return !!sid && /^AC[0-9a-f]{32}$/i.test(sid.trim());
}

export function looksLikeTwilioApiKeySid(sid: string | null | undefined): boolean {
  return !!sid && /^SK[0-9a-f]{32}$/i.test(sid.trim());
}
