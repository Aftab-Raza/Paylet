import { useEffect, useState } from "react";

import type { FormEvent } from "react";

import { api, ApiError } from "./lib/api";

import type { User } from "./lib/api";

import GoogleAuth from "./components/GoogleAuth";



type Mode = "login" | "register";



function App() {

  const [mode, setMode] = useState<Mode>("login");

  const [user, setUser] = useState<User | null>(null);

  const [checking, setChecking] = useState(true);

  const [sessionError, setSessionError] = useState("");



  const [displayName, setDisplayName] = useState("");

  const [username, setUsername] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");



  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");



  const isRegister = mode === "register";



  useEffect(() => {

    const controller = new AbortController();



    api<{ user: User }>("/auth/me", {

      signal: controller.signal,

    })

      .then((result) => {

        if (controller.signal.aborted) return;



        setUser(result.user);

        setSessionError("");

        setChecking(false);

      })

      .catch((err: unknown) => {

        if (controller.signal.aborted) return;



        if (err instanceof ApiError && err.status === 401) {

          setUser(null);

          setSessionError("");

        } else {

          setSessionError(

            err instanceof Error

              ? err.message

              : "Unable to check your session."

          );

        }



        setChecking(false);

      });



    return () => controller.abort();

  }, []);

    // Recheck the session when the browser restores a cached page.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);


  function changeMode(nextMode: Mode) {

    setMode(nextMode);

    setError("");

    setPassword("");

    setShowPassword(false);

  }



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();



    if (busy) return;



    setBusy(true);

    setError("");



    const body = isRegister

      ? { displayName, username, email, password }

      : { email, password };



    try {

      const result = await api<{ user: User }>(

        isRegister ? "/auth/register" : "/auth/login",

        {

          method: "POST",

          body: JSON.stringify(body),

        }

      );



      setUser(result.user);

      setPassword("");

      setShowPassword(false);

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Unable to complete your request."

      );

    } finally {

      setBusy(false);

    }

  }



  async function handleLogout() {

    if (busy) return;



    setBusy(true);

    setError("");



    try {

      await api<{ message: string }>("/auth/logout", {

        method: "POST",

      });



      setUser(null);

      setMode("login");

      setPassword("");

      setShowPassword(false);

    } catch (err) {

      setError(

        err instanceof Error ? err.message : "Unable to log out."

      );

    } finally {

      setBusy(false);

    }

  }



  if (checking || sessionError) {

    return (

      <main className="status-page">

        <div className="status-box">

          <div className="brand-mark">P</div>

          <h1>Paylet</h1>



          {checking ? (

            <p role="status">Checking your session…</p>

          ) : (

            <>

              <p role="alert">{sessionError}</p>



              <button

                type="button"

                className="button button-blue"

                onClick={() => window.location.reload()}

              >

                Try again

              </button>

            </>

          )}

        </div>

      </main>

    );

  }



  if (user) {

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

            onClick={() => void handleLogout()}

            disabled={busy}

          >

            {busy ? "Logging out…" : "Log out"}

          </button>

        </header>



        <section className="welcome-card">

          <span className="eyebrow">YOU’RE SIGNED IN</span>



          <div className="profile-initial" aria-hidden="true">

            {user.displayName.charAt(0).toUpperCase()}

          </div>



          <h1>Welcome, {user.displayName}.</h1>

          <p>Your Paylet account is ready.</p>



          <dl className="profile-details">

            <div>

              <dt>Username</dt>

              <dd>@{user.username}</dd>

            </div>



            <div>

              <dt>Email</dt>

              <dd>{user.email}</dd>

            </div>



            <div>

              <dt>Default currency</dt>

              <dd>{user.defaultCurrency}</dd>

            </div>

          </dl>

          <GoogleAuth link disabled={busy} />



          <p className="development-note">

            Expense tracking, shared bills, and your dashboard are coming

            in the next build steps.

          </p>



          {error && (

            <p className="error-message" role="alert">

              {error}

            </p>

          )}

        </section>

      </main>

    );

  }



  return (

    <main className="auth-layout">

      <section className="intro-panel" aria-label="About Paylet">

        <a className="brand" href="/">

          <span className="brand-mark">P</span>

          <span>Paylet</span>

        </a>



        <div className="intro-content">

          <span className="eyebrow">

            LESS CONFUSION. MORE CLARITY.

          </span>



          <h1>

            Your spending.{" "}

            <br />

            Your people.{" "}

            <br />

            <span>All together.</span>

          </h1>



          <p className="intro-description">

            Keep track of everyday expenses, shared bills, and money

            lent to people—all in one place.

          </p>



          <div className="feature-list">

            <div>

              <span

                className="feature-icon icon-green"

                aria-hidden="true"

              >

                ↗

              </span>



              <div>

                <strong>Know your spending</strong>

                <p>Keep personal expenses organized.</p>

              </div>

            </div>



            <div>

              <span

                className="feature-icon icon-blue"

                aria-hidden="true"

              >

                ⇄

              </span>



              <div>

                <strong>Make sharing simpler</strong>

                <p>Keep everyone’s share clear.</p>

              </div>

            </div>



            <div>

              <span

                className="feature-icon icon-yellow"

                aria-hidden="true"

              >

                ✓

              </span>



              <div>

                <strong>Keep your finances private</strong>

                <p>No bank balance required.</p>

              </div>

            </div>

          </div>

        </div>



        <p className="intro-footer">

          A little clarity goes a long way.

        </p>

      </section>



      <section className="form-panel" aria-labelledby="auth-title">

        <div className="auth-card">

          <div

            className="mode-switch"

            aria-label="Choose login or registration"

          >

            <button

              type="button"

              className={!isRegister ? "selected" : ""}

              aria-pressed={!isRegister}

              disabled={busy}

              onClick={() => changeMode("login")}

            >

              Log in

            </button>



            <button

              type="button"

              className={isRegister ? "selected" : ""}

              aria-pressed={isRegister}

              disabled={busy}

              onClick={() => changeMode("register")}

            >

              Create account

            </button>

          </div>



          <h2 id="auth-title">

            {isRegister

              ? "Make room for clarity."

              : "Good to see you again."}

          </h2>



          <p className="form-description">

            {isRegister

              ? "Create your Paylet account to get started."

              : "Log in to continue to your Paylet account."}

          </p>



          <form onSubmit={handleSubmit} aria-busy={busy}>

            <fieldset disabled={busy}>

              {isRegister && (

                <>

                  <label htmlFor="displayName">Your name</label>



                  <input

                    id="displayName"

                    name="displayName"

                    autoComplete="name"

                    placeholder="Aftab Raza"

                    minLength={2}

                    maxLength={100}

                    value={displayName}

                    onChange={(event) =>

                      setDisplayName(event.target.value)

                    }

                    required

                  />



                  <label htmlFor="username">Username</label>



                  <input

                    id="username"

                    name="username"

                    autoComplete="username"

                    autoCapitalize="none"

                    spellCheck={false}

                    placeholder="aftab_raza"

                    minLength={3}

                    maxLength={30}

                    pattern="[a-z0-9_]+"

                    aria-describedby="username-help"

                    value={username}

                    onChange={(event) =>

                      setUsername(event.target.value.toLowerCase())

                    }

                    required

                  />



                  <small id="username-help">

                    3–30 lowercase letters, numbers, or underscores.

                  </small>

                </>

              )}



              <label htmlFor="email">Email address</label>



              <input

                id="email"

                name="email"

                type="email"

                autoComplete={isRegister ? "email" : "username"}

                autoCapitalize="none"

                spellCheck={false}

                placeholder="you@example.com"

                maxLength={254}

                value={email}

                onChange={(event) => setEmail(event.target.value)}

                required

              />



              <label htmlFor="password">Password</label>



              <div className="password-field">

                <input

                  id="password"

                  name="password"

                  type={showPassword ? "text" : "password"}

                  autoComplete={

                    isRegister ? "new-password" : "current-password"

                  }

                  placeholder={

                    isRegister

                      ? "Create a strong password"

                      : "Enter your password"

                  }

                  minLength={isRegister ? 12 : 1}

                  maxLength={128}

                  aria-describedby={

                    isRegister ? "password-help" : undefined

                  }

                  value={password}

                  onChange={(event) => setPassword(event.target.value)}

                  required

                />



                <button

                  type="button"

                  className="password-toggle"

                  aria-label={

                    showPassword ? "Hide password" : "Show password"

                  }

                  aria-pressed={showPassword}

                  onClick={() => setShowPassword((visible) => !visible)}

                >

                  {showPassword ? "Hide" : "Show"}

                </button>

              </div>



              {isRegister && (

                <small id="password-help">

                  Use 12–128 characters.

                </small>

              )}



              {error && (

                <p className="error-message" role="alert">

                  {error}

                </p>

              )}



              <button

                type="submit"

                className={`button submit-button ${

                  isRegister ? "button-green" : "button-blue"

                }`}

              >

                {busy

                  ? "Please wait…"

                  : isRegister

                    ? "Create account"

                    : "Log in"}



                {!busy && <span aria-hidden="true">→</span>}

              </button>

            </fieldset>

          </form>

          <GoogleAuth disabled={busy} />



          <p className="privacy-note">

            Your personal expenses stay private. No bank balance needed.

          </p>

        </div>

      </section>

    </main>

  );

}



export default App;