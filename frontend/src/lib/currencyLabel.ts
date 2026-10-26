export function currencyLabel(code: string): string {
  return code === "INR" ? "₹" : code;
}
