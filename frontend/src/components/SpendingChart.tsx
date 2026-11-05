import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { currencyLabel } from "../lib/currencyLabel";

type Entry = { amount: string; currency: string; category: string; date: string; voidedAt: string | null };
export default function SpendingChart({ expenses, month, today, defaultCurrency, selectedCategory, onSelect }: { expenses: Entry[]; month: string; today: string; defaultCurrency: string; selectedCategory: string; onSelect: (category: string) => void }) {
  const [period, setPeriod] = useState("month");
  const [chosenCurrency, setChosenCurrency] = useState(defaultCurrency);
  const currencies = [...new Set(expenses.filter(e => !e.voidedAt).map(e => e.currency))].sort();
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies[0] ?? defaultCurrency;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = month === today.slice(0, 7) ? today : new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const start = new Date(`${end}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  const entries = expenses.filter(e => !e.voidedAt && e.currency === currency && (period === "month" || e.date >= startDate && e.date <= end));
  const digits = Math.max(new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2, ...entries.map(e => e.amount.split(".")[1]?.length ?? 0));
  const totals = new Map<string, bigint>();
  for (const entry of entries) { const [whole, fraction = ""] = entry.amount.split("."); totals.set(entry.category, (totals.get(entry.category) ?? 0n) + BigInt(whole + fraction.padEnd(digits, "0"))); }
  const rows = [...totals].sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : a[0].localeCompare(b[0]));
  const max = rows[0]?.[1] ?? 0n;
  const total = rows.reduce((sum, row) => sum + row[1], 0n);
  function format(units: bigint) { const value = units.toString().padStart(digits + 1, "0"); return `${currencyLabel(currency)} ${digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value}`; }
  return <section className="spending-chart" aria-label="Spending by category">
    <div className="spending-chart-heading"><h2><BarChart3 size={20} aria-hidden="true"/> Spending by category</h2><strong aria-label="Chart total">{format(total)}</strong></div>
    <div className="spending-chart-controls"><div role="group" aria-label="Chart period"><button type="button" aria-pressed={period === "month"} onClick={() => setPeriod("month")}>Month</button><button type="button" aria-pressed={period === "week"} onClick={() => setPeriod("week")}>Last 7 days</button></div><label>Currency<select aria-label="Chart currency" value={currency} onChange={event => setChosenCurrency(event.target.value)}>{(currencies.length ? currencies : [defaultCurrency]).map(code => <option key={code} value={code}>{currencyLabel(code)}</option>)}</select></label></div>
    <p className="profile-member">{period === "month" ? month : `${startDate < `${month}-01` ? `${month}-01` : startDate} to ${end}`} · Select a category to filter the expense list.</p>
    {!rows.length ? <p className="profile-member">No spending recorded for this period and currency.</p> : <div className="spending-chart-bars">{rows.map(([category, amount]) => <button key={category} type="button" className="spending-chart-row" aria-pressed={selectedCategory === category} onClick={() => onSelect(selectedCategory === category ? "" : category)}><span>{category}</span><strong>{format(amount)}</strong><span className="spending-chart-track" aria-hidden="true"><span style={{ width: `${max > 0n ? Number(amount * 10000n / max) / 100 : 0}%` }}/></span></button>)}</div>}
    {selectedCategory && <button className="button button-outline" onClick={() => onSelect("")}>Clear category filter</button>}
  </section>;
}
