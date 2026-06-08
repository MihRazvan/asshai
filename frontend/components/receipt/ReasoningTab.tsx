"use client";

import { ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { RejectedChiclet } from "@/components/receipt/RejectedChiclet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";

type Venue = {
  poolId: string;
  label: string;
  riskTier: string;
};

type Rate = {
  poolId?: string;
  apy?: string;
  tvlUsd?: string;
  riskTier?: string;
  lockup?: string;
  project?: string;
  symbol?: string;
  [key: string]: string | undefined;
};

type Decision = {
  poolId?: string;
  objectiveMatched?: string;
  rejectedAlternatives?: { poolId?: string; reason?: string }[];
  reasoning?: string;
};

function formatTvl(value?: string) {
  const amount = Number(value ?? "0");
  if (!amount) return "unknown";
  if (amount > 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  return `$${amount.toLocaleString()}`;
}

export function ReasoningTab({
  selectedVenue,
  selectedRate,
  decision,
  venuesById,
  ratesById,
  onInspect,
}: {
  selectedVenue?: Venue;
  selectedRate?: Rate;
  decision?: Decision;
  venuesById: Map<string, Venue>;
  ratesById: Map<string, Rate>;
  onInspect: (payload: InspectorPayload) => void;
}) {
  const rejectedAlternatives = (decision?.rejectedAlternatives ?? []).filter((alternative) => alternative.poolId);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Why this venue was selected</h2>
          <p className="mt-1 text-white/48">Asshai compared verified venues and kept the decision auditable.</p>
        </div>
        <Button
          className="h-9 rounded-lg border-white/[0.1] bg-transparent text-white/58 hover:bg-white/[0.04] hover:text-white"
          type="button"
          variant="outline"
          onClick={() => onInspect({ title: "Decision JSON", eyebrow: "raw consensus output", body: decision ?? {} })}
        >
          View raw JSON
          <ExternalLink size={13} />
        </Button>
      </div>

      <Card className="grid gap-5 border-emerald-400/35 bg-[radial-gradient(circle_at_0%_0%,rgba(63,185,127,0.1),transparent_22rem),rgba(247,244,235,0.025)] p-5 md:grid-cols-[1fr_1.3fr]">
        <div className="flex items-start gap-4">
          <VenueLogo poolId={selectedVenue?.poolId ?? "usdc"} label={selectedVenue?.label} size={58} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-white/42">Chosen venue</p>
              <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300" variant="outline">
                Best match
              </Badge>
            </div>
            <h3 className="mt-2 font-serif text-[clamp(2rem,4vw,3.4rem)] leading-[0.95] tracking-[-0.04em] text-white">
              {selectedVenue?.label ?? "Decision pending"}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="border-white/[0.12] bg-white/[0.04] font-mono text-white/70" variant="outline">
                APY {selectedRate?.apy ? `${Number(selectedRate.apy).toFixed(2)}%` : "pending"}
              </Badge>
              <Badge className="border-white/[0.12] bg-white/[0.04] font-mono text-white/70" variant="outline">
                TVL {formatTvl(selectedRate?.tvlUsd)}
              </Badge>
              <Badge className="border-emerald-400/20 bg-emerald-400/10 font-mono text-emerald-300" variant="outline">
                Risk {selectedVenue?.riskTier ?? selectedRate?.riskTier ?? "pending"}
              </Badge>
              <Badge className="border-white/[0.12] bg-white/[0.04] font-mono text-white/70" variant="outline">
                Lockup {selectedRate?.lockup ?? "none"}
              </Badge>
            </div>
          </div>
        </div>

        <blockquote className="self-center border-l border-accent/45 pl-5 font-serif text-[clamp(1.35rem,2.3vw,2rem)] leading-snug text-white/80">
          {decision?.reasoning ?? "Waiting for the Somnia LLM consensus decision."}
        </blockquote>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Rejected alternatives">
        {rejectedAlternatives.map((alternative) => {
          const poolId = alternative.poolId ?? "";
          const venue = venuesById.get(poolId);
          const rate = ratesById.get(poolId);

          return (
            <RejectedChiclet
              key={`${poolId}-${alternative.reason}`}
              venue={venue}
              rate={rate}
              reason={alternative.reason ?? "Rejected by consensus decision"}
              onClick={() =>
                onInspect({
                  title: venue?.label ?? poolId,
                  eyebrow: "rejected alternative",
                  body: {
                    reason: alternative.reason,
                    venue,
                    rates: rate,
                    chosen: selectedVenue,
                    decision,
                  },
                })
              }
            />
          );
        })}
      </section>
    </div>
  );
}
