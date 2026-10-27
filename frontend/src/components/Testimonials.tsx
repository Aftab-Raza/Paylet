import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, LogIn, MessageSquareQuote, Pencil, Plus, Quote, Send, Star, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import Modal from "./Modal";
import PublicAvatar from "./PublicAvatar";
import "./testimonials.css";

type Testimonial = { id: string; body: string; rating?: number | null; photoConsent?: boolean; createdAt: string; user: { displayName: string; memberSince?: string; avatarUrl?: string | null } };
function ReviewCard({ item }: { item: Testimonial }) {
  const [expanded, setExpanded] = useState(false);
  const long = item.body.length > 220;
  const since = /^\d{4}-\d{2}$/.test(item.user.memberSince ?? "") ? new Date(`${item.user.memberSince}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  return <article className="testimonial-card"><div className="testimonial-card-top"><Quote size={23} aria-hidden="true" />{item.rating ? <span className="review-stars" role="img" aria-label={`${item.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={16} className={value <= item.rating! ? "star-selected" : "star-empty"} fill={value <= item.rating! ? "currentColor" : "none"} aria-hidden="true" />)}</span> : <span className="testimonial-unrated">Not rated yet</span>}</div><blockquote>{long && !expanded ? `${item.body.slice(0, 220)}...` : item.body}</blockquote>{long && <button className="testimonial-read-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "Read more"}</button>}<div className="testimonial-author"><PublicAvatar name={item.user.displayName} url={item.user.avatarUrl} /><div><strong>{item.user.displayName}</strong>{since && <small>User since {since}</small>}</div></div></article>;
}
export default function Testimonials({ user, checking, onLogin, fullPage = false, onChange }: { user: User | null; checking: boolean; onLogin: () => void; fullPage?: boolean; onChange?: () => void }) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [mine, setMine] = useState<Testimonial | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const moreController = useRef<AbortController | null>(null);
  const endpoint = `/testimonials?limit=${fullPage ? 12 : 6}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(""); setMine(null); setMoreError(""); setMoreBusy(false);
      moreController.current?.abort();
      try {
        const [list, own] = await Promise.all([
          api<{ testimonials: Testimonial[]; nextCursor?: string | null }>(endpoint, { signal: controller.signal }),
          user ? api<{ testimonial: Testimonial | null }>("/testimonials/mine", { signal: controller.signal }) : Promise.resolve({ testimonial: null }),
        ]);
        if (!controller.signal.aborted) { setItems(list.testimonials); setMine(own.testimonial); setNextCursor(list.nextCursor ?? null); }
      } catch (err) { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Unable to load testimonials."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [user, refresh, endpoint]);
  async function loadMore() {
    if (moreBusy || !nextCursor) return;
    const controller = new AbortController(); moreController.current = controller;
    setMoreBusy(true); setMoreError("");
    try {
      const result = await api<{ testimonials: Testimonial[]; nextCursor: string | null }>(`${endpoint}&cursor=${encodeURIComponent(nextCursor)}`, { signal: controller.signal });
      if (!controller.signal.aborted) { setItems((previous) => [...previous, ...result.testimonials.filter((item) => !previous.some((old) => old.id === item.id))]); setNextCursor(result.nextCursor); }
    } catch (err) { if (!controller.signal.aborted) setMoreError(err instanceof Error ? err.message : "Unable to load more reviews."); }
    finally { if (!controller.signal.aborted) setMoreBusy(false); }
  }
  async function save(remove = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api("/testimonials/mine", { method: remove ? "DELETE" : "PUT", ...(!remove ? { body: JSON.stringify({ body, rating, consent, photoConsent }) } : {}) });
      setEditing(false); setRemoving(false); setRefresh((value) => value + 1); onChange?.();
      setNotice(remove ? "Your testimonial was removed." : "Your testimonial is now public. Thank you for sharing.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save. Please try again."); }
    finally { setBusy(false); }
  }
  return <section id="testimonials" className="testimonials-section landing-width" aria-labelledby="testimonials-title">
    <div className="testimonials-heading"><div><span className="landing-eyebrow">FROM THE PAYLET COMMUNITY</span><h2 id="testimonials-title">Your money stories.</h2><p>Real experiences, shared by the people using Paylet.</p></div>
      <button className="button button-primary" disabled={checking || (Boolean(user) && (loading || Boolean(loadError)))} onClick={() => {
        if (!user) { onLogin(); return; }
        setBody(mine?.body ?? ""); setRating(mine?.rating ?? 0); setConsent(false); setPhotoConsent(mine?.photoConsent ?? false); setError(""); setNotice(""); setEditing(true);
      }}>{user ? mine ? <Pencil size={18} /> : <Plus size={18} /> : <LogIn size={18} />}{user ? mine ? "Edit your testimonial" : "Write a testimonial" : "Log in to write"}</button>
    </div>
    {notice && <p role="status" className="google-success">{notice}</p>}
    {loading ? <p role="status"><LoaderCircle className="testimonial-spinner" size={18} /> Loading testimonials...</p> : loadError ? <p role="alert">Testimonials are temporarily unavailable. <button className="button button-outline" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p> : items.length ? <div className="testimonials-grid">{items.map((item) => <ReviewCard item={item} key={item.id} />)}</div> : <div className="testimonials-empty"><MessageSquareQuote size={32} /><p>No testimonials yet. Be the first to share your experience.</p></div>}
    {!fullPage && <a className="button button-blue testimonial-view-all" href="/?view=testimonials">View all testimonials <ArrowRight size={17} /></a>}
    {fullPage && nextCursor && !loading && <div className="testimonial-actions"><button className="button button-blue" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy && <LoaderCircle size={17} />}{moreBusy ? "Loading..." : "Load more"}</button></div>}
    {moreError && <p role="alert" className="error-message">{moreError}</p>}
    {editing && user && <Modal title={mine ? "Edit your testimonial" : "Write a testimonial"} busy={busy} onClose={() => setEditing(false)}>
      <form onSubmit={(event) => { event.preventDefault(); if (rating >= 1 && rating <= 5) void save(); }}><fieldset className="testimonial-rating" disabled={busy}><legend>Your rating</legend><div>{[1, 2, 3, 4, 5].map((value) => <label key={value} title={`${value} out of 5 stars`}><input type="radio" name="testimonial-rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} out of 5 stars`} required /><Star size={26} className={value <= rating ? "star-selected" : "star-empty"} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true" /></label>)}</div><span>{rating ? `${rating} out of 5` : "Choose a rating"}</span></fieldset><label htmlFor="testimonial-body">Your experience</label><textarea id="testimonial-body" value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={600} rows={5} required disabled={busy} aria-describedby="testimonial-count" /><p id="testimonial-count" className="testimonial-count">{body.length}/600</p>
        <label className="testimonial-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={busy} /><span>Publish my words, rating, display name ({user.displayName}), and membership month/year publicly. I will not include private financial or contact details.</span></label>
        <label className="testimonial-consent"><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} disabled={busy} /><span>Also show my profile photo with my testimonial. Optional; turn this off anytime by editing your testimonial. To appear beside the user count, use the separate public-photo setting in My profile.</span></label>
        {error && <p role="alert" className="error-message">{error}</p>}<div className="testimonial-actions"><button type="submit" className="button button-primary" disabled={busy || !consent || !rating || body.trim().length < 10}>{busy ? <LoaderCircle size={18} /> : <Send size={18} />}{busy ? "Saving..." : "Publish testimonial"}</button><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>{mine && <button type="button" className="button button-danger" disabled={busy} onClick={() => { setEditing(false); setRemoving(true); }}><Trash2 size={18} /> Delete</button>}</div>
      </form></Modal>}
    {removing && <Modal title="Delete your testimonial?" busy={busy} onClose={() => setRemoving(false)}><p>It will no longer appear on the public landing page.</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="testimonial-actions"><button className="button button-danger" disabled={busy} onClick={() => void save(true)}><Trash2 size={18} />{busy ? "Deleting..." : "Delete testimonial"}</button><button className="button button-outline" disabled={busy} onClick={() => setRemoving(false)}>Keep testimonial</button></div></Modal>}
  </section>;
}
