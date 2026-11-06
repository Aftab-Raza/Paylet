import { IndianRupee, ReceiptText, Users } from "lucide-react";

export default function HeroMoneyFlow() {
  return <div className="hero-money-ribbons" aria-hidden="true">
    <svg className="money-ribbon-lines" viewBox="0 0 1600 700" preserveAspectRatio="none" fill="none">
      <path d="M-100 90C140 170 230 300 490 350M-100 610C140 530 230 400 490 350M1700 90C1460 170 1370 300 1110 350M1700 610C1460 530 1370 400 1110 350"/>
      <path className="money-ribbon-transfer" d="M-100 90C140 170 230 300 490 350M1700 610C1460 530 1370 400 1110 350"/>
    </svg>
    <span className="money-ribbon-icon money-ribbon-receipt"><ReceiptText size={24}/></span>
    <span className="money-ribbon-icon money-ribbon-people"><Users size={24}/></span>
    <span className="money-ribbon-icon money-ribbon-rupee"><IndianRupee size={20}/></span>
  </div>;
}
