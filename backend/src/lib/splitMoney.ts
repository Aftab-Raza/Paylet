// All arithmetic uses integer minor units, never floating-point money.
export function moneyString(amount: bigint, digits: number): string {
  const sign = amount < 0n ? "-" : "";
  const value = (amount < 0n ? -amount : amount).toString().padStart(digits + 1, "0");
  return sign + (digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value);
}
export function parseMoney(value: string, digits: number): bigint {
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(value)) throw new Error("Enter an amount with up to 12 whole digits and no commas.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > digits) throw new Error(`This currency allows ${digits} decimal places.`);
  return BigInt(whole + fraction.padEnd(digits, "0"));
}
export function equalShares(total: bigint, memberIds: string[]) {
  if (!memberIds.length || new Set(memberIds).size !== memberIds.length) throw new Error("Choose distinct participants.");
  const ids = [...memberIds].sort();
  const count = BigInt(ids.length);
  return ids.map((memberId, index) => ({ memberId, amountMinor: total / count + (BigInt(index) < total % count ? 1n : 0n) }));
}
