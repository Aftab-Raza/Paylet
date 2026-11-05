import { Check, ReceiptText } from "lucide-react";

const shares = [
  { name: "Asha", detail: "Your share", covered: true },
  { name: "Rahul", detail: "Owes Asha", covered: false },
  { name: "Neha", detail: "Owes Asha", covered: false },
  { name: "Arjun", detail: "Owes Asha", covered: false },
];

export default function ReceiptPreview() {
  return (
    <figure className="receipt-preview" aria-label="Example of a 1,200 rupee group expense paid by Asha and split equally between four friends">
      <figcaption>Paylet / Shared expense <span>Illustrative example</span></figcaption>
      <div className="receipt-document">
        <div className="receipt-topline"><ReceiptText size={18}/><span>The weekend plan</span></div>
        <div className="receipt-total"><span>Dinner with friends</span><strong>₹ 1,200<span>.00</span></strong></div>
        <div className="receipt-payer"><span>Paid by Asha</span><span>Equal split · 4 people</span></div>
        <div className="receipt-shares">
          {shares.map((share, index) => (
            <div className="receipt-share" key={share.name} style={{ transitionDelay: `${240 + index * 100}ms` }}>
              <span className="receipt-initial" aria-hidden="true">{share.name[0]}</span>
              <div><strong>{share.name}</strong><span>{share.detail}</span></div>
              <strong>₹ 300</strong>
              {share.covered && <Check size={16} aria-label="Share covered"/>}
            </div>
          ))}
        </div>
        <p className="receipt-footnote">₹ 300 each. Every share accounted for.</p>
      </div>
    </figure>
  );
}
