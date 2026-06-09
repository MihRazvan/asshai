"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { Badge } from "@/components/ui/badge";

type TickerReceipt = {
  goalId: string;
  goal: string;
  poolId?: string;
  venueLabel?: string;
  objective?: string;
  apy?: string;
  age?: string;
  status?: string;
};

export function ReceiptTicker({ receipts }: { receipts: (TickerReceipt | undefined)[] }) {
  const visibleReceipts = receipts.filter((receipt): receipt is TickerReceipt => Boolean(receipt));

  return (
    <section className="mx-auto mt-5 w-full max-w-[62rem]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/42">History</p>
        <Link className="inline-flex items-center gap-2 text-sm text-white/48 hover:text-white" href="/history">
          Local intents
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="overflow-hidden border-y border-white/[0.075]" tabIndex={0} aria-label="Intent history">
        {visibleReceipts.length === 0 ? (
          <div className="py-5 text-sm text-white/42">No local intent history yet. Compile an intent and it will appear here.</div>
        ) : null}
        {visibleReceipts.map((receipt) => (
          <Link key={receipt.goalId} href={`/intent/${receipt.goalId}`}>
            <article className="group grid gap-3 border-b border-white/[0.065] py-3 transition-colors last:border-b-0 hover:bg-white/[0.018] md:grid-cols-[minmax(0,1fr)_14rem_7rem] md:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {receipt.poolId ? (
                  <VenueLogo poolId={receipt.poolId} label={receipt.venueLabel} size={28} />
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/[0.1] font-mono text-[0.62rem] text-white/40">
                    {receipt.goalId}
                  </span>
                )}
                <div className="min-w-0">
                  <strong className="line-clamp-1 font-serif text-lg font-normal text-white/86">{receipt.goal}</strong>
                  <p className="mt-1 line-clamp-1 text-sm text-white/42">{receipt.venueLabel ?? "Awaiting compiler decision"}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 md:justify-end">
                <span className="flex min-w-0 items-center gap-3">
                  {receipt.apy ? <em className="shrink-0 font-mono text-sm not-italic text-white/62">{receipt.apy}% APY</em> : null}
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-300/80">{receipt.status ?? "Unknown"}</span>
                </span>
                {receipt.objective ? (
                  <Badge className="shrink-0 border-white/[0.1] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.68rem] text-white/50" variant="outline">
                    {receipt.objective}
                  </Badge>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-2 text-sm text-white/42 md:justify-end">
                {receipt.age ?? "recent"}
                <ExternalLink className="size-4 opacity-60 transition-opacity group-hover:opacity-100" />
              </span>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
