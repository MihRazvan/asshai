"use client";

import { CheckCircle2, Copy, ExternalLink, Eye, Share2 } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { ExecuteButton } from "@/components/receipt/ExecuteButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

function formatTvl(value?: string) {
  const amount = Number(value ?? "0");
  if (!amount) return "TVL pending";
  if (amount > 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M TVL`;
  return `$${amount.toLocaleString()} TVL`;
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
  const statusCopy = execution.isDone ? "Executed" : "Ready";

  if (settledCopy && selectedVenue) {
    return (
      <section className="mx-auto w-full max-w-[72rem]">
        <a
          className="group flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.055] px-5 py-4 text-emerald-200 shadow-[0_1.4rem_4rem_rgba(0,0,0,0.2)] transition-colors hover:border-emerald-300/30 hover:bg-emerald-400/[0.075]"
          href={`https://basescan.org/address/${selectedVenue.positionTokenAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-300" />
            <span className="truncate font-serif text-[clamp(1.1rem,2vw,1.55rem)] leading-tight text-emerald-100">
              {settledCopy}
            </span>
          </span>
          <ExternalLink className="size-4 shrink-0 text-emerald-200/70 transition-transform group-hover:translate-x-0.5" />
        </a>
      </section>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-[72rem] overflow-hidden border-white/[0.1] bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.055),transparent_30rem),rgba(7,8,8,0.82)] p-0 shadow-[0_1.5rem_6rem_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/42">
            <span className="text-white/58">On-chain intent compiler</span>
            <span className="text-white/18">/</span>
            <span className={execution.isDone ? "text-emerald-300" : "text-white/54"}>{statusCopy}</span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <VenueLogo poolId={selectedVenue?.poolId ?? "usdc"} label={selectedVenue?.label} size={50} />
            <div>
              <h1 className="font-serif text-[clamp(2.2rem,4.5vw,4.25rem)] leading-[0.92] tracking-[-0.055em] text-white">
                {selectedVenue?.label ?? "Venue pending"}
              </h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className="border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-white/70" variant="outline">
                  APY <span className="ml-2 text-emerald-400">{formatApy(selectedRate?.apy).replace(" APY", "")}</span>
                </Badge>
                <Badge className="border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-white/70" variant="outline">
                  {formatTvl(selectedRate?.tvlUsd)}
                </Badge>
                <Badge className="border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-emerald-300" variant="outline">
                  Risk {selectedVenue?.riskTier ?? "pending"}
                </Badge>
                <Badge className="border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-white/70" variant="outline">
                  Lockup {selectedRate?.lockup ?? "none"}
                </Badge>
              </div>
            </div>
          </div>

          <p className="mt-5 flex max-w-3xl items-start gap-3 font-serif text-[clamp(1.2rem,2vw,1.7rem)] leading-snug text-white/82">
            <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-400" />
            {decision?.reasoning ?? "Somnia validators are compiling the consensus decision."}
          </p>
        </div>

        <aside className="flex flex-col justify-between gap-4 border-white/[0.09] lg:border-l lg:pl-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/42">Original intent</p>
            <p className="mt-3 max-w-sm font-serif text-lg leading-snug text-white/76">
              {goalText || "Loading prompt..."}
            </p>
          </div>

          {settledCopy ? (
            <a
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-center font-mono text-sm text-emerald-300"
              href={`https://basescan.org/address/${selectedVenue?.positionTokenAddress ?? ""}`}
            >
              {settledCopy}
              <ExternalLink size={15} />
            </a>
          ) : (
            <ExecuteButton execution={execution} disabled={!selectedVenue} />
          )}

          <div className="flex flex-wrap gap-2 text-sm text-white/48">
            <Button
              className="h-8 rounded-lg border-white/[0.1] bg-transparent px-2.5 text-white/55 hover:bg-white/[0.04] hover:text-white"
              type="button"
              variant="outline"
              onClick={() => onInspect({ title: "Raw metadata", body: { goalId, intentHash, goalText } })}
            >
              <Eye size={14} />
              View raw
            </Button>
            <Button
              className="h-8 rounded-lg border-white/[0.1] bg-transparent px-2.5 text-white/55 hover:bg-white/[0.04] hover:text-white"
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(window.location.href)}
            >
              <Copy size={14} />
              Copy URL
            </Button>
            <Button
              className="h-8 rounded-lg border-white/[0.1] bg-transparent px-2.5 text-white/55 hover:bg-white/[0.04] hover:text-white"
              type="button"
              variant="outline"
              onClick={() =>
                navigator.share?.({ title: "Asshai intent receipt", url: window.location.href }).catch(() => undefined)
              }
            >
              <Share2 size={14} />
              Share
            </Button>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] px-5 py-2.5 font-mono text-[0.72rem] text-white/42 lg:px-6">
        <strong className="text-white/64">{decision?.objectiveMatched ?? "compiling"}</strong>
        <span>Intent {goalId}</span>
        <button className="rounded-md border border-white/[0.09] px-2 py-1" type="button" onClick={() => onInspect({ title: "Intent hash", body: intentHash ?? "pending" })}>
          {shortHash(intentHash)}
        </button>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">3/3 Somnia consensus</span>
      </div>
    </Card>
  );
}
