import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";

type GoogleAuthProps = {
  link?: boolean;
  disabled?: boolean;
};

const messages: Record<string, string> = {
  expired: "Google sign-in expired. Please try again.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in failed. Please try again.",
  link_required:
    "This email already has a Paylet account. Log in with your password, then connect Google.",
  link_mismatch:
    "Choose the Google account with the same email as your Paylet account. It must not be linked elsewhere.",
  linked: "Google is now connected. You can use it to log in.",
};

export default function GoogleAuth({
  link = false,
  disabled = false,
}: GoogleAuthProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const code =
    new URLSearchParams(window.location.search).get("google") ?? "";

  const notice = messages[code];

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await api<{ url: string }>("/auth/google/link", {
        method: "POST",
        body: JSON.stringify({ password }),
      });

      setPassword("");
      window.location.assign(result.url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect Google."
      );
      setBusy(false);
    }
  }

  return (
    <section className="google-auth" aria-label="Google authentication">
      {notice && (
        <p
          className={
            code === "linked" ? "google-success" : "error-message"
          }
          role="status"
        >
          {notice}
        </p>
      )}

      {link ? (
        <>
          <h2>Connect Google</h2>

          <p className="form-description">
            Confirm your Paylet password, then choose the Google account
            with the same email address.
          </p>

          <form onSubmit={handleLink}>
            <label htmlFor="google-link-password">
              Current Paylet password
            </label>

            <input
              id="google-link-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              disabled={busy || disabled}
              required
            />

            <button
              type="submit"
              className="button google-button"
              disabled={busy || disabled}
            >
              {busy ? "Connecting…" : "Connect Google"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="button google-button"
            disabled={disabled}
            onClick={() => window.location.assign("/api/auth/google")}
          >
            Sign in with Google
          </button>
        </>
      )}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}