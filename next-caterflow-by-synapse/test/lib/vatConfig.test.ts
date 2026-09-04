import { VAT_CONFIG } from "@/lib/vatConfig";

describe("VAT_CONFIG.calculateVAT", () => {
  it("applies the configured VAT rate to a VAT-applicable amount", () => {
    const { vatAmount, totalWithVAT } = VAT_CONFIG.calculateVAT(100, true);
    expect(vatAmount).toBe(15); // 15% of 100, at the default 0.15 rate
    expect(totalWithVAT).toBe(115);
  });

  it("charges no VAT when the item is not VAT-applicable", () => {
    const { vatAmount, totalWithVAT } = VAT_CONFIG.calculateVAT(100, false);
    expect(vatAmount).toBe(0);
    expect(totalWithVAT).toBe(100);
  });

  it("defaults isVATApplicable to true when omitted", () => {
    const { vatAmount } = VAT_CONFIG.calculateVAT(100);
    expect(vatAmount).toBe(15);
  });

  it("treats a non-numeric amount as 0", () => {
    const { vatAmount, totalWithVAT } = VAT_CONFIG.calculateVAT(
      NaN as unknown as number,
      true,
    );
    expect(vatAmount).toBe(0);
    expect(totalWithVAT).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const { vatAmount, totalWithVAT } = VAT_CONFIG.calculateVAT(33.33, true);
    expect(vatAmount).toBeCloseTo(5.0, 2);
    expect(totalWithVAT).toBeCloseTo(38.33, 2);
  });
});

describe("VAT_CONFIG.formatVAT", () => {
  it("formats an amount with the SZL prefix and 2 decimals", () => {
    expect(VAT_CONFIG.formatVAT(15)).toBe("SZL 15.00");
  });
});
