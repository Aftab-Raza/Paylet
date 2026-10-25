import { useState } from "react";
import { Minus, Plus, ReceiptText, Users } from "lucide-react";

const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);

export default function HeroSplitDemo() {
  const [amount, setAmount] = useState("1200");
  const [people, setPeople] = useState(4);
  const valid = /^\d{1,7}(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  const [whole = "0", fraction = ""] = amount.split(".");
  const minor = valid ? Number(whole) * 100 + Number(fraction.padEnd(2, "0")) : 0;
  const share = Math.floor(minor / people);
  const remainder = minor % people;
  return <div className="hero-split" role="group" aria-labelledby="hero-split-title">
    <div className="hero-split-heading"><strong id="hero-split-title"><ReceiptText size={16} /> Split the next bill</strong><span>Try it. Nothing is saved.</span></div>
    <div className="hero-split-fields"><label htmlFor="hero-bill">Bill amount <span>INR</span><input id="hero-bill" inputMode="decimal" value={amount} maxLength={10} onChange={(event) => setAmount(event.target.value)} aria-invalid={!valid} aria-describedby={!valid ? "hero-split-error" : undefined} /></label>
      <div><label htmlFor="hero-friends"><Users size={13} /> Friends, including you</label><div className="hero-split-stepper"><button type="button" title="Fewer friends" aria-label="Fewer friends" disabled={people <= 2} onClick={() => setPeople((value) => value - 1)}><Minus size={17} /></button><output id="hero-friends" aria-live="polite">{people}</output><button type="button" title="More friends" aria-label="More friends" disabled={people >= 12} onClick={() => setPeople((value) => value + 1)}><Plus size={17} /></button></div></div>
      <div className="hero-split-result" aria-live="polite" aria-atomic="true"><span>Each person's share</span><strong>{valid ? money(share) : "--"}</strong></div>
    </div>
    <p className="hero-split-note" id={!valid ? "hero-split-error" : undefined}>{!valid ? "Enter an amount from INR 0.01 to 99,99,999.99 (up to 2 decimals)." : remainder ? `${remainder} ${remainder === 1 ? "person pays" : "people pay"} ${money(share + 1)}; ${people - remainder} ${people - remainder === 1 ? "pays" : "pay"} ${money(share)}. Every paisa accounted for.` : "Equal shares. No awkward calculations."}</p>
  </div>;
}
