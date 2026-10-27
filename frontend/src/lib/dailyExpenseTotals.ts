type DailyExpense = { date: string; amount: string; currency: string; voidedAt: string | null };

/** Sum exact decimal amounts per currency, excluding voided entries. */
export function dailyExpenseTotals(expenses: readonly DailyExpense[], date: string) {
  const totals = new Map<string, { units: bigint; digits: number }>();
  for (const expense of expenses) {
    if (expense.voidedAt || expense.date !== date) continue;
    const [whole, fraction = ""] = expense.amount.split(".");
    const previous = totals.get(expense.currency) ?? { units: 0n, digits: fraction.length };
    const digits = Math.max(previous.digits, fraction.length);
    const units = previous.units * 10n ** BigInt(digits - previous.digits)
      + BigInt(whole + fraction.padEnd(digits, "0"));
    totals.set(expense.currency, { units, digits });
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, { units, digits }]) => {
    const value = units.toString().padStart(digits + 1, "0");
    return { currency, amount: digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value };
  });
}

export function zeroExpenseTotal(currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return { currency, amount: digits ? `0.${"0".repeat(digits)}` : "0" };
}
