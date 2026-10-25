import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import "./ai-quick-add.css";
import ThemeToggle from "./ThemeToggle";
import { ArrowLeft, Camera, Check, CheckCircle2, FileImage, ImagePlus, LoaderCircle, Pencil, ReceiptText, ScanLine, Sparkles, Trash2, Type, Wallet } from "lucide-react";
import { useNavigationGuard } from "../lib/navigation";

type Intent = "EXPENSE" | "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_PAID";
type Contact = { id: string; name: string; nickname: string | null; isArchived: boolean; version: number };
type Options = { categories: string[]; currencies: string[] };
type Preview = { draft: { intent: Intent | "CLARIFY" | "UNSUPPORTED"; amount: string | null; currency: string;
  date: string; purpose: string | null; category: string; contactName: string | null; merchantName?: string | null; questions: string[]; defaultsUsed: string[] }; matchedContactIds: string[] };
type Draft = { id: string; intent: Intent; amount: string; currency: string; date: string; purpose: string; category: string; contactId: string; newName: string; newContactId: string };
type Payload = { id: string; intent: Intent; amount: string; currency: string; date: string; purpose: string; category: string;
  contact: { mode: "existing"; id: string; version: number } | { mode: "new"; id: string; name: string } | null };
type Receipt = { id: string; type: "EXPENSE" | "LEDGER"; contactId: string | null; alreadySaved: boolean };
const labels: Record<Intent, string> = { EXPENSE: "Personal expense", LENT: "I lent money", BORROWED: "I borrowed money",
  REPAYMENT_RECEIVED: "They repaid me", REPAYMENT_PAID: "I repaid them" };
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed. Please try again."; }
function errorStatus(error: unknown) { return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 0; }

