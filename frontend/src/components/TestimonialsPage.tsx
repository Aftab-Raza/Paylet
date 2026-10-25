import { ArrowLeft } from "lucide-react";
import type { User } from "../lib/api";
import Testimonials from "./Testimonials";
import ThemeToggle from "./ThemeToggle";

export default function TestimonialsPage({ user, checking, onLogin, onHome }: { user: User | null; checking: boolean; onLogin: () => void; onHome: () => void }) {
  return <div className="landing-page testimonials-page"><header className="landing-header"><div className="landing-header-inner landing-width"><a className="brand" href="/"><span className="brand-mark">P</span>Paylet</a><div className="testimonials-page-nav"><ThemeToggle /><button className="button button-outline" onClick={onHome}><ArrowLeft size={17} /> Home</button></div></div></header><main><Testimonials user={user} checking={checking} onLogin={onLogin} fullPage /></main></div>;
}
