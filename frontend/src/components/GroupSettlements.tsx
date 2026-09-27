import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";

type Person = { id: string; displayName: string; username: string };
type Debt = { fromMemberId: string; toMemberId: string; fromUser: Person; toUser: Person; currency: string; amount: string };
type Payment = { id: string; creatorId: string; fromMemberId: string; toMemberId: string; fromUser: Person; toUser: Person; amount: string; currency: string; paidOn: string; note: string; status: string; version: number; reversalRequesterId: string | null };
type History = { id: string; action: string; createdAt: string; actor: Person; snapshot: Payment };
type Data = { settlements: Payment[]; debts: Debt[] };
type Draft = { id: string; fromMemberId: string; toMemberId: string; currency: string; amount: string; paidOn: string; note: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to load repayments.";
const key = (debt: Pick<Debt, "fromMemberId" | "toMemberId" | "currency">) => `${debt.fromMemberId}:${debt.toMemberId}:${debt.currency}`;
function today(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`)); }
export default function GroupSettlements({ groupId, viewerId, timezone, refreshKey, onChanged }: {
  groupId: string; viewerId: string; timezone: string; refreshKey: number; onChanged: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<History[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<Data>(`/groups/${groupId}/settlements`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setLoadError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) setLoadError(message(err)); });
    return () => controller.abort();
  }, [groupId, revision, refreshKey]);
  const ownDebts = data?.debts.filter((d) => d.fromUser.id === viewerId || d.toUser.id === viewerId) ?? [];
  function changed() {
    setRevision((n) => n + 1); onChanged();
    window.dispatchEvent(new Event("paylet:settlements"));
  }
  function begin(debt: Debt) {
    setDraft({ id: crypto.randomUUID(), fromMemberId: debt.fromMemberId, toMemberId: debt.toMemberId, currency: debt.currency, amount: debt.amount, paidOn: today(timezone), note: "" });
    setError(""); setNotice(""); setHistory(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/groups/${groupId}/settlements`, { method: "POST", body: JSON.stringify(draft) });
      setDraft(null); setNotice("Repayment requested. Totals change only after the other person confirms."); changed();
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function act(payment: Payment, action: string) {
    const prompts: Record<string, string> = {
      CONFIRM: `Confirm that ${payment.fromUser.displayName} paid ${payment.currency} ${payment.amount} to ${payment.toUser.displayName}?`,
      CONFIRM_REVERSAL: "Reverse this payment record? Its effect on the amount owed will be removed. This does not transfer money.",
      REQUEST_REVERSAL: "Ask the other person to reverse this repayment record?",
      CANCEL: "Delete this pending request? It will stay in history as cancelled.",
    };
    if (prompts[action] && !window.confirm(prompts[action])) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/groups/${groupId}/settlements/${payment.id}/action`, { method: "POST", body: JSON.stringify({ action, version: payment.version }) });
      setHistory(null); setNotice("Repayment updated."); changed();
    } catch (err) { setError(message(err)); setRevision((n) => n + 1); } finally { setBusy(false); }
  }
  async function openHistory(payment: Payment) {
    setBusy(true); setError("");
    try { const result = await api<{ history: History[] }>(`/groups/${groupId}/settlements/${payment.id}/history`); setHistory(result.history); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  function actionButton(p: Payment, action: string, label: string, color = "button-outline") {
    return <button type="button" className={`button ${color}`} disabled={busy || !!draft} onClick={() => void act(p, action)}>{label}</button>;
  }
  return <section className="pg-settlements pg-stack">
    <div className="pg-between"><div><span className="pg-kicker">SETTLE UP</span><h2>Repayments</h2></div><button className="button button-outline" disabled={busy} onClick={() => setRevision((n) => n + 1)}>Refresh repayments</button></div>
    <p className="pg-muted">Record payments already made outside Paylet. This app does not transfer money. Each currency and person-to-person amount stays separate.</p>
    {loadError && <p className="pg-error" role="alert">{loadError}</p>}{error && <p className="pg-error" role="alert">{error}</p>}{notice && <p className="pg-success" role="status">{notice}</p>}
    {!data && !loadError && <p role="status">Loading repayments…</p>}
    {data && <div className="pg-stack"><h3>Who owes whom</h3>{data.debts.length === 0 ? <p className="pg-success">No outstanding person-to-person amounts in this group.</p> : data.debts.map((d) => <div className="pg-row" key={key(d)}><div className="pg-grow"><strong>{d.fromUser.displayName} owes {d.toUser.displayName}</strong><p>{d.currency} {d.amount}</p></div>{(d.fromUser.id === viewerId || d.toUser.id === viewerId) && <button className="button button-green" disabled={busy || !!draft} onClick={() => begin(d)}>Record repayment</button>}</div>)}</div>}
    {draft && <form className="pg-stack pg-bill-form" onSubmit={save}><h3>Record a repayment</h3><fieldset className="pg-stack" disabled={busy}>
      <label className="pg-stack">Who paid whom?<select value={key(draft)} onChange={(event) => { const debt = ownDebts.find((d) => key(d) === event.target.value); if (debt) setDraft({ ...draft, fromMemberId: debt.fromMemberId, toMemberId: debt.toMemberId, currency: debt.currency, amount: debt.amount }); }}>{!ownDebts.some((d) => key(d) === key(draft)) && <option value={key(draft)}>Amount changed — cancel and refresh</option>}{ownDebts.map((d) => <option key={key(d)} value={key(d)}>{d.fromUser.displayName} → {d.toUser.displayName} · {d.currency} {d.amount} remaining</option>)}</select></label>
      <div className="pg-columns"><label className="pg-stack">Amount ({draft.currency})<input inputMode="decimal" required value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })}/></label><label className="pg-stack">Payment date<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.paidOn} onChange={(e) => setDraft({ ...draft, paidOn: e.target.value })}/></label></div>
      <label className="pg-stack">Note (optional)<input maxLength={300} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Cash, bank transfer…"/></label>
      <p className="pg-muted">The other person must confirm. Saved payment details cannot be edited.</p><div className="pg-actions"><button className="button button-green" disabled={!ownDebts.some((d) => key(d) === key(draft))}>{busy ? "Saving…" : "Send for confirmation"}</button><button type="button" className="button button-outline" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form>}
    <h3>Repayment activity</h3>
    {data?.settlements.length === 0 && <p className="pg-muted">No repayments recorded yet.</p>}
    {data?.settlements.map((p) => {
      const myMemberId = p.fromUser.id === viewerId ? p.fromMemberId : p.toUser.id === viewerId ? p.toMemberId : null;
      const involved = myMemberId !== null;
      const creator = p.creatorId === viewerId;
      const requester = p.reversalRequesterId === myMemberId;
      return <article className="pg-bill" key={p.id}><div className="pg-between"><strong>{p.fromUser.displayName} → {p.toUser.displayName}</strong><span className={`pg-tag pg-payment-${p.status.toLowerCase()}`}>{p.status.replaceAll("_", " ").toLowerCase()}</span></div><strong>{p.currency} {p.amount}</strong><p className="pg-muted">{dateLabel(p.paidOn)}{p.note ? ` · ${p.note}` : ""}</p>{p.status === "REVERSAL_PENDING" && <p className="pg-muted">Still included in totals until reversal is confirmed.</p>}<div className="pg-actions">
        {p.status === "PENDING" && involved && !creator && <>{actionButton(p, "CONFIRM", "Confirm payment", "button-green")}{actionButton(p, "REJECT", "Reject")}</>}
        {p.status === "PENDING" && creator && actionButton(p, "CANCEL", "Delete request", "pg-danger")}
        {p.status === "CONFIRMED" && involved && actionButton(p, "REQUEST_REVERSAL", "Request reversal", "pg-danger")}
        {p.status === "REVERSAL_PENDING" && involved && !requester && <>{actionButton(p, "CONFIRM_REVERSAL", "Confirm reversal", "pg-danger")}{actionButton(p, "REJECT_REVERSAL", "Keep payment")}</>}
        {p.status === "REVERSAL_PENDING" && involved && requester && actionButton(p, "CANCEL_REVERSAL", "Withdraw reversal")}
        <button type="button" className="button button-outline" disabled={busy} onClick={() => void openHistory(p)}>History</button>
      </div></article>;
    })}
    {history && <section className="pg-bill pg-stack"><div className="pg-between"><h3>Repayment history</h3><button type="button" className="button button-outline" onClick={() => setHistory(null)}>Close</button></div>{history.map((h) => <div key={h.id}><strong>{h.action.replaceAll("_", " ")} · {h.actor.displayName}</strong><p>{new Date(h.createdAt).toLocaleString()}</p><p>{h.snapshot.fromUser.displayName} → {h.snapshot.toUser.displayName}: {h.snapshot.currency} {h.snapshot.amount}</p><p>Payment date: {h.snapshot.paidOn} · Status: {h.snapshot.status}</p>{h.snapshot.note && <p>{h.snapshot.note}</p>}</div>)}</section>}
  </section>;
}
