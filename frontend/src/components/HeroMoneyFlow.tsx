import { IndianRupee, ReceiptText, Users, Wallet } from "lucide-react";

export default function HeroMoneyFlow() {
  return <div className="hero-money-flow" aria-hidden="true">
    <svg className="hero-flow-lines" viewBox="0 0 1440 650" preserveAspectRatio="none" fill="none"><path d="M-60 440C150 30 240 680 480 460S800 150 1500 180"/><path d="M-80 140C200 410 270 30 470 140S1020 700 1500 430"/><path className="hero-flow-pulse" d="M-60 440C150 30 240 680 480 460S800 150 1500 180"/></svg>
    <span className="hero-flow-icon hero-flow-rupee"><IndianRupee/></span><span className="hero-flow-icon hero-flow-receipt"><ReceiptText/></span><span className="hero-flow-icon hero-flow-users"><Users/></span><span className="hero-flow-icon hero-flow-wallet"><Wallet/></span>
  </div>;
}
