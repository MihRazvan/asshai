"use client";

import { Copy, ExternalLink, Share2 } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { ExecuteButton } from "@/components/receipt/ExecuteButton";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";
import type { useExecuteIntent } from "@/lib/use-execute-intent";

type Venue = {
  poolId: string;
  label: string;
  riskTier: string;
  positionTokenSymbol: string;
  positionTokenAddress: string;
};

type Rate = {
  apy?: string;
  tvlUsd?: string;
  lockup?: string;
};

type Decision = {
  objectiveMatched?: string;
  reasoning?: string;
};

function shortHash(value?: string) {
  if (!value) return "pending";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatApy(value?: string) {
  return value ? `${Number(value).toFixed(2)}% APY` : "APY pending";
}

export function HeroBand({
  goalId,
  goalText,
  intentHash,
  selectedVenue,
  selectedRate,
  decision,
  execution,
  onInspect,
}: {
  goalId: string;
  goalText: string;
  intentHash?: string;
  selectedVenue?: Venue;
  selectedRate?: Rate;
  decision?: Decision;
  execution: ReturnType<typeof useExecuteIntent>;
  onInspect: (payload: InspectorPayload) => void;
}) {
  const settledCopy =
    execution.isDone && execution.finalAmount && selectedVenue
      ? `${execution.finalAmount} supplied to ${selectedVenue.label} · view position →`
      : undefined;

  return (
    <section className="receipt-hero-band">
      <div className="hero-venue-block">
        <VenueLogo poolId={selectedVenue?.poolId ?? "usdc"} label={selectedVenue?.label} size={42} />
        <div>
          <p>{selectedVenue?.label ?? "Venue pending"}</p>
          <span>{formatApy(selectedRate?.apy)}</span>
        </div>
        <em>{selectedVenue?.riskTier ?? "risk pending"}</em>
        <em>{selectedRate?.lockup ?? "no lockup"}</em>
      </div>

      <blockquote>{decision?.reasoning ?? "Somnia validators are compiling the consensus decision."}</blockquote>

      <div className="hero-meta-row">
        <span title={goalText}>{goalText || "Loading prompt..."}</span>
        <strong>{decision?.objectiveMatched ?? "compiling"}</strong>
        <span>Intent {goalId}</span>
        <button type="button" onClick={() => onInspect({ title: "Intent hash", body: intentHash ?? "pending" })}>
          {shortHash(intentHash)}
        </button>
        <span className="consensus-chip">3/3 Somnia consensus</span>
        <button type="button" onClick={() => onInspect({ title: "Raw metadata", body: { goalId, intentHash, goalText } })}>
          View raw
        </button>
        <button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>
          <Copy size={13} />
          Copy URL
        </button>
        <button
          type="button"
          onClick={() =>
            navigator.share?.({ title: "Asshai intent receipt", url: window.location.href }).catch(() => undefined)
          }
        >
          <Share2 size={13} />
          Share
        </button>
      </div>

      <div className="hero-cta-slot">
        {settledCopy ? (
          <a className="settled-position-link" href={`https://basescan.org/address/${selectedVenue?.positionTokenAddress ?? ""}`}>
            {settledCopy}
            <ExternalLink size={15} />
          </a>
        ) : (
          <ExecuteButton execution={execution} disabled={!selectedVenue} />
        )}
      </div>
    </section>
  );
}