export default function AiQuickAdd({ onBack }: { onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ contacts: Contact[]; options: Options } | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "photo">("text");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoNotes, setPhotoNotes] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Payload | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  useNavigationGuard(() => {
    if (pending) { window.alert("Confirm the save result with Retry same entry before leaving this page."); return false; }
    return !(text || photo || draft) || window.confirm("Leave and discard this unsaved entry?");
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<{ contacts: Contact[] }>("/contacts", { signal: controller.signal }), api<Options>("/expenses/options", { signal: controller.signal })])
      .then(([people, options]) => { if (!controller.signal.aborted) { setLoaded({ contacts: people.contacts, options }); setLoadError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) setLoadError(message(err)); });
    return () => controller.abort();
  }, [loadKey]);
  useEffect(() => {
    if (!pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [pending]);

  useEffect(() => {
    return () => { if (photo) URL.revokeObjectURL(photo.url); };
  }, [photo]);
  function choosePhoto(file: File | undefined) {
    setPreview(null); setDraft(null); setReviewed(false); setError("");
    if (!file) { setPhoto(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 6 * 1024 * 1024) {
      setPhoto(null); setPhotoKey((value) => value + 1); setError("Choose a JPG, PNG or WebP photo up to 6 MB."); return;
    }
    setPhoto({ file, url: URL.createObjectURL(file) });
  }
  function switchInput(mode: "text" | "photo") {
    setInputMode(mode); setPreview(null); setDraft(null); setReviewed(false); setError(""); setReceipt(null);
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setReviewed(false);
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || pending) return;
    if (inputMode === "photo" && !photo) { setError("Choose a bill photo first."); return; }
    inFlight.current = true; setBusy(true); setError(""); setDraft(null); setPreview(null); setReceipt(null); setReviewed(false);
    try {
      let result: Preview;
      if (inputMode === "photo" && photo) {
        const form = new FormData(); form.append("bill", photo.file); form.append("text", photoNotes);
        result = await api<Preview>("/ai/receipt-preview", { method: "POST", body: form });
      } else {
        result = await api<Preview>("/ai/preview", { method: "POST", body: JSON.stringify({ text }) });
      }
      if (!mounted.current) return;
      setPreview(result);
      if (result.draft.intent !== "CLARIFY" && result.draft.intent !== "UNSUPPORTED") {
        setDraft({ id: crypto.randomUUID(), intent: result.draft.intent, amount: result.draft.amount ?? "", currency: result.draft.currency,
          date: result.draft.date, purpose: result.draft.purpose ?? result.draft.merchantName ?? "", category: result.draft.category,
          contactId: result.matchedContactIds.length === 1 ? result.matchedContactIds[0] : "", newName: result.draft.contactName ?? "", newContactId: crypto.randomUUID() });
      }
    } catch (err) { if (mounted.current) setError(message(err)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(payload: Payload) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setPending(payload);
    try {
      const result = await api<{ receipt: Receipt }>("/ai/confirm", { method: "POST", body: JSON.stringify(payload) });
      if (!mounted.current) return;
      setReceipt(result.receipt); setPhoto(null); setPhotoNotes(""); setPhotoKey((value) => value + 1); setPending(null); setDraft(null); setPreview(null); setText(""); setReviewed(false);
      setLoadKey((value) => value + 1);
    } catch (err) {
      if (!mounted.current) return;
      const status = errorStatus(err);
      if ([400, 401, 403, 404, 409, 422].includes(status)) {
        setPending(null); setReviewed(false); setError(message(err));
        setLoadKey((value) => value + 1);
      } else {
        setError(`${message(err)} We could not confirm the save result. Use Retry same entry below; it will not create a duplicate. Do not create this entry again in another tab.`);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !loaded || !reviewed || pending) return;
    const person = loaded.contacts.find((contact) => contact.id === draft.contactId);
    const contact: Payload["contact"] = draft.intent === "EXPENSE" ? null : draft.contactId === "new"
      ? { mode: "new", id: draft.newContactId, name: draft.newName }
      : person ? { mode: "existing", id: person.id, version: person.version } : null;
    if (draft.intent !== "EXPENSE" && !contact) { setError("Choose a person first."); return; }
    void save({ id: draft.id, intent: draft.intent, amount: draft.amount, currency: draft.currency, date: draft.date,
      purpose: draft.purpose, category: draft.category, contact });
  }
  const repayment = draft?.intent === "REPAYMENT_RECEIVED" || draft?.intent === "REPAYMENT_PAID";
  const person = loaded?.contacts.find((contact) => contact.id === draft?.contactId);
  const canCreate = draft?.intent === "LENT" || draft?.intent === "BORROWED";
  const locked = busy || Boolean(pending);
  const formattedDate = draft && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && !Number.isNaN(Date.parse(draft.date))
    ? new Intl.DateTimeFormat("en", { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${draft.date}T00:00:00Z`)) : "Choose a date";

  return <main className="pqa">
    <header className="pqa-header"><div><span className="pqa-kicker">PAYLET / AI QUICK ADD</span><h1>Add it in your own words.</h1><p>One expense, loan or repayment. You stay in control.</p></div>
      <div className="header-theme-actions"><ThemeToggle /><button type="button" className="pqa-btn pqa-outline" onClick={onBack} disabled={locked}><ArrowLeft size={18} /> Back to dashboard</button></div></header>
    <div className="pqa-steps" aria-label="Entry steps"><span aria-current={!draft && !receipt ? "step" : undefined}><Type size={16} /> 1. Describe</span><span aria-current={draft ? "step" : undefined}><Pencil size={16} /> 2. Review</span><span aria-current={receipt ? "step" : undefined}><CheckCircle2 size={16} /> 3. Save</span></div>
    {loadError && <div className="pqa-error" role="alert">{loadError} <button className="pqa-btn pqa-outline" onClick={() => setLoadKey((value) => value + 1)}>Reload options</button></div>}
    {error && <div className="pqa-error" role="alert">{error}</div>}
    {receipt && <div className="pqa-success" role="status">{receipt.alreadySaved ? "This entry was already saved. No duplicate was added." : "Saved successfully."} {receipt.type === "EXPENSE" ? "Find it in expenses and the report for its date." : "Find it in People. The person's totals and dashboard lending totals have been updated."}</div>}
    {pending && <section className="pqa-card"><h2>Confirming your save</h2><p>Your reviewed entry is locked until its save is confirmed. Retry sends the same entry ID.</p><button className="pqa-btn pqa-green" type="button" disabled={busy} onClick={() => void save(pending)}>{busy ? "Saving…" : "Retry same entry"}</button></section>}
    {!loaded && !loadError && <p role="status">Loading your contacts and currencies…</p>}
    <div className="pqa-layout"><section className="pqa-card">
      <div className="pqa-title-row"><Sparkles size={22} /><h2>What happened?</h2></div><p className="pqa-muted">Write naturally in English or Hinglish, or use a bill photo.</p>
      <div className="pqa-input-modes" role="group" aria-label="Input method"><button type="button" aria-pressed={inputMode === "text"} disabled={locked} onClick={() => switchInput("text")}><Type size={18} /> Type an entry</button><button type="button" aria-pressed={inputMode === "photo"} disabled={locked} onClick={() => switchInput("photo")}><ScanLine size={18} /> Scan a bill</button></div>
      <form onSubmit={(event) => void prepare(event)}>
        {inputMode === "text" ? <>
        <label htmlFor="ai-text">Your entry</label>
        <textarea id="ai-text" required minLength={3} maxLength={2000} rows={6} value={text} disabled={locked} onChange={(event) => { setText(event.target.value); setPreview(null); setDraft(null); setReviewed(false); }} placeholder="I lent Uncle 250 rupees for groceries today" />
        </> : <>
          <div className="pqa-upload-actions"><button type="button" className="button button-blue" disabled={locked} onClick={() => cameraRef.current?.click()}><Camera size={28} /> Scan with camera</button><button type="button" className="button button-outline" disabled={locked} onClick={() => uploadRef.current?.click()}><ImagePlus size={28} /> Upload photo</button><p className="pqa-upload-hint">JPG, PNG or WebP · Up to 6 MB · One bill per scan</p></div><input ref={uploadRef} key={photoKey} className="pqa-hidden-input" aria-label="Bill photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={(event) => choosePhoto(event.target.files?.[0])} /><input ref={cameraRef} key={`camera-${photoKey}`} className="pqa-hidden-input" aria-label="Camera photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked} onChange={(event) => choosePhoto(event.target.files?.[0])} />
          {photo && <><img src={photo.url} alt="Selected bill to scan" className="pqa-receipt-photo" /><p className="pqa-muted">{photo.file.name}</p><button type="button" className="pqa-btn pqa-outline" disabled={locked} onClick={() => { choosePhoto(undefined); setPhotoKey((value) => value + 1); }}><Trash2 size={17} /> Remove photo</button></>}
          <label>Notes (optional)<textarea maxLength={2000} rows={2} value={photoNotes} disabled={locked} onChange={(event) => { setPhotoNotes(event.target.value); setPreview(null); setDraft(null); setReviewed(false); }} placeholder="For example: the currency is INR" /></label>
          <p className="pqa-note">This prepares one personal expense using the bill's final total. For shared bills, use Groups. Confirm only spending you actually paid.</p>
        </>}
        <p className="pqa-muted">{inputMode === "photo" ? "The selected bill image, notes and date/currency context are sent to Groq when you scan. Paylet does not keep the photo after processing." : "Only this text and date/currency context are sent to Groq."} Your saved contact list and financial history are not sent.</p>
        <button className="pqa-btn pqa-primary" type="submit" disabled={locked || !loaded || (inputMode === "photo" && !photo)}>{busy && !pending ? <LoaderCircle size={18} className="pqa-spinner" /> : <Sparkles size={18} />}{busy && !pending ? "Preparing preview..." : inputMode === "photo" ? "Scan and review" : "Review with AI"}</button>
      </form>
      {inputMode === "text" && <div className="pqa-examples"><span className="pqa-muted">Try an example</span>{["I spent 200 rupees on lunch today", "Maine Uncle ko 250 rupees udhaar diye groceries ke liye", "Uncle returned 200 rupees of the money I lent him today"].map((example) => <button type="button" key={example} disabled={locked} onClick={() => { setText(example); setPreview(null); setDraft(null); setReviewed(false); }}>{example}</button>)}</div>}
    </section>
    <section className="pqa-card" aria-live="polite" id="ai-review">
      <div className="pqa-title-row"><ReceiptText size={22} /><h2>Review your entry</h2></div>
      {!preview && !draft && <div className="pqa-empty-review">{busy ? <LoaderCircle size={38} className="pqa-spinner" /> : <FileImage size={42} />}<h3>{busy ? "Reading your entry..." : "Your next entry starts here"}</h3><p>{busy ? "Preparing the details for you to check." : "Add a description or a bill photo. Nothing is saved until you review and confirm."}</p></div>}
      {preview && <>
        {preview.draft.merchantName && <p><strong>Merchant detected:</strong> {preview.draft.merchantName}<br /><small>The merchant name prefills Purpose. Keep it there to include it in your saved expense, or edit/clear it.</small></p>}
        {preview.draft.questions.length > 0 && <div className="pqa-note"><ul>{preview.draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
        {preview.draft.intent === "CLARIFY" && <p>Add the missing details to your text or photo notes, or choose a clearer photo, then prepare a new preview.</p>}
        {preview.draft.intent === "UNSUPPORTED" && <p>This entry is outside Quick Add. Use Groups for shared expenses or the relevant dashboard screen.</p>}
        {preview.draft.defaultsUsed.length > 0 && draft && <p className="pqa-muted">Defaults used: {preview.draft.defaultsUsed.join("; ")}. Check these below.</p>}
      </>}
      {draft && loaded && <><div className="pqa-review-amount"><Wallet size={23} /> {draft.currency} {draft.amount || "0"}</div><div className="pqa-review-tools"><button type="button" className="pqa-btn pqa-blue" disabled={locked} onClick={() => document.querySelector<HTMLSelectElement>("#ai-review select")?.focus()}><Pencil size={16} /> Edit details</button><button type="button" className="pqa-btn pqa-outline" disabled={locked} onClick={() => { setDraft(null); setPreview(null); setReviewed(false); }}><Trash2 size={16} /> Remove draft</button></div><form onSubmit={confirm}>
        <fieldset disabled={locked} className="pqa-fields">
          <label>Entry type<select value={draft.intent} onChange={(event) => { change("intent", event.target.value as Intent); if (draft.contactId === "new") change("contactId", ""); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {draft.intent !== "EXPENSE" && <>
            <label>Person<select required value={draft.contactId} onChange={(event) => change("contactId", event.target.value)}>
              <option value="">Choose a person</option>
              {loaded.contacts.map((contact) => <option key={contact.id} value={contact.id} disabled={contact.isArchived && !repayment}>{contact.name}{contact.nickname ? ` (${contact.nickname})` : ""}{contact.isArchived ? " · archived" : ""}{preview?.matchedContactIds.includes(contact.id) ? " · name match" : ""}</option>)}
              {canCreate && <option value="new">+ Create a private contact</option>}
            </select></label>
            {preview && preview.matchedContactIds.length > 1 && <p className="pqa-note">Several people match that name. Choose the correct person above.</p>}
            {draft.contactId === "new" && canCreate && <label>New contact name<input required maxLength={100} value={draft.newName} onChange={(event) => change("newName", event.target.value)} /><small>This creates a private contact when you save, not a login account or invitation.</small></label>}
            {person?.isArchived && !repayment && <p className="pqa-error">Restore this person in People before adding another loan.</p>}
          </>}
          <div className="pqa-row"><label>Amount<input required inputMode="decimal" pattern="[0-9]{1,12}([.][0-9]{1,4})?" title="A positive amount without commas" value={draft.amount} onChange={(event) => change("amount", event.target.value)} /></label>
            <label>Currency<select value={draft.currency} required onChange={(event) => change("currency", event.target.value)}>{!loaded.options.currencies.includes(draft.currency) && <option value={draft.currency}>{draft.currency} — choose a supported currency</option>}{loaded.options.currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div>
          <label>Date<input required type="date" min="1900-01-01" max="2199-12-31" value={draft.date} onChange={(event) => change("date", event.target.value)} /><small>{formattedDate}</small></label>
          <label>Purpose (optional)<input maxLength={200} value={draft.purpose} onChange={(event) => change("purpose", event.target.value)} /></label>
          {draft.intent === "EXPENSE" && <label>Category<select value={draft.category} onChange={(event) => change("category", event.target.value)}>{loaded.options.categories.map((category) => <option key={category}>{category}</option>)}</select></label>}
          <div className="pqa-note">{draft.intent === "EXPENSE" ? "Adds to your personal spending for this date." : draft.intent === "LENT" ? "Increases the amount this person owes you." : draft.intent === "BORROWED" ? "Increases the amount you owe this person." : draft.intent === "REPAYMENT_RECEIVED" ? "Reduces this person's total owed to you. It is not income or a personal expense." : "Reduces your total owed to this person. It is not counted again as spending."}</div>
          <label className="pqa-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} required /><span>I checked the type, person, amount, currency, purpose and date.{draft.contactId === "new" ? " Create this private contact with the entry." : ""}</span></label>
          <button type="submit" className="pqa-btn pqa-green" disabled={!reviewed || (draft.intent !== "EXPENSE" && (!draft.contactId || Boolean(person?.isArchived && !repayment)))}><Check size={18} /> Confirm and save</button>
        </fieldset>
        <p className="pqa-muted">Loan and repayment entries cannot be edited after saving. Delete and recreate an incorrect entry from People.</p>
      </form></>}
    </section></div>
  </main>;
}
