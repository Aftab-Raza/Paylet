import { useEffect, useRef } from "react";
import { ArrowDownLeft, ArrowRight, BarChart3, Check, ChevronRight, LayoutDashboard, LogIn, LogOut, Plus, ReceiptText, ShieldCheck, Users, Wallet, TrendingUp, CheckCircle2 } from "lucide-react";
import type { User } from "../lib/api";
import "./landing.css";
import ThemeToggle from "./ThemeToggle";
import Testimonials from "./Testimonials";
import CommunityCount from "./CommunityCount";
import HeroSplitDemo from "./HeroSplitDemo";
import DashboardPreview from "./DashboardPreview";

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
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("landing-entered"); observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    pageRef.current?.querySelectorAll(".landing-band, .landing-showcase, .landing-privacy, .landing-final-cta").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return <div className="landing-page" ref={pageRef}>
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
      <section className="landing-hero landing-interactive-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy landing-width">
          <span className="landing-eyebrow">YOUR MONEY. YOUR PEOPLE. YOUR LIFE.</span>
          <h1 id="landing-title">Paylet<span>.</span></h1>
          <p className="landing-hook">Less money stress. More life.</p>
          <p className="landing-hero-description">Track your spending. Split the bill.<br className="landing-desktop-break" /> Keep money between friends clear.</p>
          <div className="landing-hero-actions"><button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Open dashboard" : "Get started"}<ArrowRight size={18} /></button><a href="#about">Explore Paylet <ChevronRight size={17} /></a></div>
          <div className="landing-hero-benefits"><span><Check size={15} /> No bank connection</span><span><Check size={15} /> Your records stay private</span></div>
          <CommunityCount />
          <HeroSplitDemo />
        </div>
      </section>
      <div className="landing-band landing-feature-band" id="about"><section className="landing-about landing-width">
        <div className="landing-demo-heading"><span><span className="landing-live-dot" /> A little clarity. At a glance.</span><span>Illustrative examples</span></div>
        <div className="landing-money-grid" aria-label="Examples of Paylet money records">
          <article className="landing-money-card landing-money-total"><div className="landing-money-label"><Wallet size={20} /><span>Your month, together</span></div><p className="landing-demo-amount">INR 4,850<span>Recorded spending</span></p><div className="landing-demo-bars" aria-hidden="true">{[32, 52, 38, 72, 58, 90, 65, 80, 46, 96, 68, 84].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><div className="landing-money-foot"><BarChart3 size={15} /> Everyday expenses. One clear picture.</div></article>
          <article className="landing-money-card landing-money-expense"><div className="landing-money-label"><ReceiptText size={20} /><span>Every little expense</span><CheckCircle2 size={18} /></div><span className="landing-demo-category">FOOD & FRIENDS</span><h3>Lunch after lectures</h3><p className="landing-demo-amount">INR 250<span>Personal expense</span></p><div className="landing-money-foot"><Check size={16} /> Recorded. Remembered. Sorted.</div></article>
          <article className="landing-money-card landing-money-group"><div className="landing-money-label"><Users size={20} /><span>Better, together</span></div><h3>The weekend plan</h3><p className="landing-demo-amount">INR 1,200<span>Shared between 4 friends</span></p><div className="landing-demo-people" aria-hidden="true"><span>A</span><span>R</span><span>S</span><span>M</span></div><div className="landing-money-foot"><TrendingUp size={16} /> INR 300 each. No guesswork.</div></article>
        </div>
        <div className="landing-section-heading"><span className="landing-eyebrow">MADE FOR YOUR EVERYDAY</span><h2>Every plan. Every person. Every rupee.</h2><p>From your daily coffee to a weekend away, keep a record that makes sense.</p></div>
        <div className="landing-features">
          <article><div className="landing-feature-top"><span className="landing-feature-icon orange"><ReceiptText size={25} /></span><span className="landing-feature-number">01</span></div><h3>Your everyday spending</h3><p>Record expenses, organize them by category, and see your monthly totals without connecting a bank account.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon purple"><Users size={25} /></span><span className="landing-feature-number">02</span></div><h3>Shared plans, clear shares</h3><p>Split group expenses equally or choose custom amounts. Include friends who have not joined Paylet yet.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon green"><ArrowDownLeft size={25} /></span><span className="landing-feature-number">03</span></div><h3>Money between people</h3><p>Keep track of money lent, money borrowed, and repayments, with a separate record for each person.</p></article>
        </div>
      </section></div>
      <section className="landing-showcase" aria-labelledby="landing-showcase-title"><div className="landing-width"><div className="landing-section-heading"><span className="landing-eyebrow">THE WHOLE PICTURE</span><h2 id="landing-showcase-title">Less hunting through chats.<br />More knowing where you stand.</h2><p>Expenses, monthly totals, and shared plans, together in your dashboard.</p></div><DashboardPreview /></div></section>
      <section id="privacy" className="landing-privacy">
        <div className="landing-width landing-privacy-inner"><ShieldCheck size={36} className="landing-privacy-icon" /><div><span className="landing-eyebrow">SHARE ON YOUR TERMS</span><h2>Your personal records stay personal.</h2><p>Joining a group or connecting with someone does not reveal your private lending history. You choose which loan or repayment entries to share, and you can stop sharing them.</p></div><button className="button button-purple" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Go to dashboard" : "Create your account"}<ArrowRight size={18} /></button></div>
      </section>
      <div className="landing-band landing-community-band"><Testimonials user={user} checking={checking} onLogin={onLogin} /></div>
      <div className="landing-band landing-faq-band"><section className="landing-faq landing-width" aria-labelledby="landing-faq-title"><div><span className="landing-eyebrow">GOOD TO KNOW</span><h2 id="landing-faq-title">A little more clarity.</h2><p>Start with your own expenses. Bring your people along when you are ready.</p></div><div className="landing-questions">
        <details><summary>Do I need to connect my bank account?<Plus size={22} /></summary><p>No. Paylet records the expenses and money entries you add. It does not need your bank balance or banking credentials.</p></details>
        <details><summary>Can I include someone who does not use Paylet?<Plus size={22} /></summary><p>Yes. Add them to People and include them in a group split. If they join later, send a connection request using their username. They must accept before their account is connected.</p></details>
        <details><summary>Can Paylet show my monthly spending?<Plus size={22} /></summary><p>Yes. Your dashboard and reports show recorded expenses by month, with separate totals for each currency.</p></details>
      </div></section></div>
      <section className="landing-final-cta"><div className="landing-width"><Wallet size={32} className="landing-cta-icon" /><span className="landing-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Make room for a little clarity.</h2><p>Start with one expense. Keep going from there.</p><button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Your dashboard awaits" : "Get started with Paylet"}<ArrowRight size={19} /></button></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-width landing-footer-main"><div><a className="brand" href="/"><span className="brand-mark">P</span><span>Paylet</span></a><p>A little clarity for your everyday money.</p></div><nav aria-label="Footer navigation"><a href="#about"><Wallet size={16} /> About Paylet</a><a href="#privacy"><ShieldCheck size={16} /> Your privacy</a><button onClick={user ? onDashboard : onLogin}><BarChart3 size={16} /> {user ? "Dashboard" : "Log in"}</button></nav></div><div className="landing-width landing-footer-bottom"><span>&copy; {new Date().getFullYear()} Paylet A Raza Co.</span><span>Track thoughtfully. Share intentionally.</span></div></footer>
  </div>;
}
