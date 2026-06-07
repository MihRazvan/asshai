import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { VenueLogo } from "./VenueLogo";

type ReceiptCardProps = {
  goalId: string;
  goal: string;
  poolId: string;
  venueLabel: string;
  apy?: string;
  objective?: string;
  age?: string;
};

function objectiveClass(objective?: string) {
  if (objective === "safety") return "objective-pill objective-safety";
  if (objective === "fallback") return "objective-pill objective-fallback";
  return "objective-pill objective-matched";
}

export function ReceiptCard({ goalId, goal, poolId, venueLabel, apy, objective, age }: ReceiptCardProps) {
  return (
    <Link className="receipt-row" href={`/intent/${goalId}`}>
      <VenueLogo poolId={poolId} label={venueLabel} size={36} />
      <span className="receipt-goal">{goal}</span>
      <span className="receipt-arrow">-&gt;</span>
      <span className="receipt-venue">
        {venueLabel}
        {apy ? <span className="receipt-apy"> · {apy}% APY</span> : null}
      </span>
      {objective ? <span className={objectiveClass(objective)}>{objective}</span> : null}
      {age ? <span className="receipt-age">{age}</span> : null}
      <ChevronRight className="receipt-chevron" size={18} />
    </Link>
  );
}
