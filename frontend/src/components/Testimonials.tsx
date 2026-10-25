import { useEffect, useState } from "react";
import { LoaderCircle, LogIn, MessageSquareQuote, Pencil, Plus, Quote, Send, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import Modal from "./Modal";
import "./testimonials.css";

type Testimonial = { id: string; body: string; createdAt: string; user: { displayName: string } };
export default function Testimonials({ user, checking, onLogin }: { user: User | null; checking: boolean; onLogin: () => void }) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [mine, setMine] = useState<Testimonial | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(""); setMine(null);
      try {
        const [list, own] = await Promise.all([
          api<{ testimonials: Testimonial[] }>("/testimonials", { signal: controller.signal }),
          user ? api<{ testimonial: Testimonial | null }>("/testimonials/mine", { signal: controller.signal }) : Promise.resolve({ testimonial: null }),
        ]);
        if (!controller.signal.aborted) { setItems(list.testimonials); setMine(own.testimonial); }
      } catch (err) { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Unable to load testimonials."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [user, refresh]);
  async function save(remove = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api("/testimonials/mine", { method: remove ? "DELETE" : "PUT", ...(!remove ? { body: JSON.stringify({ body, consent }) } : {}) });
      setEditing(false); setRemoving(false); setRefresh((value) => value + 1);
      setNotice(remove ? "Your testimonial was removed." : "Your testimonial is now public. Thank you for sharing.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save. Please try again."); }
    finally { setBusy(false); }
  }
  return <section id="testimonials" className="testimonials-section landing-width" aria-labelledby="testimonials-title">
    <div className="testimonials-heading"><div><span className="landing-eyebrow">FROM THE PAYLET COMMUNITY</span><h2 id="testimonials-title">Your money stories.</h2><p>Real experiences, shared by the people using Paylet.</p></div>
      <button className="button button-primary" disabled={checking || (Boolean(user) && (loading || Boolean(loadError)))} onClick={() => {
        if (!user) { onLogin(); return; }
        setBody(mine?.body ?? ""); setConsent(false); setError(""); setNotice(""); setEditing(true);
      }}>{user ? mine ? <Pencil size={18} /> : <Plus size={18} /> : <LogIn size={18} />}{user ? mine ? "Edit your testimonial" : "Write a testimonial" : "Log in to write"}</button>
    </div>
    {notice && <p role="status" className="google-success">{notice}</p>}
    {loading ? <p role="status"><LoaderCircle className="testimonial-spinner" size={18} /> Loading testimonials...</p> : loadError ? <p role="alert">Testimonials are temporarily unavailable. <button className="button button-outline" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p> : items.length ? <div className="testimonials-grid">{items.map((item) => <article className="testimonial-card" key={item.id}><Quote size={25} aria-hidden="true" /><blockquote>{item.body}</blockquote><div className="testimonial-author"><span aria-hidden="true">{item.user.displayName.slice(0, 1).toUpperCase()}</span><strong>{item.user.displayName}</strong></div></article>)}</div> : <div className="testimonials-empty"><MessageSquareQuote size={32} /><p>No testimonials yet. Be the first to share your experience.</p></div>}
    {editing && user && <Modal title={mine ? "Edit your testimonial" : "Write a testimonial"} busy={busy} onClose={() => setEditing(false)}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}><label htmlFor="testimonial-body">Your experience</label><textarea id="testimonial-body" value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={600} rows={5} required disabled={busy} aria-describedby="testimonial-count" /><p id="testimonial-count" className="testimonial-count">{body.length}/600</p>
        <label className="testimonial-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={busy} /><span>Publish my words and display name ({user.displayName}) on the public landing page. I will not include private financial or contact details.</span></label>
        {error && <p role="alert" className="error-message">{error}</p>}<div className="testimonial-actions"><button type="submit" className="button button-primary" disabled={busy || !consent || body.trim().length < 10}>{busy ? <LoaderCircle size={18} /> : <Send size={18} />}{busy ? "Saving..." : "Publish testimonial"}</button>{mine && <button type="button" className="button button-danger" disabled={busy} onClick={() => { setEditing(false); setRemoving(true); }}><Trash2 size={18} /> Delete</button>}</div>
      </form></Modal>}
    {removing && <Modal title="Delete your testimonial?" busy={busy} onClose={() => setRemoving(false)}><p>It will no longer appear on the public landing page.</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="testimonial-actions"><button className="button button-danger" disabled={busy} onClick={() => void save(true)}><Trash2 size={18} />{busy ? "Deleting..." : "Delete testimonial"}</button><button className="button button-outline" disabled={busy} onClick={() => setRemoving(false)}>Keep testimonial</button></div></Modal>}
  </section>;
}
