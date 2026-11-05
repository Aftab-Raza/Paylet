import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../lib/api";

type Props = { value: string; categories: string[]; onChange: (name: string) => void; onAdded: (name: string) => void; onEditingChange: (editing: boolean) => void; onSavingChange: (saving: boolean) => void };
export default function ExpenseCategorySelect({ value, categories, onChange, onAdded, onEditingChange, onSavingChange }: Props) {
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const select = useRef<HTMLSelectElement>(null);
  function close() { setName(null); setError(""); onEditingChange(false); requestAnimationFrame(() => select.current?.focus()); }
  async function save() {
    if (saving) return;
    const cleaned = (name ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!cleaned || cleaned.length > 40) { setError("Enter a name using 1–40 characters."); return; }
    const existing = categories.find(category => category.normalize("NFKC").toLocaleLowerCase("en-US") === cleaned.toLocaleLowerCase("en-US"));
    if (existing) { onChange(existing); close(); setNotice(`${existing} already exists and is selected.`); return; }
    setSaving(true); onSavingChange(true); setError("");
    try {
      const result = await api<{ category: string }>("/expenses/categories", { method: "POST", body: JSON.stringify({ name: cleaned }) });
      onAdded(result.category); onChange(result.category); close(); setNotice(`${result.category} is ready to use.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save the category. Please retry."); }
    finally { setSaving(false); onSavingChange(false); }
  }
  return <div className="expense-category-field">
    <label htmlFor="expense-category">Category</label>
    <select ref={select} id="expense-category" value={value} disabled={name !== null} onChange={event => { onChange(event.target.value); setNotice(""); }}>
      {[...new Set([value, ...categories])].map(category => <option key={category} value={category}>{category}</option>)}
    </select>
    {name === null ? <button className="category-add-link" type="button" onClick={() => { setName(""); setNotice(""); onEditingChange(true); }}><Plus size={15} aria-hidden="true"/>Add category</button> : <div className="category-create">
      <label htmlFor="new-expense-category">New category name</label>
      <input id="new-expense-category" autoFocus value={name} maxLength={40} placeholder="e.g. Hostel fees" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(); } }}/>
      <p className="profile-member">Only your account can reuse this category.</p>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="category-create-actions"><button className="button button-green" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save category"}</button><button className="button button-danger" type="button" onClick={close} disabled={saving}>Cancel category</button></div>
    </div>}
    {notice && <p className="profile-member" role="status">{notice}</p>}
  </div>;
}
