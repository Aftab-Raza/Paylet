import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronRight, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { currencyLabel } from "../lib/currencyLabel";
import { useSuccessToast } from "../lib/successToast";
import type { useGroupInvitations } from "../hooks/useGroupInvitations";

type Update = { id: string; title: string; detail: string; screen: "groups" | "people"; groupId?: string };
type Settlement = { id: string; groupId: string; groupName: string; status: string; currency: string; amount: string };
type Payment = { id: string; name: string; purpose: string; currency: string; amount: string };
type Connection = { id: string; owner: { displayName: string; username: string } };
export default function NotificationCenter({ invites, disabled, onOpen }: { invites: ReturnType<typeof useGroupInvitations>; disabled: boolean; onOpen: (screen: "groups" | "people", groupId?: string) => void }) {
  const root = useRef<HTMLDetailsElement>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const notify = useSuccessToast();
  useEffect(() => {
    let current: AbortController | undefined;
    async function load() {
      current?.abort();
      const controller = new AbortController(); current = controller;
      const results = await Promise.allSettled([
        api<{ requests: Settlement[] }>("/groups/settlement-requests", { signal: controller.signal }),
        api<{ requests: Payment[] }>("/contacts/payment-requests", { signal: controller.signal }),
        api<{ requests: Connection[] }>("/contacts/link-requests", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const next: Update[] = [];
      if (results[0].status === "fulfilled") next.push(...results[0].value.requests.map(r => ({ id: `settlement-${r.id}`, title: r.status === "PENDING" ? "Review group payment" : "Review payment reversal", detail: `${r.groupName} · ${currencyLabel(r.currency)} ${r.amount}`, screen: "groups" as const, groupId: r.groupId })));
      if (results[1].status === "fulfilled") next.push(...results[1].value.requests.map(r => ({ id: `payment-${r.id}`, title: `${r.name} says they’ve paid`, detail: `${currencyLabel(r.currency)} ${r.amount} · ${r.purpose}`, screen: "people" as const })));
      if (results[2].status === "fulfilled") next.push(...results[2].value.requests.map(r => ({ id: `connection-${r.id}`, title: "Connection request", detail: `${r.owner.displayName} · @${r.owner.username}`, screen: "people" as const })));
      setUpdates(next); setLoading(false);
      setError(results.some(r => r.status === "rejected") ? "Some updates could not load. Retry, or check People and Groups." : "");
    }
    const visible = () => { if (!document.hidden) void load(); };
    void load(); const timer = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { current?.abort(); clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [revision]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) root.current?.removeAttribute("open"); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && root.current?.open) { root.current.removeAttribute("open"); root.current.querySelector("summary")?.focus(); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  async function respond(id: string, action: "ACCEPT" | "DECLINE") {
    if (busy || disabled) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/invitations/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) });
      invites.refresh(); notify(action === "ACCEPT" ? "You joined the group." : "Invitation declined.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to respond. Please retry."); }
    finally { setBusy(false); }
  }
  function review(screen: "groups" | "people", groupId?: string) { root.current?.removeAttribute("open"); onOpen(screen, groupId); }
  const count = updates.length + invites.invitations.length;
  return <details className="notification-center" ref={root}>
    <summary aria-label={`Notifications${count ? `, ${count} pending` : ""}`} title="Notifications"><Bell size={20} aria-hidden="true"/>{count > 0 && <span className="notification-count">{count > 99 ? "99+" : count}</span>}</summary>
    <section className="notification-panel" aria-label="Notification inbox">
      <div className="notification-heading"><h2>Notifications</h2><button className="button button-outline" aria-label="Refresh notifications" disabled={loading || busy} onClick={() => { setLoading(true); setRevision(n => n + 1); invites.refresh(); }}><RefreshCw size={16} className={loading ? "refresh-spinner" : ""}/></button></div>
      {(error || invites.error) && <p role="alert">{error || "Group invitations could not load. Please refresh."}</p>}
      {loading || invites.loading ? <p role="status">Checking for updates…</p> : count === 0 && !error && !invites.error ? <p className="profile-member"><Check size={16} aria-hidden="true"/> You’re all caught up.</p> : null}
      {invites.invitations.map(item => <article className="notification-item" key={item.id}><strong>Invitation to {item.group.name}</strong><p>{item.group.owner.displayName} (@{item.group.owner.username}) invited you.</p><p className="profile-member">Joining gives you access to this group’s bill history. Your private records stay private.</p><div className="notification-actions"><button className="button button-green" disabled={disabled || busy} onClick={() => void respond(item.id, "ACCEPT")}>Accept</button><button className="button button-danger" disabled={disabled || busy} onClick={() => void respond(item.id, "DECLINE")}>Decline</button></div></article>)}
      {updates.map(item => <article className="notification-item" key={item.id}><strong>{item.title}</strong><p>{item.detail}</p><button className="button button-outline" disabled={disabled || busy} onClick={() => review(item.screen, item.groupId)}>Review in {item.screen === "groups" ? "Groups" : "People"}<ChevronRight size={16}/></button></article>)}
    </section>
  </details>;
}
