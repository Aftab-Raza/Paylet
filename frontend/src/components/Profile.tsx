import BrandMark from "./BrandMark";
import { useSuccessToast } from "../lib/successToast";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Camera, LogOut, Pencil } from "lucide-react";
import { currencyLabel } from "../lib/currencyLabel";
import ThemeToggle from "./ThemeToggle";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import GoogleAuth from "./GoogleAuth";
import Modal from "./Modal";
import "./profile-refresh.css";

type ProfileUser = User & {
  createdAt: string;
  googleConnected: boolean;
  hasPassword: boolean;
  communityPhotoConsent?: boolean;
};
type ProfileOptions = { currencies: string[]; timezones: string[] };
type Draft = { displayName: string; username: string; bio: string; defaultCurrency: string; timezone: string; communityPhotoConsent: boolean };
type Props = { onBack: () => void; onUserChange: (user: User) => void; onLogout: () => Promise<void>; logoutBusy: boolean; logoutError: string };

function makeDraft(user: ProfileUser): Draft {
  return { displayName: user.displayName, username: user.username, bio: user.bio ?? "", defaultCurrency: user.defaultCurrency, timezone: user.timezone, communityPhotoConsent: user.communityPhotoConsent ?? false };
}

export default function Profile({ onBack, onUserChange, onLogout, logoutBusy, logoutError }: Props) {
  const notifySuccess = useSuccessToast();
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const disabled = busy || logoutBusy;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ user: ProfileUser }>("/profile", { signal: controller.signal }),
      api<ProfileOptions>("/profile/options", { signal: controller.signal }),
    ]).then(([result, choices]) => {
      if (controller.signal.aborted) return;
      setProfile(result.user); setDraft(makeDraft(result.user)); setOptions(choices); setLoading(false);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Unable to load profile."); setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft(current => current ? { ...current, [field]: value } : current);
  }
  function acceptUser(user: ProfileUser) { setProfile(user); onUserChange(user); }
  function closeEditor() { if (!disabled) { setEditing(false); setError(""); if (profile) setDraft(makeDraft(profile)); } }
  function closePhoto() { if (!disabled) { setPhoto(null); setPhotoPreview(null); setError(""); } }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || disabled) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ user: ProfileUser }>("/profile", { method: "PATCH", body: JSON.stringify(draft) });
      acceptUser(result.user); setDraft(makeDraft(result.user)); setEditing(false);
      notifySuccess("Profile saved.", { position: "top-right" });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save."); }
    finally { setBusy(false); }
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) { setError("Choose a photo smaller than 5 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG, or WebP photo."); return; }
    setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  }

  async function updatePhoto(remove = false) {
    if (disabled || (!remove && !photo)) return;
    setBusy(true); setError("");
    try {
      const formData = new FormData();
      if (!remove && photo) formData.append("avatar", photo);
      const result = await api<{ user: ProfileUser }>("/profile/avatar", remove ? { method: "DELETE" } : { method: "POST", body: formData });
      acceptUser(result.user); setPhoto(null); setPhotoPreview(null);
      notifySuccess(remove ? "Profile photo removed." : "Profile photo saved.", { position: "top-right" });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update photo."); }
    finally { setBusy(false); }
  }

  return <main className="signed-in-page profile-screen">
    <header className="app-header profile-header">
      <a className="brand" href="/"><BrandMark /><span>Paylet.</span></a>
      <div className="profile-header-actions">
        <ThemeToggle />
        <button type="button" className="button button-outline" disabled={disabled} onClick={onBack}><ArrowLeft size={18} /> Dashboard</button>
        <button type="button" className="button button-outline" disabled={disabled} onClick={() => void onLogout()}><LogOut size={18} />{logoutBusy ? "Logging out…" : "Log out"}</button>
      </div>
    </header>
    <section className="profile-page">
      <span className="eyebrow">YOUR PAYLET ACCOUNT</span><h1>My profile</h1>
      <p className="form-description">Manage how you appear and personalize your preferences.</p>
      {loading && <p role="status">Loading your profile…</p>}
      {(logoutError || (error && !editing && !photo)) && <p className="error-message" role="alert">{logoutError || error}</p>}
      {!loading && !profile && <button className="button button-blue" onClick={() => window.location.reload()}>Reload profile</button>}
      {profile && draft && options && <div className="profile-grid">
        <aside className="profile-panel profile-identity-card">
          <div className="profile-avatar-shell">
            <div className="avatar-preview">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName + "'s profile"} referrerPolicy="no-referrer" /> : <span aria-hidden="true">{profile.displayName.charAt(0).toUpperCase()}</span>}</div>
            <button type="button" className="profile-camera" aria-label="Change profile photo" title="Change profile photo" disabled={disabled} onClick={() => fileInput.current?.click()}><Camera size={19} aria-hidden="true" /></button>
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo file" hidden disabled={disabled} onChange={choosePhoto} />
          <h2>{profile.displayName}</h2><p className="profile-handle">@{profile.username}</p>
          <p className="profile-member">Member since {new Date(profile.createdAt).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: profile.timezone })}</p>
          <button type="button" className="button button-primary" disabled={disabled} onClick={() => { setError(""); setDraft(makeDraft(profile)); setEditing(true); }}><Pencil size={17} /> Edit profile</button>
          {profile.avatarUrl && <button type="button" className="profile-photo-remove" disabled={disabled} onClick={() => { if (window.confirm("Remove your profile photo?")) void updatePhoto(true); }}>Remove photo</button>}
          <div className="connection-card"><h3>Google connection</h3>{profile.googleConnected ? <p className="connected-label">✓ Google connected</p> : profile.hasPassword ? <GoogleAuth link disabled={disabled} /> : <p>Google is not connected.</p>}</div>
        </aside>
        <section className="profile-panel profile-details-card"><h2>Profile details</h2>
          <dl className="profile-details">
            <div><dt>Display name</dt><dd>{profile.displayName}</dd></div>
            <div><dt>Username</dt><dd>@{profile.username}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
            <div><dt>Bio</dt><dd className="profile-bio">{profile.bio || "No bio added yet."}</dd></div>
            <div><dt>Default currency</dt><dd>{currencyLabel(profile.defaultCurrency)}</dd></div>
            <div><dt>Timezone</dt><dd>{profile.timezone}</dd></div>
            <div><dt>Public community photo</dt><dd>{profile.communityPhotoConsent ? "Visible when recently signed in" : "Private"}</dd></div>
          </dl>
        </section>
      </div>}
      {editing && profile && draft && options && <Modal title="Edit profile" className="profile-edit-modal" busy={disabled} onClose={closeEditor}>
        {error && <p className="error-message" role="alert">{error}</p>}
              <form onSubmit={saveProfile}>
                <fieldset disabled={disabled}>
                  <label htmlFor="profile-name">Display name</label>
                  <input
                    id="profile-name"
                    data-autofocus
                    autoComplete="name"
                    value={draft.displayName}
                    onChange={(event) =>
                      updateField("displayName", event.target.value)
                    }
                    minLength={2}
                    maxLength={100}
                    required
                  />

                  <label htmlFor="profile-username">Username</label>
                  <input
                    id="profile-username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={draft.username}
                    onChange={(event) =>
                      updateField(
                        "username",
                        event.target.value.toLowerCase()
                      )
                    }
                    pattern="[a-z0-9_]+"
                    minLength={3}
                    maxLength={30}
                    required
                  />

                  <label htmlFor="profile-email">Email</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profile.email}
                    readOnly
                  />
                  <small>
                    Email changes will require a separate verification step.
                  </small>

                  <label htmlFor="profile-bio">Bio</label>
                  <textarea
                    id="profile-bio"
                    value={draft.bio}
                    onChange={(event) =>
                      updateField("bio", event.target.value)
                    }
                    maxLength={250}
                    rows={4}
                    placeholder="A little about you…"
                  />
                  <small>{draft.bio.length}/250 characters</small>
                  <label className="testimonial-consent"><input type="checkbox" checked={draft.communityPhotoConsent} onChange={(event) => updateField("communityPhotoConsent", event.target.checked)} /><span>Show my photo in the public community.</span></label><small>Optional. Your photo may appear beside the landing page’s user count. Turn it off anytime.</small>

                  <div className="profile-fields-row">
                    <div>
                      <label htmlFor="profile-currency">
                        Default currency
                      </label>
                      <select
                        id="profile-currency"
                        value={draft.defaultCurrency}
                        onChange={(event) =>
                          updateField(
                            "defaultCurrency",
                            event.target.value
                          )
                        }
                      >
                        {options.currencies.map((currency) => (
                          <option key={currency} value={currency}>
                            {currencyLabel(currency)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="profile-timezone">Timezone</label>
                      <select
                        id="profile-timezone"
                        value={draft.timezone}
                        onChange={(event) =>
                          updateField("timezone", event.target.value)
                        }
                      >
                        {Array.from(
                          new Set([draft.timezone, ...options.timezones])
                        )
                          .sort()
                          .map((timezone) => (
                            <option key={timezone} value={timezone}>
                              {timezone}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <small>
                    Your default currency is a preference. It will not
                    convert or relabel existing transactions.
                  </small>

                  <div className="profile-actions">
                    <button
                      className="button button-green"
                      type="submit"
                    >
                      {busy ? "Please wait…" : "Save changes"}
                    </button>

                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => {
                        setDraft(makeDraft(profile));
                        setError("");
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
      </Modal>}
      {photo && photoPreview && <Modal title="Save profile photo" className="profile-photo-modal" busy={disabled} onClose={closePhoto}>
        <img className="profile-photo-preview" src={photoPreview} alt="Selected profile photo preview" />
        <p className="profile-member">JPEG, PNG, or WebP · Maximum 5 MB. Your photo will be center-cropped into a square.</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="profile-actions"><button type="button" className="button button-primary" disabled={disabled} onClick={() => void updatePhoto()}>{busy ? "Saving…" : "Save photo"}</button><button type="button" className="button button-outline" disabled={disabled} onClick={closePhoto}>Cancel</button></div>
      </Modal>}
    </section>
  </main>;
}
