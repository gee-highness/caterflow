// src/lib/vatConfig.ts
// VAT configuration for the reports page. Pulled out into its own module so
// it's unit-testable without importing the whole reports page component
// (which drags in Chakra, recharts, xlsx, jspdf, html2canvas, etc.).
// Rate is driven by an env variable so no code change is needed when
// legislation changes. Set NEXT_PUBLIC_VAT_RATE in .env (default 0.15 = 15%).
const _VAT_RATE = Number(process.env.NEXT_PUBLIC_VAT_RATE) || 0.15;

export const VAT_CONFIG = {
  rate: _VAT_RATE,
  ratePercentage: Math.round(_VAT_RATE * 100),
  calculateVAT: (
    amount: number,
    isVATApplicable: boolean = true,
  ): { vatAmount: number; totalWithVAT: number } => {
    const cleanAmount = Number(amount) || 0;
    if (!isVATApplicable) {
      return { vatAmount: 0, totalWithVAT: cleanAmount };
    }
    const vatAmount = Math.round(cleanAmount * _VAT_RATE * 100) / 100;
    const totalWithVAT = Math.round((cleanAmount + vatAmount) * 100) / 100;
    return { vatAmount, totalWithVAT };
  },
  formatVAT: (amount: number): string => `SZL ${amount.toFixed(2)}`,
};
