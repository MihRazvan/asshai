import Link from "next/link";
import { ArrowRight, Braces, BrainCircuit, Route, ShieldCheck } from "lucide-react";

const steps = [
  {
    title: "Goal",
    body: "A fuzzy request like safest stablecoin yield or highest USDC return.",
    Icon: Braces,
  },
  {
    title: "Consensus",
    body: "Somnia agents fetch rates and produce the auditable decision receipt.",
    Icon: BrainCircuit,
  },
  {
    title: "Route",
    body: "Solidity validates the venue and builds an executable LI.FI Composer plan.",
    Icon: Route,
  },
  {
    title: "Proof",
    body: "The final receipt links the reasoning, route transaction, and acquired position.",
    Icon: ShieldCheck,
  },
];

export default function HowItWorksPage() {
  return (
    <main className="page-shell utility-page centered-utility">
      <section className="utility-header centered">
        <p className="eyebrow">How it works</p>
        <h1>From goal to position</h1>
      </section>

      <section className="how-flow" aria-label="Asshai compilation flow">
        {steps.map((step, index) => (
          <article className="how-card" key={step.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <step.Icon size={24} />
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </article>
        ))}
      </section>

      <section className="how-proof-card">
        <div>
          <p>Asshai compiles, LI.FI executes</p>
          <h2>Reasoning stays visible. Funds stay in your wallet until execution.</h2>
        </div>
        <div className="proof-rail" aria-hidden="true">
          <span>intent</span>
          <span>rates</span>
          <span>decision</span>
          <span>route</span>
          <span>receipt</span>
        </div>
      </section>

      <Link className="utility-link" href="/">
        Compile an intent
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}
