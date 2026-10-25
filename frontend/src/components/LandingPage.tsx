import { ArrowDownLeft, ArrowRight, BarChart3, Check, ChevronRight, LayoutDashboard, LogIn, LogOut, Plus, ReceiptText, ShieldCheck, Users, Wallet } from "lucide-react";
import type { User } from "../lib/api";
import "./landing.css";
import ThemeToggle from "./ThemeToggle";
import Testimonials from "./Testimonials";

type Props = {
  user: User | null;
  checking: boolean;
  sessionError: string;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => Promise<void>;
};

export default function LandingPage({ user, checking, sessionError, onLogin, onRegister, onDashboard, onLogout }: Props) {
  return <div className="landing-page">
    <a className="landing-skip" href="#landing-main">Skip to content</a>
    <header className="landing-header"><div className="landing-header-inner landing-width">
      <a className="brand" href="/" aria-label="Paylet home"><span className="brand-mark">P</span><span>Paylet</span></a>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#about">About</a><a href="#privacy">Privacy</a></nav>
      <div className="landing-account">
        <ThemeToggle />
        {user ? <><button className="button button-primary" onClick={onDashboard}><LayoutDashboard size={17} /> Dashboard</button><button className="button button-outline" onClick={() => void onLogout()}><LogOut size={17} /> Log out</button></> : <><button className="button button-outline" disabled={checking} onClick={onLogin}><LogIn size={17} /> Log in</button><button className="button button-primary landing-signup" disabled={checking} onClick={onRegister}>Create account <ArrowRight size={17} /></button></>}
      </div>
    </div></header>
    {sessionError && <div className="landing-width landing-session" role="alert">{sessionError} <button className="button button-outline" onClick={() => window.location.reload()}>Retry</button></div>}
    <main id="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <img className="landing-hero-image" src="/paylet-cinematic-hero.png" width="1672" height="941" alt="" fetchPriority="high" />
        <div className="landing-hero-copy landing-width">
          <span className="landing-eyebrow">YOUR MONEY. YOUR PEOPLE. YOUR LIFE.</span>
          <h1 id="landing-title">Paylet<span>.</span></h1>
          <p className="landing-hook">Less money stress.<br />More life.</p>
          <p className="landing-hero-description">Track your spending. Split the bill.<br className="landing-desktop-break" /> Keep money between friends clear.</p>
          <div className="landing-hero-actions"><button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Open dashboard" : "Get started"}<ArrowRight size={18} /></button><a href="#about">Explore Paylet <ChevronRight size={17} /></a></div>
          <div className="landing-hero-benefits"><span><Check size={15} /> No bank connection</span><span><Check size={15} /> Your records stay private</span></div>
        </div>
      </section>
      <section id="about" className="landing-about landing-width">
        <div className="landing-section-heading"><span className="landing-eyebrow">MADE FOR YOUR EVERYDAY</span><h2>Every plan. Every person. Every rupee.</h2><p>From your daily coffee to a weekend away, keep a record that makes sense.</p></div>
        <div className="landing-features">
          <article><div className="landing-feature-top"><span className="landing-feature-icon orange"><ReceiptText size={25} /></span><span className="landing-feature-number">01</span></div><h3>Your everyday spending</h3><p>Record expenses, organize them by category, and see your monthly totals without connecting a bank account.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon purple"><Users size={25} /></span><span className="landing-feature-number">02</span></div><h3>Shared plans, clear shares</h3><p>Split group expenses equally or choose custom amounts. Include friends who have not joined Paylet yet.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon green"><ArrowDownLeft size={25} /></span><span className="landing-feature-number">03</span></div><h3>Money between people</h3><p>Keep track of money lent, money borrowed, and repayments, with a separate record for each person.</p></article>
        </div>
      </section>
      <section className="landing-showcase" aria-labelledby="landing-showcase-title"><div className="landing-width"><div className="landing-section-heading"><span className="landing-eyebrow">THE WHOLE PICTURE</span><h2 id="landing-showcase-title">Less hunting through chats.<br />More knowing where you stand.</h2><p>Expenses, monthly totals, and shared plans, together in your dashboard.</p></div><img className="landing-product" src="/paylet-preview.png" width="1440" height="960" loading="lazy" alt="Paylet dashboard with example expenses, monthly totals, and shortcuts for shared bills and lending" /></div></section>
      <section id="privacy" className="landing-privacy">
        <div className="landing-width landing-privacy-inner"><ShieldCheck size={36} className="landing-privacy-icon" /><div><span className="landing-eyebrow">SHARE ON YOUR TERMS</span><h2>Your personal records stay personal.</h2><p>Joining a group or connecting with someone does not reveal your private lending history. You choose which loan or repayment entries to share, and you can stop sharing them.</p></div><button className="button button-purple" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Go to dashboard" : "Create your account"}<ArrowRight size={18} /></button></div>
      </section>
      <Testimonials user={user} checking={checking} onLogin={onLogin} />
      <section className="landing-faq landing-width" aria-labelledby="landing-faq-title"><div><span className="landing-eyebrow">GOOD TO KNOW</span><h2 id="landing-faq-title">A little more clarity.</h2><p>Start with your own expenses. Bring your people along when you are ready.</p></div><div className="landing-questions">
        <details><summary>Do I need to connect my bank account?<Plus size={22} /></summary><p>No. Paylet records the expenses and money entries you add. It does not need your bank balance or banking credentials.</p></details>
        <details><summary>Can I include someone who does not use Paylet?<Plus size={22} /></summary><p>Yes. Add them to People and include them in a group split. If they join later, send a connection request using their username. They must accept before their account is connected.</p></details>
        <details><summary>Can Paylet show my monthly spending?<Plus size={22} /></summary><p>Yes. Your dashboard and reports show recorded expenses by month, with separate totals for each currency.</p></details>
      </div></section>
      <section className="landing-final-cta landing-width"><h2>Make room for a little clarity.</h2><p>Start with one expense. Keep going from there.</p><button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Your dashboard awaits" : "Get started with Paylet"}<ArrowRight size={19} /></button></section>
    </main>
    <footer className="landing-footer"><div className="landing-width landing-footer-main"><div><a className="brand" href="/"><span className="brand-mark">P</span><span>Paylet</span></a><p>A little clarity for your everyday money.</p></div><nav aria-label="Footer navigation"><a href="#about"><Wallet size={16} /> About Paylet</a><a href="#privacy"><ShieldCheck size={16} /> Your privacy</a><button onClick={user ? onDashboard : onLogin}><BarChart3 size={16} /> {user ? "Dashboard" : "Log in"}</button></nav></div><div className="landing-width landing-footer-bottom"><span>&copy; {new Date().getFullYear()} Paylet A Raza Co.</span><span>Track thoughtfully. Share intentionally.</span></div></footer>
  </div>;
}
