"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
    <section className="mx-auto mt-5 w-full max-w-[62rem]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-accent/85">Recently compiled intents</p>
        <Link className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white" href="/">
          View all
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3" tabIndex={0} aria-label="Recent receipts">
        {receipts.map((receipt) =>
          receipt ? (
            <Link key={receipt.goalId} href={`/intent/${receipt.goalId}`}>
              <Card className="group min-h-30 gap-0 border-white/[0.1] bg-white/[0.035] p-3.5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <VenueLogo poolId={receipt.poolId} label={receipt.venueLabel} size={30} />
                  {receipt.objective ? (
                    <Badge className="border-accent/25 bg-accent/10 font-mono text-accent" variant="outline">
                      {receipt.objective}
                    </Badge>
                  ) : null}
                </div>
                <strong className="mt-3 line-clamp-1 font-serif text-lg font-normal text-white">{receipt.goal}</strong>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm text-white/54">
                  <span className="line-clamp-1">{receipt.venueLabel}</span>
                  {receipt.apy ? <em className="shrink-0 not-italic">{receipt.apy}% APY</em> : null}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3 text-sm">
                  <span className="text-emerald-400">● Executed</span>
                  <span className="inline-flex items-center gap-2 text-white/55">
                    {receipt.age ?? "recent"}
                    <ExternalLink className="size-4 opacity-70 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
              </Card>
            </Link>
          ) : null,
        )}
      </div>
    </section>
  );
}
