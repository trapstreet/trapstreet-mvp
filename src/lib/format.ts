export function fmtScore(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(3);
}

export function fmtCost(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export function fmtLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const iso = typeof d === "string" ? d : d.toISOString();
  return iso.slice(0, 19).replace("T", " ");
}
