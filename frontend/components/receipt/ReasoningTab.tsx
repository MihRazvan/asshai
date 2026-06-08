"use client";

import { ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { RejectedChiclet } from "@/components/receipt/RejectedChiclet";
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
    <div className="reasoning-tab">
      <button
        className="tab-corner-link"
        type="button"
        onClick={() => onInspect({ title: "Decision JSON", eyebrow: "raw consensus output", body: decision ?? {} })}
      >
        View raw JSON
        <ExternalLink size={13} />
      </button>

      <article className="chosen-card">
        <div className="chosen-card-header">
          <VenueLogo poolId={selectedVenue?.poolId ?? "usdc"} label={selectedVenue?.label} size={50} />
          <div>
            <p>Chosen venue</p>
            <h2>{selectedVenue?.label ?? "Decision pending"}</h2>
          </div>
        </div>
        <div className="chosen-stat-row">
          <span>
            APY <strong>{selectedRate?.apy ? `${Number(selectedRate.apy).toFixed(2)}%` : "pending"}</strong>
          </span>
          <span>
            TVL <strong>{formatTvl(selectedRate?.tvlUsd)}</strong>
          </span>
          <span>
            Risk <strong>{selectedVenue?.riskTier ?? selectedRate?.riskTier ?? "pending"}</strong>
          </span>
          <span>
            Lockup <strong>{selectedRate?.lockup ?? "none"}</strong>
          </span>
          <span>
            Source <strong>DefiLlama</strong>
          </span>
        </div>
        <blockquote>{decision?.reasoning ?? "Waiting for the Somnia LLM consensus decision."}</blockquote>
      </article>

      <section className="rejected-grid" aria-label="Rejected alternatives">
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
