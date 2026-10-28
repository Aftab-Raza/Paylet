import { ArrowUpRight, History, ReceiptText, Trash2 } from "lucide-react";
import Modal from "./Modal";
import { useSuccessToast } from "../lib/successToast";
import { useEffect, useState } from "react";
import { currencyLabel } from "../lib/currencyLabel";
import type { FormEvent } from "react";
import { api } from "../lib/api";

type Person = { id: string; displayName: string; username: string };
type Member = { id: string; userId: string | null; user: Person };
type Bill = { id: string; creatorId: string; creator: Person; payer: Person; payerId?: string; amount: string; currency: string; purpose: string; category: string; date: string; splitMode: string; deletedAt: string | null; shares: { memberId: string; user: Person; amount: string }[] };
type Balance = { memberId: string; user: Person; currency: string; paid: string; share: string; net: string };
type Revision = { id: string; action: string; createdAt: string; actor: Person; snapshot: Bill };
type Draft = { id: string; amount: string; currency: string; purpose: string; category: string; date: string; payerId: string; splitMode: "EQUAL" | "CUSTOM"; participants: { memberId: string; amount: string }[] };
function errorText(error: unknown) { return error instanceof Error ? error.message : "Unable to complete the request."; }
function today(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function displayDate(value: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`)); }
function billSummary(bill: Bill, viewerId: string, viewerMemberId?: string) {
  if (bill.deletedAt) return "Deleted · excluded from balances";
  const money = (amount: string) => `${currencyLabel(bill.currency)} ${amount}`;
  const positive = (amount: string) => !/^0(?:\.0+)?$/.test(amount);
  const own = bill.shares.find((share) => share.memberId === viewerMemberId || share.user.id === viewerId);
  if (bill.payer.id === viewerId) {
    const others = bill.shares.filter((share) => share.memberId !== viewerMemberId && share.user.id !== viewerId && positive(share.amount));
    return others.length ? `Receive ${others.map((share) => `${money(share.amount)} from ${share.user.displayName}`).join(" · ")}` : "You paid · no one else owes a share";
  }
  return own && positive(own.amount) ? `Pay ${money(own.amount)} to ${bill.payer.displayName}` : "You have no amount to pay for this expense";
}
function preview(draft: Draft) {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: draft.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    function parse(value: string) {
      if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(value)) throw new Error("Enter a valid amount.");
      const [whole, fraction = ""] = value.split(".");
      if (fraction.length > digits) throw new Error(`${currencyLabel(draft.currency)} allows ${digits} decimal places.`);
      return BigInt(whole + fraction.padEnd(digits, "0"));
    }
    function format(value: bigint) { const s = value.toString().padStart(digits + 1, "0"); return digits ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s; }
    const total = parse(draft.amount);
    if (total <= 0n || !draft.participants.length) throw new Error("Enter a positive total and choose participants.");
    const sorted = [...draft.participants].sort((a, b) => a.memberId.localeCompare(b.memberId));
    const count = BigInt(sorted.length);
    const shares = sorted.map((p, i) => ({ memberId: p.memberId, value: draft.splitMode === "EQUAL" ? total / count + (BigInt(i) < total % count ? 1n : 0n) : parse(p.amount) }));
    if (shares.reduce((sum, p) => sum + p.value, 0n) !== total) throw new Error("Custom shares must add up exactly to the total.");
    return { valid: true, error: "", shares: shares.map((p) => ({ memberId: p.memberId, amount: format(p.value) })) };
  } catch (error) { return { valid: false, error: errorText(error), shares: [] }; }
}
export default function GroupBills({ groupId, members, viewerId, ownerId }: { groupId: string; members: Member[]; viewerId: string; ownerId: string }) {
  const notify = useSuccessToast();
  const viewerMember = members.find((member) => member.userId === viewerId);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ bills: Bill[]; balances: Balance[] } | null>(null);
  const [options, setOptions] = useState<{ currencies: string[]; categories: string[]; currency: string; timezone: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [history, setHistory] = useState<Revision[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ bills: Bill[]; balances: Balance[] }>(`/groups/${groupId}/bills`, { signal: controller.signal }),
      api<{ currencies: string[]; categories: string[] }>("/expenses/options", { signal: controller.signal }),
      api<{ user: { defaultCurrency: string; timezone: string } }>("/auth/me", { signal: controller.signal }),
    ]).then(([result, choices, profile]) => {
      if (controller.signal.aborted) return;
      setData(result); setOptions({ ...choices, currency: profile.user.defaultCurrency, timezone: profile.user.timezone }); setError("");
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorText(err)); });
    return () => controller.abort();
  }, [groupId, revision]);
  function begin() {
    if (!options || !viewerMember) return;
    setDraft({ id: crypto.randomUUID(), amount: "", currency: options.currency, purpose: "", category: "Other", date: today(options.timezone), payerId: viewerMember.id, splitMode: "EQUAL", participants: members.map((m) => ({ memberId: m.id, amount: "" })) });
    setError(""); setHistory(null);
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => old ? { ...old, [key]: value } : old); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy || !viewerMember) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/${groupId}/bills`, { method: "POST", body: JSON.stringify({ ...draft, payerId: viewerMember.id, participants: draft.participants.map((p) => draft.splitMode === "EQUAL" ? { memberId: p.memberId } : p) }) });
      setDraft(null); notify("Bill saved.", { position: "top-left" }); setRevision((n) => n + 1);
    } catch (err) { setError(errorText(err)); notify(errorText(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }
  async function remove(bill: Bill) {
    if (!window.confirm(`Delete “${bill.purpose}”? This removes its shares from everyone’s totals and preserves history.`)) return;
    setBusy(true); setError("");
    try { await api(`/groups/${groupId}/bills/${bill.id}`, { method: "DELETE" }); setHistory(null); notify("Bill deleted.", { position: "top-left" }); setRevision((n) => n + 1); }
    catch (err) { setError(errorText(err)); notify(errorText(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }
  async function openHistory(bill: Bill) {
    if (busy || draft) return;
    setBusy(true); setError("");
    try { const result = await api<{ history: Revision[] }>(`/groups/${groupId}/bills/${bill.id}/history`); setHistoryTitle(bill.purpose); setHistory(result.history); }
    catch (err) { setError(errorText(err)); notify(errorText(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }
  const split = draft ? preview(draft) : null;
  return <section className="pg-panel pg-stack pg-group-bills">
    <div className="pg-between"><div><span className="pg-kicker">SHARED SPENDING</span><h2>Group bills</h2></div><div className="pg-actions"><button className="button button-outline" disabled={busy || !!draft} onClick={() => setRevision((n) => n + 1)}>Refresh bills</button><button className="button pg-add-expense" disabled={busy || !!draft || !options || !viewerMember} onClick={begin}>+ Add expense</button></div></div>
    {error && !draft && <p className="pg-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading shared bills…</p>}
    {data && data.balances.length > 0 && <details className="pg-balance-details"><summary>Group balances · after repayments</summary><div className="pg-grid">{data.balances.map((b) => <article className="pg-balance" key={`${b.memberId}:${b.currency}`}><strong>{b.user.displayName}{b.user.id === viewerId ? " (You)" : ""}</strong><p>{currencyLabel(b.currency)} · Paid {b.paid} · Share {b.share}</p><strong>{/^0(?:\.0+)?$/.test(b.net) ? "Settled for these bills" : b.net.startsWith("-") ? `To pay: ${currencyLabel(b.currency)} ${b.net.slice(1)}` : `To receive: ${currencyLabel(b.currency)} ${b.net}`}</strong></article>)}</div></details>}
    {draft && options && <Modal title="New shared expense" busy={busy} className="pg-expense-modal" onClose={() => { setDraft(null); setError(""); }}>
      {error && <p className="pg-error" role="alert">{error}</p>}
      <form className="pg-stack pg-bill-form" onSubmit={save}><fieldset disabled={busy} className="pg-stack">
      <div className="pg-columns"><label className="pg-stack">Total amount<input data-autofocus inputMode="decimal" required value={draft.amount} onChange={(e) => update("amount", e.target.value)} placeholder="1000.00"/></label><label className="pg-stack">Currency<select value={draft.currency} onChange={(e) => update("currency", e.target.value)}>{options.currencies.map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}</select></label></div>
      <label className="pg-stack">Purpose<input required maxLength={200} value={draft.purpose} onChange={(e) => update("purpose", e.target.value)} placeholder="Dinner, groceries, taxi…"/></label>
      <div className="pg-columns"><label className="pg-stack">Date<input type="date" min="1900-01-01" max="2199-12-31" required value={draft.date} onChange={(e) => update("date", e.target.value)}/></label><label className="pg-stack">Category<select value={draft.category} onChange={(e) => update("category", e.target.value)}>{options.categories.map((c) => <option key={c}>{c}</option>)}</select></label></div>
      <div className="pg-columns"><label className="pg-stack">Who paid?<input readOnly value={`${viewerMember?.user.displayName ?? ""} (You)`}/></label><label className="pg-stack">Split method<select value={draft.splitMode} onChange={(e) => update("splitMode", e.target.value as Draft["splitMode"])}><option value="EQUAL">Equal split</option><option value="CUSTOM">Custom amounts</option></select></label></div>
      <h3>Who shares this expense?</h3>
      {members.map((m) => { const chosen = draft.participants.find((p) => p.memberId === m.id); return <div className="pg-row" key={m.id}><label className="pg-check pg-grow"><input type="checkbox" checked={!!chosen} onChange={(e) => update("participants", e.target.checked ? [...draft.participants, { memberId: m.id, amount: "" }] : draft.participants.filter((p) => p.memberId !== m.id))}/>{m.user.displayName}{m.userId ? ` (@${m.user.username})` : " (offline)"}</label>{chosen && draft.splitMode === "CUSTOM" && <input className="pg-share-input" aria-label={`Share for ${m.user.displayName}`} inputMode="decimal" required value={chosen.amount} onChange={(e) => update("participants", draft.participants.map((p) => p.memberId === m.id ? { ...p, amount: e.target.value } : p))}/>}</div>; })}
      {split?.valid ? <div className="pg-success"><strong>Split preview</strong>{split.shares.map((s) => <p key={s.memberId}>{members.find((m) => m.id === s.memberId)?.user.displayName}: {currencyLabel(draft.currency)} {s.amount}</p>)}</div> : <p className="pg-muted">{split?.error}</p>}
      <p className="pg-muted">Review the split before saving. Saved bills cannot be edited.</p>
      <div className="pg-actions"><button className="button button-green" disabled={!split?.valid}>{busy ? "Saving…" : "Save shared expense"}</button><button type="button" className="button pg-danger" onClick={() => { setDraft(null); setError(""); }}>Cancel</button></div>
    </fieldset></form></Modal>}
    <label className="pg-check"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)}/>Show deleted bills</label>
    <p className="pg-bill-caption">Each bill shows its original split. Group balances include confirmed repayments.</p>
    {data?.bills.filter((b) => showDeleted || !b.deletedAt).map((bill) => <article key={bill.id} className={`pg-bill pg-transaction ${bill.deletedAt ? "pg-bill-deleted" : ""}`}>
      <div className="pg-transaction-heading"><span className="pg-receipt-icon" aria-hidden="true"><ReceiptText size={21}/></span><div className="pg-transaction-title"><h3>{bill.purpose}</h3><p>{displayDate(bill.date)} · {bill.category}</p></div><strong className="pg-transaction-amount">{currencyLabel(bill.currency)} {bill.amount}</strong></div>
      <p className="pg-bill-payer">Paid by <strong>{bill.payer.id === viewerId ? "You" : bill.payer.displayName}</strong></p>
      <div className="pg-personal-split"><ArrowUpRight size={17} aria-hidden="true"/><p><small>{bill.deletedAt ? "DELETED EXPENSE" : "ORIGINAL SPLIT"}</small>{billSummary(bill, viewerId, viewerMember?.id)}</p></div>
      <div className="pg-transaction-footer"><details className="pg-bill-split"><summary>View split</summary><p className="pg-muted">Recorded by {bill.creator.displayName}</p>{bill.shares.map((share) => <p key={share.memberId}><strong>{share.user.displayName}</strong><span>{currencyLabel(bill.currency)} {share.amount}</span></p>)}</details><div className="pg-actions"><button className="button button-outline" aria-disabled={busy || !!draft} onClick={() => void openHistory(bill)}><History size={15}/>History</button>{!bill.deletedAt && (bill.creatorId === viewerId || ownerId === viewerId) && <button className="button pg-danger" disabled={busy || !!draft} onClick={() => void remove(bill)}><Trash2 size={15}/>Delete</button>}</div></div>
    </article>)}
    {data && !data.bills.some((b) => showDeleted || !b.deletedAt) && <p className="pg-muted">No bills to show. Add an expense to start splitting.</p>}
    {history && <Modal title="Bill history" className="pg-history-modal" onClose={() => setHistory(null)}><p className="pg-muted">{historyTitle}</p><div className="pg-stack">{history.length === 0 && <p>No history available.</p>}{history.map((h) => <section className="pg-history-entry" key={h.id}><strong>{h.action} · {h.actor.displayName}</strong><p>{new Date(h.createdAt).toLocaleString()}</p><p>{h.snapshot.purpose} · {currencyLabel(h.snapshot.currency)} {h.snapshot.amount}</p><p>Expense date: {h.snapshot.date} · Paid by {h.snapshot.payer.displayName}</p>{h.snapshot.shares.map((share) => <p key={share.memberId}>{share.user.displayName}: {currencyLabel(h.snapshot.currency)} {share.amount}</p>)}</section>)}</div></Modal>}

  </section>;
}
