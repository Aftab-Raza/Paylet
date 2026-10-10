import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import LoanBook from "./LoanBook";
import { ArrowLeft, Check, Plus, RefreshCw, UserPlus } from "lucide-react";
import Modal from "./Modal";
import InvitePaylet from "./InvitePaylet";

type Contact = {
  id: string;
  name: string;
  nickname: string | null;
  notes: string | null;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  id: string;
  name: string;
  nickname: string;
  notes: string;
  version: number;
};

type Props = {
  onBack: () => void;
};

export default function People({ onBack }: Props) {
  const [showInvite, setShowInvite] = useState(false);
    const [selectedContactId, setSelectedContactId] =
    useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    api<{ contacts: Contact[] }>("/contacts", {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;

        setContacts(result.contacts);
        setLoading(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load contacts."
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, [refresh]);

  function reload() {
    setLoading(true);
    setError("");
    setRefresh((value) => value + 1);
  }

  function addContact() {
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      nickname: "",
      notes: "",
      version: 1,
    });

    setEditing(false);
    setError("");
    setNotice("");
  }

  function editContact(contact: Contact) {
    setDraft({
      id: contact.id,
      name: contact.name,
      nickname: contact.nickname ?? "",
      notes: contact.notes ?? "",
      version: contact.version,
    });

    setEditing(true);
    setError("");
    setNotice("");

    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateDraft(
    field: "name" | "nickname" | "notes",
    value: string
  ) {
    setDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const body = {
      name: draft.name,
      nickname: draft.nickname,
      notes: draft.notes,
      ...(editing
        ? { version: draft.version }
        : { id: draft.id }),
    };

    try {
      await api(
        editing ? `/contacts/${draft.id}` : "/contacts",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        }
      );

      setDraft(null);
      setNotice(editing ? "Contact updated." : "Contact added.");
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save contact."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(contact: Contact) {
    const action = contact.isArchived ? "restore" : "archive";

    if (!window.confirm(
      `Do you want to ${action} ${contact.name}?`
    )) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/contacts/${contact.id}/archive`, {
        method: "POST",
        body: JSON.stringify({
          version: contact.version,
          isArchived: !contact.isArchived,
        }),
      });

      setNotice(
        contact.isArchived ? "Contact restored." : "Contact archived."
      );
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update contact."
      );
    } finally {
      setBusy(false);
    }
  }

  const search = query.trim().toLowerCase();

  const visibleContacts = contacts.filter((contact) => {
    if (contact.isArchived !== showArchived) return false;

    return (
      contact.name.toLowerCase().includes(search) ||
      (contact.nickname ?? "").toLowerCase().includes(search)
    );
  });
   if (selectedContactId) {
    return (
      <LoanBook
        key={selectedContactId}
        contactId={selectedContactId}
        onBack={() => {
          setSelectedContactId(null);
          reload();
        }}
      />
    );
  }
  return (
    <main className="signed-in-page">
      <header className="app-header">
        <span className="brand">
          <span className="brand-mark">P</span>
          <span>Paylet</span>
        </span>

        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            if (
              draft &&
              !window.confirm("Leave without saving this contact?")
            ) return;

            onBack();
          }}
        >
          <ArrowLeft size={18} /> Dashboard
        </button>
      </header>

      <section className="dashboard-page">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">YOUR PRIVATE CONTACTS</span>
            <h1>People</h1>
            <p className="form-description">
              Add someone without asking them to create an account.
            </p>
          </div>

          <div className="profile-actions">
          <button className="button button-purple" disabled={busy} onClick={() => setShowInvite(true)}><UserPlus size={18} /> Invite to Paylet</button>
          <button
            type="button"
            className="button button-primary"
            disabled={busy || loading}
            onClick={addContact}
          >
            <Plus size={18} /> Add person
          </button>
          </div>
        </div>

        {error && !draft && (
          <p className="error-message" role="alert">{error}</p>
        )}

        {notice && (
          <p className="google-success" role="status">{notice}</p>
        )}

        {draft && (
          <Modal title={editing ? "Edit contact" : "Add a person"} busy={busy} onClose={() => { setDraft(null); setError(""); }}>
            {error && <p className="error-message" role="alert">{error}</p>}

            <form onSubmit={saveContact}>
              <fieldset disabled={busy}>
                <label htmlFor="contact-name">Name</label>
                <input
                  id="contact-name"
                  data-autofocus
                  placeholder="Uncle or a person’s name"
                  value={draft.name}
                  maxLength={100}
                  onChange={(event) =>
                    updateDraft("name", event.target.value)
                  }
                  required
                />

                <label htmlFor="contact-nickname">
                  Nickname — optional
                </label>
                <input
                  id="contact-nickname"
                  placeholder="Chacha, Mama, Rahul…"
                  value={draft.nickname}
                  maxLength={100}
                  onChange={(event) =>
                    updateDraft("nickname", event.target.value)
                  }
                />

                <label htmlFor="contact-notes">
                  Private note — optional
                </label>
                <textarea
                  id="contact-notes"
                  placeholder="A note to help you identify this person"
                  value={draft.notes}
                  rows={3}
                  maxLength={500}
                  onChange={(event) =>
                    updateDraft("notes", event.target.value)
                  }
                />
                <small>
                  Only you can see this note. {draft.notes.length}/500
                </small>

                <div className="profile-actions">
                  <button
                    type="submit"
                    className="button button-green"
                  >
                    <Check size={18} /> {busy ? "Saving…" : "Save contact"}
                  </button>

                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => { setDraft(null); setError(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          </Modal>
        )}
        {showInvite && <InvitePaylet onClose={() => setShowInvite(false)} />}

        <div className="people-toolbar">
          <div className="people-search">
            <label htmlFor="people-search">Search people</label>
            <input
              id="people-search"
              type="search"
              placeholder="Search by name or nickname"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <label className="people-checkbox">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) =>
                setShowArchived(event.target.checked)
              }
            />
            Show archived
          </label>

          <button
            type="button"
            className="button button-outline"
            disabled={busy || Boolean(draft)}
            onClick={reload}
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>

        {loading ? (
          <p role="status">Loading contacts…</p>
        ) : (
          <>
            <p className="profile-member">
              {visibleContacts.length}{" "}
              {showArchived ? "archived" : "active"} contacts
            </p>

            {visibleContacts.length === 0 && (
              <section className="profile-panel">
                <h2>No contacts found</h2>
                <p>
                  {search
                    ? "Try another name or nickname."
                    : showArchived
                      ? "Archived contacts will appear here."
                      : "Add your first person to get started."}
                </p>
              </section>
            )}

            <div className="people-grid">
              {visibleContacts.map((contact) => (
                <article className="profile-panel" key={contact.id}>
                  <div className="contact-avatar" aria-hidden="true">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  <h2>{contact.name}</h2>

                  {contact.nickname && (
                    <p className="profile-handle">
                      {contact.nickname}
                    </p>
                  )}

                  <span className="contact-badge">
                    {contact.isArchived
                      ? "Archived contact"
                      : "Private contact"}
                  </span>

                  {contact.notes && (
                    <p className="contact-note">{contact.notes}</p>
                  )}

                                    <div className="profile-actions">
                    <button
                      type="button"
                      className="button button-green"
                      disabled={busy || Boolean(draft)}
                      onClick={() => setSelectedContactId(contact.id)}
                    >
                      Money history
                    </button>

                    {!contact.isArchived && (
                      <button
                        type="button"
                        className="button button-blue"
                        disabled={busy || Boolean(draft)}
                        onClick={() => editContact(contact)}
                      >
                        Edit
                      </button>
                    )}

                    <button
                      type="button"
                      className={
                        contact.isArchived
                          ? "button button-green"
                          : "button button-outline"
                      }
                      disabled={busy || Boolean(draft)}
                      onClick={() => void toggleArchive(contact)}
                    >
                      {contact.isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
