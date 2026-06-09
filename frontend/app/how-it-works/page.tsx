import Link from "next/link";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    title: "Describe an outcome",
    body: "Write a fuzzy USDC yield goal. Asshai keeps v1 bounded to verified Base venues and Arbitrum USDC input.",
  },
  {
    title: "Compile on Somnia",
    body: "Somnia agents fetch venue data, ask the LLM to choose, and store receipts for every reasoning step.",
  },
  {
    title: "Execute through LI.FI",
    body: "The selected route becomes an executable plan. LI.FI Composer handles the bridge and destination supply.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="page-shell utility-page">
      <section className="utility-header">
        <p className="eyebrow">How it works</p>
        <h1>From goal to position</h1>
        <p>Asshai is not a solver. It is the compiler layer that turns intent text into an auditable route.</p>
      </section>

      <section className="how-grid">
        {steps.map((step, index) => (
          <article className="how-card" key={step.title}>
            <span>{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </article>
        ))}
      </section>

      <Link className="utility-link" href="/">
        Compile an intent
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}
