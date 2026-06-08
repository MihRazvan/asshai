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
    <button className="rejected-chiclet" type="button" onClick={onClick}>
      <VenueLogo poolId={venue?.poolId ?? "usdc"} label={label} size={28} />
      <span>
        <strong>{label}</strong>
        <em>{rate?.apy ? `${Number(rate.apy).toFixed(2)}% APY` : "APY unavailable"}</em>
      </span>
      <p>{reason}</p>
    </button>
  );
}
