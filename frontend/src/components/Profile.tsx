import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/api";
import GoogleAuth from "./GoogleAuth";

type ProfileUser = User & {
  createdAt: string;
  googleConnected: boolean;
  hasPassword: boolean;
};

type ProfileOptions = {
  currencies: string[];
  timezones: string[];
};

type Draft = {
  displayName: string;
  username: string;
  bio: string;
  defaultCurrency: string;
  timezone: string;
};

type Props = {
  onUserChange: (user: User) => void;
  onLogout: () => Promise<void>;
  logoutBusy: boolean;
  logoutError: string;
};

function makeDraft(user: ProfileUser): Draft {
  return {
    displayName: user.displayName,
    username: user.username,
    bio: user.bio ?? "",
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
  };
}

export default function Profile({
  onUserChange,
  onLogout,
  logoutBusy,
  logoutError,
}: Props) {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      api<{ user: ProfileUser }>("/profile", {
        signal: controller.signal,
      }),
      api<ProfileOptions>("/profile/options", {
        signal: controller.signal,
      }),
    ])
      .then(([result, choices]) => {
        if (controller.signal.aborted) return;

        setProfile(result.user);
        setDraft(makeDraft(result.user));
        setOptions(choices);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error ? err.message : "Unable to load profile."
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  function updateField(field: keyof Draft, value: string) {
    setDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  function acceptUser(user: ProfileUser) {
    setProfile(user);
    onUserChange(user);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || busy) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const result = await api<{ user: ProfileUser }>("/profile", {
        method: "PATCH",
        body: JSON.stringify(draft),
      });

      acceptUser(result.user);
      setDraft(makeDraft(result.user));
      setSuccess("Profile changes saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePhoto(remove = false) {
    if (busy || (!remove && !photo)) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();

      if (photo) {
        formData.append("avatar", photo);
      }

      const result = await api<{ user: ProfileUser }>(
        "/profile/avatar",
        remove
          ? { method: "DELETE" }
          : { method: "POST", body: formData }
      );

      acceptUser(result.user);
      setPhoto(null);
      setFileInputKey((value) => value + 1);
      setSuccess(remove ? "Photo removed." : "Photo updated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update photo."
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || logoutBusy;

  return (
    <main className="signed-in-page">
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Paylet</span>
        </a>

        <button
          type="button"
          className="button button-outline"
          disabled={disabled}
          onClick={() => void onLogout()}
        >
          {logoutBusy ? "Logging out…" : "Log out"}
        </button>
      </header>

      <section className="profile-page">
        <span className="eyebrow">YOUR PAYLET ACCOUNT</span>
        <h1>My profile</h1>
        <p className="form-description">
          Manage how you appear and personalize your preferences.
        </p>

        {loading && <p role="status">Loading your profile…</p>}

        {(error || logoutError) && (
          <p className="error-message" role="alert">
            {error || logoutError}
          </p>
        )}

        {success && (
          <p className="google-success" role="status">
            {success}
          </p>
        )}

        {!loading && !profile && (
          <button
            className="button button-blue"
            onClick={() => window.location.reload()}
          >
            Reload profile
          </button>
        )}

        {profile && draft && options && (
          <div className="profile-grid">
            <aside className="profile-panel">
              <div className="avatar-preview">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={`${profile.displayName}'s profile`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span aria-hidden="true">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <h2>{profile.displayName}</h2>
              <p className="profile-handle">@{profile.username}</p>

              <p className="profile-member">
                Member since{" "}
                {new Date(profile.createdAt).toLocaleDateString("en", {
                  month: "long",
                  year: "numeric",
                  timeZone: profile.timezone,
                })}
              </p>

              <label htmlFor="avatar-upload">Choose a profile photo</label>
              <input
                key={fileInputKey}
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;

                  setError("");
                  setSuccess("");

                  if (file && file.size > 5 * 1024 * 1024) {
                    setPhoto(null);
                    setError("Choose a photo smaller than 5 MB.");
                    event.target.value = "";
                    return;
                  }

                  setPhoto(file);
                }}
              />

              <small>JPEG, PNG, or WebP. Maximum 5 MB.</small>
              <small>Photos are center-cropped into a square.</small>

              <div className="profile-actions">
                <button
                  type="button"
                  className="button button-blue"
                  disabled={disabled || !photo}
                  onClick={() => void updatePhoto()}
                >
                  Upload photo
                </button>

                <button
                  type="button"
                  className="button button-danger"
                  disabled={disabled || !profile.avatarUrl}
                  onClick={() => {
                    if (window.confirm("Remove your profile photo?")) {
                      void updatePhoto(true);
                    }
                  }}
                >
                  Remove
                </button>
              </div>

              <p className="profile-member">
                Photo changes save separately from profile details.
              </p>

              <div className="connection-card">
                <h3>Google connection</h3>

                {profile.googleConnected ? (
                  <p className="connected-label">✓ Google connected</p>
                ) : profile.hasPassword ? (
                  <GoogleAuth link disabled={disabled} />
                ) : (
                  <p>Google is not connected.</p>
                )}
              </div>
            </aside>

            <section className="profile-panel">
              <h2>Edit profile</h2>

              <form onSubmit={saveProfile}>
                <fieldset disabled={disabled}>
                  <label htmlFor="profile-name">Display name</label>
                  <input
                    id="profile-name"
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
                            {currency}
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
                        setSuccess("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}