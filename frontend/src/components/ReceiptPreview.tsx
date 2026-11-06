import { ArrowUpRight, Check, ReceiptText } from "lucide-react";

const shares = [
  { name: "Asha", detail: "Own share · already covered", covered: true },
  { name: "Rahul", detail: "Owes Asha", covered: false },
  { name: "Neha", detail: "Owes Asha", covered: false },
  { name: "Arjun", detail: "Owes Asha", covered: false },
];
export default function ReceiptPreview() {
  return <figure className="receipt-preview sharing-preview" aria-label="Example of a 1,200 rupee group expense paid by Asha and split equally between four friends">
    <figcaption><ReceiptText size={17} aria-hidden="true"/>The weekend plan <span>Illustrative example</span></figcaption>
    <div className="sharing-payer"><div><span>Asha paid the bill</span><strong>₹ 1,200</strong></div><span className="sharing-division">4 people<br/><strong>₹ 300 each</strong></span></div>
    <div className="sharing-connector" aria-hidden="true"/>
    <div className="sharing-people">{shares.map((share,index) => <div className="receipt-share sharing-person" key={share.name} style={{ transitionDelay: `${index * 100}ms` }}><span className="receipt-initial" aria-hidden="true">{share.name[0]}</span><strong>{share.name}</strong><span>{share.detail}</span><strong className="sharing-amount">₹ 300</strong>{share.covered ? <Check size={16} aria-label="Share covered"/> : <ArrowUpRight size={16} aria-hidden="true"/>}</div>)}</div>
    <div className="sharing-summary"><strong>Asha receives ₹ 900</strong><span>₹ 300 from each of the other three friends.</span></div>
  </figure>;
}
