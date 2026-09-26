import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useGroupInvitations } from "../hooks/useGroupInvitations";
import "./groups.css";

type Person = { id: string; username: string; displayName: string };
type Group = { id: string; name: string; ownerId: string; members: { id: string; userId: string; user: Person }[] };
type Listing = { viewerId: string; groups: Group[] };
type Sent = { id: string; status: string; recipient: Person };
const message = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please try again.";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function GroupDetails({ group, owner, viewerId, onChange, onBack }: {
  group: Group; owner: boolean; viewerId: string; onChange: () => void; onBack: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const [sentError, setSentError] = useState("");
  const [sentLoading, setSentLoading] = useState(owner);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    api<{ invitations: Sent[] }>(`/groups/${group.id}/invitations`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setSent(result.invitations); setSentLoading(false); setSentError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setSentError(message(err)); setSentLoading(false); } });
    return () => controller.abort();
  }, [group.id, owner, revision]);

  async function save(event: FormEvent, kind: "rename" | "invite") {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/groups/${group.id}${kind === "invite" ? "/invitations" : ""}`, {
        method: kind === "invite" ? "POST" : "PATCH",
        body: JSON.stringify(kind === "invite" ? { username: username.trim() } : { name: name.trim() }),
      });
      if (kind === "invite") {
        setUsername(""); setRevision((n) => n + 1); setNotice("Invitation sent. Your friend can accept it in Groups.");
      } else { setNotice("Group renamed."); onChange(); }
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/${group.id}`, { method: "DELETE" });
      onBack(); onChange();
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <>
    <button className="button button-outline" disabled={busy} onClick={onBack}>← All groups</button>
    <section className="pg-panel pg-hero">
      <span className="pg-avatar pg-avatar-large" aria-hidden="true">{initials(group.name)}</span>
      <div><span className="pg-kicker">SHARED GROUP</span><h1>{group.name}</h1><p>{group.members.length} members · {owner ? "Created by you" : "You are a member"}</p></div>
    </section>
    {error && <p className="pg-error" role="alert">{error}</p>}
    {notice && <p className="pg-success" role="status">{notice}</p>}
    <div className="pg-columns">
      <section className="pg-panel"><h2>People in this group</h2>
        {group.members.map((member) => <div className="pg-row" key={member.id}>
          <span className="pg-avatar" aria-hidden="true">{initials(member.user.displayName)}</span>
          <div className="pg-grow"><strong>{member.user.displayName}{member.userId === viewerId ? " (You)" : ""}</strong><p>@{member.user.username}</p></div>
          <span className="pg-tag">{member.userId === group.ownerId ? "Owner" : "Member"}</span>
        </div>)}
        <p className="pg-muted">Your personal expenses and private lending records stay private.</p>
      </section>
      {owner && <section className="pg-panel pg-stack">
        <h2>Invite a friend</h2><p className="pg-muted">They join only after accepting your invitation.</p>
        <form className="pg-stack" onSubmit={(event) => void save(event, "invite")}>
          <label htmlFor="pg-username">Exact Paylet username</label>
          <input id="pg-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your friend’s username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} required disabled={busy}/>
          <button className="button button-green" disabled={busy || !username.trim()}>Send invitation</button>
        </form>
        <div className="pg-between"><h3>Invitation status</h3><button className="button button-outline" disabled={busy} onClick={() => setRevision((n) => n + 1)}>Refresh</button></div>
        {sentError ? <p className="pg-error" role="alert">{sentError}</p> : sentLoading ? <p role="status">Loading invitations…</p> : sent.length === 0 ? <p className="pg-muted">No invitations sent yet.</p> : sent.map((item) => <div className="pg-row" key={item.id}><div className="pg-grow"><strong>{item.recipient.displayName}</strong><p>@{item.recipient.username}</p></div><span className={`pg-tag pg-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></div>)}
      </section>}
    </div>
    {owner && <section className="pg-panel pg-stack"><h2>Group settings</h2>
      <form className="pg-inline" onSubmit={(event) => void save(event, "rename")}>
        <div className="pg-grow"><label htmlFor="pg-name">Group name</label><input id="pg-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy}/></div>
        <button className="button button-blue" disabled={busy || !name.trim()}>Save name</button>
      </form>
      <div className="pg-danger-zone"><div><h3>Delete group</h3><p>Hide this group from all members and cancel pending invitations. Records are retained.</p></div>
        {!confirming ? <button className="button pg-danger" disabled={busy} onClick={() => setConfirming(true)}>Delete group</button> : <div className="pg-stack">
          <p><strong>Delete “{group.name}”?</strong> This cannot be undone from the app.</p>
          <div className="pg-actions"><button className="button pg-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Yes, delete group"}</button><button className="button button-outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>
        </div>}
      </div>
    </section>}
  </>;
}

export default function Groups({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Listing | null>(null);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const invites = useGroupInvitations();
  useEffect(() => {
    const controller = new AbortController();
    api<Listing>("/groups", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setLoading(false); setLoadError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setLoadError(message(err)); setLoading(false); } });
    return () => controller.abort();
  }, [revision]);
  // Refresh group membership/deletions without interrupting forms with periodic remounts.
  useEffect(() => {
    function focused() { if (!document.hidden) setRevision((n) => n + 1); }
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, []);
  function reload() { setRevision((n) => n + 1); invites.refresh(); }
  async function create(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ group: Group }>("/groups", { method: "POST", body: JSON.stringify({ ...draft, name: draft.name.trim() }) });
      setDraft(null); setSelectedId(result.group.id); setNotice("Group created. Invite your friends."); reload();
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function respond(id: string, action: "ACCEPT" | "DECLINE") {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      await api(`/groups/invitations/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) });
      setNotice(action === "ACCEPT" ? "You joined the group." : "Invitation declined."); reload();
    } catch (err) { setError(message(err)); invites.refresh(); } finally { setBusy(false); }
  }
  const selected = data?.groups.find((group) => group.id === selectedId);
  const visible = data?.groups.filter((group) => group.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <main className="signed-in-page pg-page">
    <header className="pg-between"><div className="brand"><span className="brand-mark">P</span><span>Paylet</span></div><div className="pg-actions"><button className="button button-outline" disabled={busy} onClick={() => { if (!draft || window.confirm("Discard this unsaved group?")) onBack(); }}>← Dashboard</button><button className="button button-outline" disabled={busy} onClick={reload}>Refresh</button></div></header>
    {error && <p className="pg-error" role="alert">{error}</p>}{notice && <p className="pg-success" role="status">{notice}</p>}
    {loadError && <div className="pg-error" role="alert">{loadError} <button className="button button-outline" onClick={reload}>Retry</button></div>}
    {loading ? <p role="status">Loading groups…</p> : selected && data ? <GroupDetails key={selected.id} group={selected} viewerId={data.viewerId} owner={selected.ownerId === data.viewerId} onChange={reload} onBack={() => setSelectedId(null)}/> : <>
      <section className="pg-hero pg-between"><div><span className="pg-kicker">BETTER TOGETHER</span><h1>Your groups</h1><p className="pg-muted">One place for your people and shared plans.</p></div><button className="button button-green" disabled={busy || !!draft} onClick={() => setDraft({ id: crypto.randomUUID(), name: "" })}>+ Create group</button></section>
      <div className="pg-stats"><div><strong>{data?.groups.length ?? "—"}</strong><span>Your groups</span></div><div><strong>{invites.loading ? "—" : invites.invitations.length}</strong><span>Pending invitations</span></div><div><strong>{data?.groups.filter((group) => group.ownerId === data.viewerId).length ?? "—"}</strong><span>Created by you</span></div></div>
      <section className="pg-panel pg-inbox" aria-label="Group invitations"><div className="pg-between"><h2>Invitations <span className="pg-badge">{invites.invitations.length}</span></h2><span className="pg-muted">Updates every 20 seconds</span></div>
        {invites.error && <p className="pg-error" role="alert">{invites.error} <button className="button button-outline" onClick={invites.refresh}>Retry</button></p>}
        {invites.loading ? <p>Checking invitations…</p> : !invites.error && invites.invitations.length === 0 ? <p className="pg-muted">You’re all caught up. New invitations will appear here.</p> : null}
        {invites.invitations.map((item) => <div className="pg-row pg-invite" key={item.id}><span className="pg-avatar" aria-hidden="true">{initials(item.group.name)}</span><div className="pg-grow"><strong>{item.group.name}</strong><p>{item.group.owner.displayName} (@{item.group.owner.username}) invited you</p></div><div className="pg-actions"><button className="button button-green" disabled={busy} onClick={() => void respond(item.id, "ACCEPT")}>Accept</button><button className="button button-outline" disabled={busy} onClick={() => void respond(item.id, "DECLINE")}>Decline</button></div></div>)}
      </section>
      {draft && <form className="pg-panel pg-stack" onSubmit={create}><h2>A new group</h2><label htmlFor="pg-create">Group name</label><input id="pg-create" placeholder="Weekend plans, Roommates, Dinner…" maxLength={80} required disabled={busy} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/><div className="pg-actions"><button className="button button-green" disabled={busy || !draft.name.trim()}>{busy ? "Creating…" : "Create group"}</button><button type="button" className="button button-outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div></form>}
      <label className="pg-stack" htmlFor="pg-search">Find a group<input id="pg-search" type="search" placeholder="Search your groups" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <section className="pg-grid">{visible.map((group) => <article className="pg-panel pg-card" key={group.id}><div className="pg-between"><span className="pg-avatar pg-avatar-large" aria-hidden="true">{initials(group.name)}</span><span className="pg-tag">{group.ownerId === data?.viewerId ? "Owner" : "Member"}</span></div><h2>{group.name}</h2><p className="pg-muted">{group.members.length} {group.members.length === 1 ? "member" : "members"}</p><div className="pg-avatar-list" aria-hidden="true">{group.members.slice(0, 4).map((member) => <span className="pg-avatar" key={member.id}>{initials(member.user.displayName)}</span>)}{group.members.length > 4 && <span className="pg-avatar">+{group.members.length - 4}</span>}</div><button className="button button-blue" disabled={busy || !!draft} onClick={() => { setSelectedId(group.id); setNotice(""); setError(""); }}>Open group →</button></article>)}</section>
      {!loadError && data && visible.length === 0 && <div className="pg-panel pg-empty"><h2>{search ? "No matching groups" : "Start with your people"}</h2><p className="pg-muted">{search ? "Try a different group name." : "Create a group for two friends or your whole circle."}</p></div>}
    </>}
  </main>;
}
