"use client";

import { ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const rows = [
    selectedVenue
      ? {
          poolId: selectedVenue.poolId,
          venue: selectedVenue,
          rate: selectedRate,
          reason: decision?.reasoning ?? "Selected by consensus decision.",
          selected: true,
        }
      : undefined,
    ...rejectedAlternatives.map((alternative) => {
      const poolId = alternative.poolId ?? "";
      return {
        poolId,
        venue: venuesById.get(poolId),
        rate: ratesById.get(poolId),
        reason: alternative.reason ?? "Rejected by consensus decision",
        selected: false,
      };
    }),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Decision basis</h2>
          <p className="mt-1 text-sm text-white/42">Verified venue data, consensus decision, deterministic allowlist validation.</p>
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

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.018]" aria-label="Venue comparison">
        {rows.map((row) => (
          <button
            className={`grid w-full gap-4 border-b border-white/[0.06] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.025] md:grid-cols-[minmax(14rem,1.1fr)_7rem_8rem_minmax(0,1.3fr)] md:items-center ${
              row?.selected ? "bg-emerald-400/[0.035]" : ""
            }`}
            key={`${row?.poolId}-${row?.reason}`}
            type="button"
            onClick={() =>
              onInspect({
                title: row?.venue?.label ?? row?.poolId ?? "Venue",
                eyebrow: row?.selected ? "selected venue" : "rejected alternative",
                body: {
                  reason: row?.reason,
                  venue: row?.venue,
                  rates: row?.rate,
                  chosen: selectedVenue,
                  decision,
                },
              })
            }
          >
            <span className="flex min-w-0 items-center gap-3">
              <VenueLogo poolId={row?.venue?.poolId ?? "usdc"} label={row?.venue?.label} size={34} />
              <span className="min-w-0">
                <span className={`block truncate font-serif text-xl leading-tight ${row?.selected ? "text-white" : "text-white/58"}`}>
                  {row?.venue?.label ?? row?.poolId ?? "Unknown venue"}
                </span>
                <span className="mt-1 flex flex-wrap gap-2">
                  {row?.selected ? (
                    <Badge className="border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 font-mono text-[0.68rem] text-emerald-300" variant="outline">
                      selected
                    </Badge>
                  ) : (
                    <Badge className="border-white/[0.1] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.68rem] text-white/42" variant="outline">
                      rejected
                    </Badge>
                  )}
                  <span className="font-mono text-[0.72rem] text-white/36">{row?.venue?.riskTier ?? row?.rate?.riskTier ?? "risk unknown"}</span>
                </span>
              </span>
            </span>
            <span className="font-mono text-sm text-white/68">
              {row?.rate?.apy ? `${Number(row.rate.apy).toFixed(2)}% APY` : "APY unknown"}
            </span>
            <span className="font-mono text-sm text-white/42">TVL {formatTvl(row?.rate?.tvlUsd)}</span>
            <span className={`text-sm leading-snug ${row?.selected ? "text-white/74" : "text-white/46"}`}>{row?.reason}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
