export const DEFAULT_ACTIVATION_WEEKS = 12;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateToIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

export function isoToDateLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map((p) => Number(p));
  // Noon local time avoids some DST edge cases around midnight.
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function computeEndDateIso(startDateIso: string, weeks: number): string {
  const normalizedWeeks = Number.isFinite(weeks) ? Math.floor(weeks) : 0;
  if (normalizedWeeks < 1) {
    throw new Error("weeks must be an integer >= 1");
  }

  const startUtc = new Date(`${startDateIso}T00:00:00Z`);
  if (Number.isNaN(startUtc.getTime())) {
    throw new Error(`Invalid ISO date: ${startDateIso}`);
  }

  const days = normalizedWeeks * 7 - 1;
  const endUtc = new Date(startUtc);
  endUtc.setUTCDate(endUtc.getUTCDate() + days);
  return endUtc.toISOString().slice(0, 10);
}

export function getDefaultActivationStartDateIso(): string {
  const today = new Date();
  const weekday = today.getDay(); // 0=Sun ... 6=Sat
  const monday = 1;
  const deltaDays = (monday - weekday + 7) % 7; // next Monday, inclusive
  const next = new Date(today);
  next.setDate(today.getDate() + deltaDays);
  return dateToIsoLocal(next);
}

