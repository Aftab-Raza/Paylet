import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, Send } from "lucide-react";
import { api } from "../lib/api";

export default function PasswordRecovery({ reset, onLogin, onForgot }: { reset: boolean; onLogin: () => void; onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (reset && password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ message: string }>(reset ? "/auth/reset-password" : "/auth/forgot-password", { method: "POST", body: JSON.stringify(reset ? { token, password } : { email }) });
      setNotice(result.message); setPassword(""); setConfirmation("");
      if (reset) history.replaceState(null, "", "?view=reset");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to complete this request."); }
    finally { setBusy(false); }
  }
  return <main className="recovery-page"><a className="brand" href="/"><span className="brand-mark">P</span><span>Paylet</span></a><section className="recovery-panel">
    <span className="action-symbol purple">{reset ? <KeyRound size={26} /> : <Mail size={26} />}</span>
    <h1>{reset ? "Choose a new password" : "Forgot your password?"}</h1>
    <p className="form-description">{reset ? "Use a password with at least 12 characters." : "Enter your account email and we will send you a reset link."}</p>
    {notice ? <><p className="google-success" role="status"><CheckCircle2 size={20} />{notice}</p><button className="button button-blue" onClick={onLogin}><ArrowLeft size={17} /> Back to log in</button></> : reset && !/^[a-f0-9]{64}$/.test(token) ? <><p className="error-message" role="alert">This reset link is missing or invalid.</p><button className="button button-blue" onClick={onForgot}>Request a new link</button></> : <form onSubmit={submit}><fieldset disabled={busy}>
      {reset ? <><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><label htmlFor="reset-confirmation">Confirm new password</label><input id="reset-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></> : <><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required /></>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="button button-primary recovery-submit" disabled={busy}><Send size={17} />{busy ? "Please wait..." : reset ? "Save new password" : "Send reset link"}</button>
    </fieldset></form>}
    {reset && error && <button className="button button-blue" disabled={busy} onClick={onForgot}>Request a new link</button>}
    {!notice && <button className="auth-home-link" disabled={busy} onClick={onLogin}><ArrowLeft size={17} /> Back to log in</button>}
  </section></main>;
}
