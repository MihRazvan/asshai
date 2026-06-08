"use client";

import { VenueLogo } from "@/components/asshai/VenueLogo";

type Venue = {
  poolId: string;
  label: string;
};

type Rate = {
  apy?: string;
  tvlUsd?: string;
  riskTier?: string;
  lockup?: string;
};

export function RejectedChiclet({
  venue,
  rate,
  reason,
  onClick,
}: {
  venue?: Venue;
  rate?: Rate;
  reason: string;
  onClick: () => void;
}) {
  const label = venue?.label ?? "Unknown venue";

  return (
    <button
      className="group min-h-36 rounded-xl border border-white/[0.09] bg-white/[0.025] p-4 text-left transition-colors hover:border-accent/35 hover:bg-accent/[0.04]"
      type="button"
      onClick={onClick}
    >
      <VenueLogo poolId={venue?.poolId ?? "usdc"} label={label} size={28} />
      <div className="mt-3">
        <strong className="line-clamp-2 font-serif text-xl font-normal leading-tight text-white/58 line-through decoration-red-400/50">
          {label}
        </strong>
        <em className="mt-1 block font-mono text-sm not-italic text-white/38">
          {rate?.apy ? `${Number(rate.apy).toFixed(2)}% APY` : "APY unavailable"}
        </em>
      </div>
      <p className="mt-4 border-t border-white/[0.08] pt-3 text-sm leading-snug text-white/58">{reason}</p>
    </button>
  );
}
