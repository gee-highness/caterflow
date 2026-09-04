import {
  parseDateRangeBoundary,
  isDateWithinRange,
} from "@/lib/dateRangeUtils";

describe("parseDateRangeBoundary", () => {
  it("parses a start boundary as UTC midnight", () => {
    const d = parseDateRangeBoundary("2026-09-04", "start");
    expect(d.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("parses an end boundary as the last instant of that UTC day", () => {
    const d = parseDateRangeBoundary("2026-09-04", "end");
    expect(d.toISOString()).toBe("2026-09-04T23:59:59.999Z");
  });
});

describe("isDateWithinRange", () => {
  // Regression test for the bug fixed in reports/page.tsx: a full timestamp
  // on the end date must not be excluded just because it's later than
  // midnight of that day.
  it("includes a record timestamped later in the day on the end date", () => {
    expect(
      isDateWithinRange(
        "2026-09-04T14:30:00.000Z",
        "2026-09-01",
        "2026-09-04",
      ),
    ).toBe(true);
  });

  it("includes a record timestamped later in the day on the start date", () => {
    expect(
      isDateWithinRange(
        "2026-09-01T00:00:01.000Z",
        "2026-09-01",
        "2026-09-04",
      ),
    ).toBe(true);
  });

  it("excludes a record before the start date", () => {
    expect(
      isDateWithinRange(
        "2026-08-31T23:59:59.000Z",
        "2026-09-01",
        "2026-09-04",
      ),
    ).toBe(false);
  });

  it("excludes a record after the end date", () => {
    expect(
      isDateWithinRange(
        "2026-09-05T00:00:00.000Z",
        "2026-09-01",
        "2026-09-04",
      ),
    ).toBe(false);
  });

  // Regression test: this used to be a plain string comparison
  // (itemDate >= dateRange.start), which broke once itemDate carried a time
  // component, since e.g. "2026-09-04T14:30:00.000Z" sorts *after* the bare
  // "2026-09-04" end-date string lexicographically.
  it("does not rely on lexicographic string comparison", () => {
    expect(
      isDateWithinRange("2026-09-04T23:59:59.999Z", null, "2026-09-04"),
    ).toBe(true);
  });

  it("treats a missing start or end as unbounded on that side", () => {
    expect(isDateWithinRange("2020-01-01T00:00:00.000Z", null, null)).toBe(
      true,
    );
    expect(
      isDateWithinRange("2020-01-01T00:00:00.000Z", "2026-01-01", null),
    ).toBe(false);
  });

  it("returns false for a missing or unparseable item date", () => {
    expect(isDateWithinRange(null, "2026-01-01", "2026-01-31")).toBe(false);
    expect(isDateWithinRange(undefined, "2026-01-01", "2026-01-31")).toBe(
      false,
    );
    expect(isDateWithinRange("not-a-date", "2026-01-01", "2026-01-31")).toBe(
      false,
    );
  });
});
