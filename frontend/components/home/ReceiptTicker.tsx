"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";

type TickerReceipt = {
  goalId: string;
  goal: string;
  poolId: string;
  venueLabel: string;
  objective?: string;
  apy?: string;
  age?: string;
};

export function ReceiptTicker({ receipts }: { receipts: (TickerReceipt | undefined)[] }) {
  return (
    <section className="receipt-ticker">
      <p className="section-kicker">Recently compiled receipts</p>
      <div className="ticker-track" tabIndex={0} aria-label="Recent receipts">
        {receipts.map((receipt) =>
          receipt ? (
            <Link className="ticker-card" key={receipt.goalId} href={`/intent/${receipt.goalId}`}>
              <VenueLogo poolId={receipt.poolId} label={receipt.venueLabel} size={30} />
              <strong>{receipt.goal}</strong>
              <ArrowRight size={14} />
              <span>{receipt.venueLabel}</span>
              {receipt.apy ? <em>{receipt.apy}% APY</em> : null}
              {receipt.objective ? <small>{receipt.objective}</small> : null}
              <time>{receipt.age ?? "recent"}</time>
              <ChevronRight size={14} />
            </Link>
          ) : null,
        )}
      </div>
    </section>
  );
}
