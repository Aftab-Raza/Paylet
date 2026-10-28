import { useSuccessToast } from "../lib/successToast";
import BrandMark from "./BrandMark";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useGroupInvitations } from "../hooks/useGroupInvitations";
import "./groups.css";
import "./groups-refresh.css";
import GroupBills from "./GroupBills";
import SettlementNotifications from "./SettlementNotifications";
import { ArrowLeft, ArrowUpRight, ChevronDown, Users, UserPlus, Mail, Plus, RefreshCw, Send } from "lucide-react";
import Modal from "./Modal";
import { useHistoryParam } from "../lib/navigation";

type Person = { id: string; username: string; displayName: string; avatarUrl?: string | null };
type Group = { id: string; name: string; ownerId: string; members: { id: string; userId: string | null; contactId: string | null; offline: boolean; user: Person }[] };
type Listing = { viewerId: string; groups: Group[] };
type Sent = { id: string; status: string; recipient: Person };
const message = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please try again.";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function MemberAvatar({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  return <span className="pg-avatar" aria-hidden="true">{person.avatarUrl && !failed ? <img src={person.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : initials(person.displayName)}</span>;
}

function GroupDetails({ group, owner, viewerId, onChange, onBack }: {
  group: Group; owner: boolean; viewerId: string; onChange: () => void; onBack: () => void;
}) {
  const notify = useSuccessToast();
  const [memberMode, setMemberMode] = useState<"username" | "people">("username");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const [sentError, setSentError] = useState("");
  const [sentLoading, setSentLoading] = useState(owner);
  const [revision, setRevision] = useState(0);
  const [contacts, setContacts] = useState<{ id: string; name: string; linkedUser: Person | null; isArchived: boolean }[]>([]);
  const [offlineContactId, setOfflineContactId] = useState("");
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    api<{ invitations: Sent[] }>(`/groups/${group.id}/invitations`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setSent(result.invitations); setSentLoading(false); setSentError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setSentError(message(err)); setSentLoading(false); } });
    return () => controller.abort();
  }, [group.id, owner, revision]);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    api<{ contacts: typeof contacts }>("/contacts", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setContacts(result.contacts); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(message(err)); });
    return () => controller.abort();
  }, [owner]);

  async function addOffline(event: FormEvent) {
    event.preventDefault();
    if (!offlineContactId || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/${group.id}/offline-members`, { method: "POST", body: JSON.stringify({ contactId: offlineContactId }) });
      setOfflineContactId(""); notify("Member added.", { position: "top-left" }); onChange();
    } catch (err) { notify(message(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }

  async function save(event: FormEvent, kind: "rename" | "invite") {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/${group.id}${kind === "invite" ? "/invitations" : ""}`, {
        method: kind === "invite" ? "POST" : "PATCH",
        body: JSON.stringify(kind === "invite" ? { username: username.trim() } : { name: name.trim() }),
      });
      if (kind === "invite") {
        setUsername(""); setRevision((n) => n + 1); notify("Invitation sent.", { position: "top-left" });
      } else { notify("Group name saved.", { position: "top-left" }); onChange(); }
    } catch (err) { notify(message(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }
  async function resend(recipientUsername: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/groups/${group.id}/invitations`, { method: "POST", body: JSON.stringify({ username: recipientUsername }) });
      setRevision((n) => n + 1); notify("Invitation resent.", { position: "top-left" });
    } catch (err) { notify(message(err), { position: "top-left", tone: "error" }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/groups/${group.id}`, { method: "DELETE" });
      notify("Group deleted.", { position: "top-left" }); onBack(); onChange();
    } catch (err) { notify(message(err), { position: "top-left", tone: "error" }); } finally { setBusy(false); }
  }
  return <>
    <button className="button button-outline" disabled={busy} onClick={onBack}>← All groups</button>
    <section className="pg-panel pg-hero">
      <span className="pg-avatar pg-avatar-large" aria-hidden="true">{initials(group.name)}</span>
      <div><span className="pg-kicker">SHARED GROUP</span><h1>{group.name}</h1><p>{group.members.length} members · {owner ? "Created by you" : "You are a member"}</p></div>
    </section>
    {error && <p className="pg-error" role="alert">{error}</p>}
    <section className="pg-panel pg-member-panel">
      <button className="pg-member-toggle" aria-expanded={membersOpen} aria-controls="pg-member-list" onClick={() => setMembersOpen(!membersOpen)}>
        <span className="pg-avatar-list" aria-hidden="true">{group.members.slice(0, 4).map((member) => <MemberAvatar key={member.id} person={member.user}/>)}{group.members.length > 4 && <span className="pg-avatar">+{group.members.length - 4}</span>}</span>
        <span>People in this group <small>{group.members.length} members · {membersOpen ? "Hide" : "View"} members</small></span><ChevronDown size={20} className={membersOpen ? "pg-chevron-open" : ""}/>
      </button>
      <div id="pg-member-list" hidden={!membersOpen}>
        {group.members.map((member) => <div className="pg-row" key={member.id}>
          <MemberAvatar person={member.user}/>
          <div className="pg-grow"><strong>{member.user.displayName}{member.userId === viewerId ? " (You)" : ""}</strong><p>{member.offline ? "Not on Paylet yet" : `@${member.user.username}`}</p></div>
          <span className="pg-tag">{member.userId === group.ownerId ? "Owner" : member.offline ? "Offline" : "Member"}</span>
        </div>)}
        <p className="pg-muted">Your personal expenses and private lending records stay private.</p>
      </div>
    </section>
    <GroupBills key={group.id} groupId={group.id} members={group.members} viewerId={viewerId} ownerId={group.ownerId}/>
    {owner && <section className="pg-panel pg-stack pg-add-member">
      <div className="pg-between"><h2><UserPlus size={21}/> Add member</h2><div className="pg-member-tabs" role="group" aria-label="Add member method"><button className="button button-outline" aria-pressed={memberMode === "username"} onClick={() => setMemberMode("username")}>Via username</button><button className="button button-outline" aria-pressed={memberMode === "people"} onClick={() => setMemberMode("people")}>From private People</button></div></div>
      {memberMode === "people" && <>
        <label className="pg-stack">Search private People<input type="search" placeholder="Search by name" value={peopleSearch} onChange={(event) => { setPeopleSearch(event.target.value); setOfflineContactId(""); }}/></label>
        <form className="pg-stack" onSubmit={(event) => void addOffline(event)}>
          <label htmlFor="pg-offline-contact">Person</label>
          <select id="pg-offline-contact" value={offlineContactId} onChange={(event) => setOfflineContactId(event.target.value)} disabled={busy} required>
            <option value="">Choose a person</option>
            {contacts.filter((contact) => contact.name.toLocaleLowerCase().includes(peopleSearch.trim().toLocaleLowerCase()) && !contact.isArchived && !contact.linkedUser && !group.members.some((member) => member.contactId === contact.id)).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </select>
          <button className="button button-green" disabled={busy || !offlineContactId}><Plus size={18} /> Add to group</button>
        </form>
      </>}
      {memberMode === "username" && <>
        <form className="pg-stack" onSubmit={(event) => void save(event, "invite")}>
          <label htmlFor="pg-username">Exact Paylet username</label>
          <input id="pg-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your friend’s username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} required disabled={busy}/>
          <button className="button button-green" disabled={busy || !username.trim()}><Send size={18} /> Send invitation</button>
        </form>
      </>}
        <div className="pg-between"><h3>Invitation status</h3><button className="button button-outline" disabled={busy || sentLoading} onClick={() => { setSentLoading(true); setRevision((n) => n + 1); }}>{sentLoading ? "Refreshing…" : "Refresh invitations"}</button></div>
        <div className="pg-invitation-scroll" role="region" aria-label="Sent invitations" tabIndex={0}>
        {sentError ? <p className="pg-error" role="alert">{sentError}</p> : sentLoading ? <p role="status">Loading invitations…</p> : sent.length === 0 ? <p className="pg-muted">No invitations sent yet.</p> : sent.map((item) => <div className="pg-row" key={item.id}><div className="pg-grow"><strong>{item.recipient.displayName}</strong><p>@{item.recipient.username}</p></div><span className={`pg-tag pg-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span>{item.status !== "ACCEPTED" && !group.members.some((member) => member.userId === item.recipient.id) && <button className="button button-outline" disabled={busy} onClick={() => void resend(item.recipient.username)}>Resend</button>}</div>)}
        </div>
      </section>}
    {owner && <section className="pg-panel pg-stack pg-settings-card"><button className="pg-member-toggle" aria-expanded={settingsOpen} aria-controls="pg-settings-content" onClick={() => setSettingsOpen(!settingsOpen)}><span>Group settings</span><ChevronDown size={20} className={settingsOpen ? "pg-chevron-open" : ""}/></button>
      <div id="pg-settings-content" className="pg-stack" hidden={!settingsOpen}>
      <form className="pg-inline" onSubmit={(event) => void save(event, "rename")}>
        <div className="pg-grow"><label htmlFor="pg-name">Group name</label><input id="pg-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy}/></div>
        <button className="button button-green" disabled={busy || !name.trim()}>Save name</button>
      </form>
      <div className="pg-danger-zone"><button className="button pg-danger" disabled={busy} onClick={() => setConfirming(true)}>Delete group</button></div>
      </div>
    </section>}
    {confirming && <Modal title="Delete group?" busy={busy} onClose={() => setConfirming(false)}><p>Are you sure you want to delete “{group.name}”? History is retained. Resolve active bills and repayments first.</p><div className="pg-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button className="button pg-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Yes, delete group"}</button></div></Modal>}
  </>;
}

export default function Groups({ onBack }: { onBack: () => void; initialGroupId?: string | null }) {
  const [data, setData] = useState<Listing | null>(null);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useHistoryParam("group");
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
  return <main className="signed-in-page pg-page groups-refresh">
    <header className="pg-between"><div className="brand"><BrandMark /><span>Paylet.</span></div><div className="pg-actions"><ThemeToggle /><button className="button button-outline" disabled={busy} onClick={() => { if (!draft || window.confirm("Discard this unsaved group?")) onBack(); }}><ArrowLeft size={18} /> Dashboard</button><button className="button button-outline" disabled={busy} onClick={reload}><RefreshCw size={18} /> Refresh</button></div></header>
    <SettlementNotifications disabled={busy || !!draft} onOpen={(groupId) => { setSelectedId(groupId); reload(); }}/>
    {error && !draft && <p className="pg-error" role="alert">{error}</p>}{notice && <p className="pg-success" role="status">{notice}</p>}
    {loadError && <div className="pg-error" role="alert">{loadError} <button className="button button-outline" onClick={reload}>Retry</button></div>}
    {loading ? <p role="status">Loading groups…</p> : selected && data ? <GroupDetails key={selected.id} group={selected} viewerId={data.viewerId} owner={selected.ownerId === data.viewerId} onChange={reload} onBack={() => setSelectedId(null)}/> : <>
      <section className="pg-hero"><div><span className="pg-kicker">BETTER TOGETHER</span><h1>Your groups</h1><p className="pg-muted">One place for your people and shared plans.</p></div></section>
      <div className="pg-workspace">
        <section className="pg-panel pg-directory" aria-label="Your group list">
          <label className="pg-stack" htmlFor="pg-search">Find a group<input id="pg-search" type="search" placeholder="Search your groups" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
          <div className="pg-group-list">{visible.map((group) => <article className="pg-list-item" key={group.id}>
            <span className="pg-avatar pg-avatar-large" aria-hidden="true">{initials(group.name)}</span>
            <div className="pg-list-copy"><h2>{group.name}</h2><p>{group.members.length} {group.members.length === 1 ? "member" : "members"} <span className={`pg-tag ${group.ownerId === data?.viewerId ? "pg-owner" : ""}`}>{group.ownerId === data?.viewerId ? "Owner" : "Member"}</span></p></div>
            <button className="button button-outline pg-open-group" aria-label={`Open group ${group.name}`} disabled={busy || !!draft} onClick={() => { setSelectedId(group.id); setNotice(""); setError(""); }}><ArrowUpRight size={21}/></button>
          </article>)}</div>
          {!loadError && data && visible.length === 0 && <div className="pg-empty"><Users size={32}/><h2>{search ? "No matching groups" : "Start with your people"}</h2><p className="pg-muted">{search ? "Try a different group name." : "Create a group for two friends or your whole circle."}</p></div>}
        </section>
        <aside className="pg-stack pg-overview-side" aria-label="Group overview and invitations">
          <button className="button button-primary" disabled={busy || !!draft} onClick={() => setDraft({ id: crypto.randomUUID(), name: "" })}><Plus size={18} /> Create group</button>
      <div className="pg-stats"><div><strong>{data?.groups.length ?? "—"}</strong><span>Your groups</span></div><div><strong>{invites.loading ? "—" : invites.invitations.length}</strong><span>Pending invitations</span></div><div><strong>{data?.groups.filter((group) => group.ownerId === data.viewerId).length ?? "—"}</strong><span>Created by you</span></div></div>
      <section className="pg-panel pg-inbox" aria-label="Group invitations"><div className="pg-between"><h2><Mail size={20}/> Invitations <span className="pg-badge">{invites.invitations.length}</span></h2><span className="pg-muted">Updates every 20 seconds</span></div>
        {invites.error && <p className="pg-error" role="alert">{invites.error} <button className="button button-outline" onClick={invites.refresh}>Retry</button></p>}
        {invites.loading ? <p>Checking invitations…</p> : !invites.error && invites.invitations.length === 0 ? <p className="pg-muted">You’re all caught up. New invitations will appear here.</p> : null}
        {invites.invitations.map((item) => <div className="pg-row pg-invite" key={item.id}><span className="pg-avatar" aria-hidden="true">{initials(item.group.name)}</span><div className="pg-grow"><strong>{item.group.name}</strong><p>{item.group.owner.displayName} (@{item.group.owner.username}) invited you</p></div><div className="pg-actions"><button className="button button-green" disabled={busy} onClick={() => void respond(item.id, "ACCEPT")}>Accept</button><button className="button button-outline" disabled={busy} onClick={() => void respond(item.id, "DECLINE")}>Decline</button></div></div>)}
      </section>
        </aside>
      </div>
      {draft && <Modal title="Create a group" busy={busy} onClose={() => { setDraft(null); setError(""); }}>
        {error && <p className="pg-error" role="alert">{error}</p>}
        <form onSubmit={create}><label htmlFor="pg-create">Group name</label><input id="pg-create" data-autofocus placeholder="Weekend plans, Roommates, Dinner…" maxLength={80} required disabled={busy} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/><div className="profile-actions"><button className="button button-green" disabled={busy || !draft.name.trim()}><Plus size={18} />{busy ? "Creating…" : "Create group"}</button><button type="button" className="button button-outline" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</button></div></form>
      </Modal>}
    </>}
  </main>;
}
