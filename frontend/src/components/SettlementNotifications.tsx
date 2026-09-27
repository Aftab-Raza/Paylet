import { useEffect, useState } from "react";
import { api } from "../lib/api";
type Request = { id: string; groupId: string; groupName: string; status: string; currency: string; amount: string };
export default function SettlementNotifications({ onOpen, disabled = false }: { onOpen: (groupId: string) => void; disabled?: boolean }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let current: AbortController | null = null;
    function refresh() {
      current?.abort(); const controller = new AbortController(); current = controller;
      api<{ requests: Request[] }>("/groups/settlement-requests", { signal: controller.signal })
        .then((data) => { if (active && !controller.signal.aborted) { setRequests(data.requests); setError(false); } })
        .catch(() => { if (active && !controller.signal.aborted) setError(true); });
    }
    function visible() { if (!document.hidden) refresh(); }
    refresh(); const timer = window.setInterval(visible, 20000);
    window.addEventListener("focus", visible); window.addEventListener("paylet:settlements", refresh); document.addEventListener("visibilitychange", visible);
    return () => { active = false; current?.abort(); window.clearInterval(timer); window.removeEventListener("focus", visible); window.removeEventListener("paylet:settlements", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return <div aria-live="polite">{error && <p className="pg-muted">Repayment notifications unavailable. Open Groups to check.</p>}{requests.length > 0 && <section className="pg-notification pg-stack"><strong>{requests.length} repayment request(s) need your response</strong>{requests.map((r) => <div className="pg-between" key={r.id}><span>{r.groupName} · {r.currency} {r.amount} · {r.status === "PENDING" ? "Confirm payment" : "Confirm reversal"}</span><button type="button" className="button button-blue" disabled={disabled} onClick={() => onOpen(r.groupId)}>Review in group</button></div>)}</section>}</div>;
}
