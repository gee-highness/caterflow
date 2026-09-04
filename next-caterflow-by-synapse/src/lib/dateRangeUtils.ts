// src/lib/dateRangeUtils.ts
// Shared date-range boundary logic for the reports page. Pulled out into its
// own module so the exact "end date" boundary fix (see reports/page.tsx) has
// one implementation used by every filter, and so it's unit-testable without
// rendering the reports page component.

/**
 * Parse a bare "yyyy-MM-dd" (or full ISO) date-range boundary string into a
 * Date. `new Date("yyyy-MM-dd")` parses as UTC midnight, which is correct
 * for a range *start*, but for a range *end* it would exclude every record
 * actually timestamped later that same day. For "end", push to the last
 * instant of that UTC day instead.
 */
export function parseDateRangeBoundary(
  dateStr: string,
  boundary: "start" | "end",
): Date {
  const d = new Date(dateStr);
  if (boundary === "end") {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

/**
 * Whether `itemDateStr` falls within [startStr, endStr] (inclusive on both
 * ends, with the end boundary extended to the end of that UTC day). Missing
 * start/end bounds are treated as unbounded on that side. Returns false for
 * a missing or unparseable itemDateStr.
 */
export function isDateWithinRange(
  itemDateStr: string | null | undefined,
  startStr?: string | null,
  endStr?: string | null,
): boolean {
  if (!itemDateStr) return false;
  const itemDate = new Date(itemDateStr);
  if (isNaN(itemDate.getTime())) return false;

  const start = startStr ? parseDateRangeBoundary(startStr, "start") : null;
  const end = endStr ? parseDateRangeBoundary(endStr, "end") : null;

  return (!start || itemDate >= start) && (!end || itemDate <= end);
}
