import BrandMark from "./BrandMark";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, BarChart3, Check, ChevronRight, LayoutDashboard, LogIn, LogOut, Plus, ReceiptText, ShieldCheck, Users, Wallet } from "lucide-react";
import type { User } from "../lib/api";
import "./landing.css";
import ThemeToggle from "./ThemeToggle";
import Testimonials from "./Testimonials";
import CommunityCount from "./CommunityCount";
import ReceiptPreview from "./ReceiptPreview";
import "./landing-editorial.css";
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
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.IntersectionObserver) return;
    pageRef.current?.classList.add("landing-observed");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("landing-entered"); observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    pageRef.current?.querySelectorAll(".receipt-preview").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return <div className="landing-page landing-editorial" ref={pageRef}>
    <a className="landing-skip" href="#landing-main">Skip to content</a>
    <header className="landing-header"><div className="landing-header-inner landing-width">
      <a className="brand" href="/" aria-label="Paylet home"><BrandMark /><span>Paylet.</span></a>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#about">About</a><a href="#privacy">Privacy</a></nav>
      <div className="landing-account">
        <ThemeToggle />
        {user ? <><button className="button button-primary" onClick={onDashboard}><LayoutDashboard size={17} /> Dashboard</button><button className="button button-outline" onClick={() => void onLogout()}><LogOut size={17} /> Log out</button></> : <><button className="button button-outline" disabled={checking} onClick={onLogin}><LogIn size={17} /> Log in</button><button className="button button-primary landing-signup" disabled={checking} onClick={onRegister}>Create account <ArrowRight size={17} /></button></>}
      </div>
    </div></header>
    {sessionError && <div className="landing-width landing-session" role="alert">{sessionError} <button className="button button-outline" onClick={() => window.location.reload()}>Retry</button></div>}
    <main id="landing-main">
      <section className="landing-hero editorial-hero" aria-labelledby="landing-title">
        <div className="editorial-hero-inner landing-width">
          <div className="editorial-hero-copy">
            <h1 id="landing-title">Every expense<br/>in its place</h1>
            <p className="landing-hero-description">Your spending, shared bills, and money between friends. A clear record of what went where.</p>
            <div className="landing-hero-actions">
              <button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>
                {user ? "Open dashboard" : "Get started"}<ArrowRight size={18}/>
              </button>
              {user ? <a href="#about">Explore Paylet <ChevronRight size={18}/></a> : <button className="editorial-text-action" disabled={checking} onClick={onLogin}>Sign in <ArrowRight size={18}/></button>}
            </div>
          </div>
          <ReceiptPreview/>
          <div className="editorial-community"><CommunityCount refreshKey={communityRefresh}/></div>
        </div>
      </section>
      <div className="landing-hero-benefits landing-clean-benefits"><span><Check size={15}/>No bank connection</span><span><Check size={15}/>Your records stay private</span><a href="#about">Explore Paylet <ChevronRight size={15}/></a></div>
      <div className="landing-band landing-feature-band" id="about"><section className="landing-about landing-width">
        <div className="landing-demo-heading"><span>Your records at a glance</span><span>Illustrative examples</span></div>
        <div className="landing-money-grid landing-example-strip" aria-label="Examples of Paylet money records">
          <article>
            <Wallet size={19} aria-hidden="true"/>
            <div><h3>Your month, together</h3><p>Recorded spending</p></div>
            <div className="landing-example-value"><strong>₹ 4,850</strong></div>
          </article>
          <article>
            <ReceiptText size={19} aria-hidden="true"/>
            <div><h3>Lunch after lectures</h3><p>Personal expense · Food &amp; friends</p></div>
            <strong>₹ 250</strong>
          </article>
          <article>
            <Users size={19} aria-hidden="true"/>
            <div><h3>The weekend plan</h3><p>4 friends · ₹ 300 each</p></div>
            <div className="landing-example-value"><strong>₹ 1,200</strong><div className="landing-demo-people" aria-hidden="true"><span>A</span><span>R</span><span>S</span><span>M</span></div></div>
          </article>
        </div>
        <div className="landing-section-heading"><h2>Expenses, shared plans, and repayments</h2><p>From your daily coffee to a weekend away, keep a record that makes sense.</p></div>
        <div className="landing-features">
          <article><div className="landing-feature-top"><span className="landing-feature-icon orange"><ReceiptText size={25} /></span></div><h3>Your everyday spending</h3><p>Record expenses, organize them by category, and see your monthly totals without connecting a bank account.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon purple"><Users size={25} /></span></div><h3>Shared plans, clear shares</h3><p>Split group expenses equally or choose custom amounts. Include friends who have not joined Paylet yet.</p></article>
          <article><div className="landing-feature-top"><span className="landing-feature-icon green"><ArrowDownLeft size={25} /></span></div><h3>Money between people</h3><p>Keep track of money lent, money borrowed, and repayments, with a separate record for each person.</p></article>
        </div>
      </section></div>
      <section className="landing-showcase" aria-labelledby="landing-showcase-title"><div className="landing-width"><div className="landing-section-heading"><h2 id="landing-showcase-title">Your month,<br />all accounted for</h2><p>Expenses, monthly totals, and shared plans, together in your dashboard.</p></div><DashboardPreview /></div></section>
      <section id="privacy" className="landing-privacy">
        <div className="landing-width landing-privacy-inner"><ShieldCheck size={36} className="landing-privacy-icon" /><div><h2>Share on your terms</h2><p>Joining a group or connecting with someone does not reveal your private lending history. You choose which loan or repayment entries to share, and you can stop sharing them.</p></div><button className="button button-purple" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Go to dashboard" : "Create your account"}<ArrowRight size={18} /></button></div>
      </section>
      <div className="landing-band landing-community-band"><Testimonials user={user} checking={checking} onLogin={onLogin} onChange={() => setCommunityRefresh((value) => value + 1)} /></div>
      <div className="landing-band landing-faq-band"><section className="landing-faq landing-width" aria-labelledby="landing-faq-title"><div><h2 id="landing-faq-title">Before you start</h2><p>Start with your own expenses. Bring your people along when you are ready.</p></div><div className="landing-questions">
        <details><summary>Do I need to connect my bank account?<Plus size={22} /></summary><p>No. Paylet records the expenses and money entries you add. It does not need your bank balance or banking credentials.</p></details>
        <details><summary>Can I include someone who does not use Paylet?<Plus size={22} /></summary><p>Yes. Add them to People and include them in a group split. If they join later, send a connection request using their username. They must accept before their account is connected.</p></details>
        <details><summary>Can Paylet show my monthly spending?<Plus size={22} /></summary><p>Yes. Your dashboard and reports show recorded expenses by month, with separate totals for each currency.</p></details>
      </div></section></div>
      <section className="landing-final-cta"><div className="landing-width"><Wallet size={32} className="landing-cta-icon" /><h2>Start with your next expense</h2><p>Start with one expense. Keep going from there.</p><button className="button button-primary" disabled={checking} onClick={user ? onDashboard : onRegister}>{user ? "Your dashboard awaits" : "Get started with Paylet"}<ArrowRight size={19} /></button></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-width landing-footer-main"><div><a className="brand" href="/"><BrandMark /><span>Paylet.</span></a><p>A clear record of your everyday money</p></div><nav aria-label="Footer navigation"><a href="#about"><Wallet size={16} /> About Paylet</a><a href="#privacy"><ShieldCheck size={16} /> Your privacy</a><button onClick={user ? onDashboard : onLogin}><BarChart3 size={16} /> {user ? "Dashboard" : "Log in"}</button></nav></div><div className="landing-width landing-footer-bottom"><span>&copy; 2026 Paylet. All rights reserved.</span></div></footer>
  </div>;
}
