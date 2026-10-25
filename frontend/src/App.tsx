import { useEffect, useState } from "react";

import type { FormEvent } from "react";

import { api, ApiError } from "./lib/api";

import type { User } from "./lib/api";

import GoogleAuth from "./components/GoogleAuth";

import Dashboard from "./components/Dashboard";
import LandingPage from "./components/LandingPage";
import Modal from "./components/Modal";
import ThemeToggle from "./components/ThemeToggle";
import PasswordRecovery from "./components/PasswordRecovery";
import TestimonialsPage from "./components/TestimonialsPage";
import { ArrowLeft, ArrowRight, ArrowUpRight, Eye, EyeOff, LogOut, ShieldCheck, Users } from "lucide-react";



type Mode = "login" | "register";
type View = "home" | "login" | "register" | "dashboard" | "forgot" | "reset" | "testimonials";
function currentView(): View {
  const params = new URLSearchParams(window.location.search);
  if (params.get("join") === "paylet") return "register";
  if (params.has("google")) return params.get("google") === "linked" ? "dashboard" : "login";
  const view = params.get("view");
  return view === "login" || view === "register" || view === "dashboard" || view === "forgot" || view === "reset" || view === "testimonials" ? view : "home";
}



function App() {

  const [view, setView] = useState<View>(currentView);
  const [mode, setMode] = useState<Mode>(() => currentView() === "register" ? "register" : "login");
  const [confirmLogout, setConfirmLogout] = useState(false);

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

  function navigate(next: View, replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    url.searchParams.delete("google");
    for (const key of ["screen", "person", "group"]) url.searchParams.delete(key);
    url.hash = "";
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setView(next);
    if (next === "login" || next === "register") setMode(next);
    setError("");
    setPassword("");
    setShowPassword(false);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    function handleBack() {
      const next = currentView();
      setView(next);
      if (next === "login" || next === "register") setMode(next);
      setPassword("");
      setError("");
      setConfirmLogout(false);
    }
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);



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

    navigate(nextMode);

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
      navigate("dashboard", true);

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
      setConfirmLogout(false);
      navigate("home");

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



  async function requestLogout() {
    if (busy) return;
    setError("");
    setConfirmLogout(true);
  }

  const logoutDialog = confirmLogout && <Modal title="Log out of Paylet?" busy={busy} onClose={() => { setConfirmLogout(false); setError(""); }}>
    <p className="logout-confirm-copy">Are you sure you want to log out? You can sign in again whenever you are ready.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="profile-actions"><button className="button button-outline" data-autofocus disabled={busy} onClick={() => { setConfirmLogout(false); setError(""); }}>Stay signed in</button><button className="button button-danger" disabled={busy} onClick={() => void handleLogout()}><LogOut size={18} />{busy ? "Logging out..." : "Yes, log out"}</button></div>
  </Modal>;

  if (view === "forgot" || view === "reset") {
    return <PasswordRecovery key={view} reset={view === "reset"} onLogin={() => { setUser(null); navigate("login"); }} onForgot={() => navigate("forgot")} />;
  }

  if (view === "testimonials") return <TestimonialsPage user={user} checking={checking} onLogin={() => navigate("login")} onHome={() => navigate("home")} />;
  if (view === "home") {
    return <><LandingPage user={user} checking={checking} sessionError={sessionError} onLogin={() => navigate("login")} onRegister={() => navigate("register")} onDashboard={() => navigate("dashboard")} onLogout={requestLogout} />{logoutDialog}</>;
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
      <><Dashboard
        user={user}
        onUserChange={setUser}
        onLogout={requestLogout}
        logoutBusy={busy}
        logoutError={error}
      />{logoutDialog}</>
    );
  }



  return (

    <><main className="auth-layout">

      <section className="intro-panel" aria-label="About Paylet">

        <header className="auth-brand-header"><a className="brand" href="/">

          <span className="brand-mark">P</span>

          <span>Paylet</span>

        </a><ThemeToggle /></header>



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

                <ArrowUpRight size={22} />

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

                <Users size={22} />

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

                <ShieldCheck size={22} />

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
          <button type="button" className="auth-home-link" disabled={busy} onClick={() => navigate("home")}><ArrowLeft size={17} /> Back to home</button>

          {new URLSearchParams(window.location.search).get("join") === "paylet" && (
            <p className="google-success">You're invited to Paylet. Create your own account to join.</p>
          )}

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

                    placeholder="Your full name"

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

                    placeholder="your_username"

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

                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}

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



                {!busy && <ArrowRight size={20} aria-hidden="true" />}

              </button>

            </fieldset>

          </form>

          {!isRegister && <button type="button" className="forgot-password-link" disabled={busy} onClick={() => navigate("forgot")}>Forgot password?</button>}
          <GoogleAuth disabled={busy} />



          <p className="privacy-note">

            Your personal expenses stay private. No bank balance needed.

          </p>

        </div>

      </section>

    </main></>

  );

}



export default App;
