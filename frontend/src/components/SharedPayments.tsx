import { useEffect, useState } from "react";
import { Check, Clock3, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { currencyLabel } from "../lib/currencyLabel";
import { useSuccessToast } from "../lib/successToast";
import AlphabetAvatar from "./AlphabetAvatar";
import Modal from "./Modal";
import "./shared-payments.css";

type Entry = { id: string; owner: { displayName: string }; direction: string; kind: string; amount: string; currency: string; purpose: string; date: string; paymentStatus?: string | null };
type Request = { id: string; version: number; name: string; purpose: string; amount: string; currency: string; date: string };
export default function SharedPayments({ onUpdated, refreshKey }: { onUpdated: () => void; refreshKey: number }) {
  const notify = useSuccessToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Entry | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const results = await Promise.allSettled([
        api<{ entries: Entry[] }>("/contacts/shared-entries", { signal: controller.signal }),
        api<{ requests: Request[] }>("/contacts/payment-requests", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (results[0].status === "fulfilled") setEntries(results[0].value.entries);
      if (results[1].status === "fulfilled") setRequests(results[1].value.requests);
      setError(results.some(result => result.status === "rejected") ? "Shared payment updates are unavailable. Please retry." : "");
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [revision, refreshKey]);
  async function act(path: string, body?: object) {
    if (busy) return;
    setBusy(true); setPaymentError("");
    try {
      const result = await api<{ message: string }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      setConfirming(null); notify(result.message, { position: "top-left" });
      setRevision(value => value + 1); onUpdated();
    } catch (err) { const message = err instanceof Error ? err.message : "Unable to update payment."; setPaymentError(message); notify(message, { position: "top-left", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <section className="shared-payments" aria-label="Shared payments">
    {error && <p className="profile-member" role="status">{error} <button className="button button-outline" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>Retry</button></p>}
    {requests.length > 0 && <><h2>Payment confirmations</h2>{requests.map(request => <article className="shared-payment-card" key={request.id}>
      <AlphabetAvatar name={request.name}/><div className="shared-payment-copy"><strong>{request.name} says they’ve paid</strong><p>{request.purpose} · {request.date}</p><span className="shared-payment-status">Confirm only after receiving the money</span></div><strong>{currencyLabel(request.currency)} {request.amount}</strong>
      <div className="shared-payment-actions"><button className="button shared-confirm" disabled={busy} onClick={() => void act(`/contacts/payment-requests/${request.id}/respond`, { action: "CONFIRM", version: request.version })}><Check size={16}/>Confirm received</button><button className="button shared-decline" disabled={busy} onClick={() => void act(`/contacts/payment-requests/${request.id}/respond`, { action: "DECLINE", version: request.version })}>Not received</button></div>
    </article>)}</>}
    {entries.length > 0 && <><h2>Shared with you</h2>{entries.map(entry => <article className="shared-payment-card" key={entry.id}>
      <AlphabetAvatar name={entry.owner.displayName}/><div className="shared-payment-copy"><strong>{entry.owner.displayName}</strong><p>{entry.purpose || "Money entry"} · {entry.date}</p><small>{entry.kind === "REPAYMENT" ? "Shared repayment" : entry.direction === "BORROWED" ? "Lent to you" : "Borrowed from you"}</small></div><strong>{currencyLabel(entry.currency)} {entry.amount}</strong>
      <div className="shared-payment-actions">{entry.paymentStatus === "PENDING" ? <span className="shared-payment-status"><Clock3 size={15}/>Awaiting confirmation</span> : entry.paymentStatus === "CONFIRMED" ? <span className="shared-payment-confirmed"><Check size={15}/>Payment confirmed</span> : entry.paymentStatus === "REVERSED" ? <span className="shared-payment-status">Repayment removed · ask sender to review</span> : entry.kind === "ADVANCE" && entry.direction === "BORROWED" ? <><button className="button shared-paid" disabled={busy} onClick={() => { setPaymentError(""); setConfirming(entry); }}>I’ve paid</button>{entry.paymentStatus === "DECLINED" && <small>Sender marked payment as not received</small>}</> : null}</div>
    </article>)}</>}
    {confirming && <Modal title="Request payment confirmation?" busy={busy} onClose={() => setConfirming(null)}>{paymentError && <p role="alert" className="error-message">{paymentError}</p>}<p>Have you paid {currencyLabel(confirming.currency)} {confirming.amount} to {confirming.owner.displayName} outside Paylet? They must confirm receipt before the balance changes.</p><div className="profile-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button><button className="button shared-paid" disabled={busy} onClick={() => void act(`/contacts/shared-entries/${confirming.id}/paid`)}>Yes, I’ve paid</button></div></Modal>}
  </section>;
}
