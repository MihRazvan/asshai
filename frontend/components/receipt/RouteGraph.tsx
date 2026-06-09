"use client";

import { Check, ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { cn } from "@/lib/utils";

export type GraphStage = "pending" | "active" | "done" | "error";

type GraphNode = {
  id: string;
  label: string;
  meta: string;
  detail: string;
  logoPoolId?: string;
  state?: GraphStage;
};

function nodeStateClass(state: GraphStage | undefined) {
  const resolved = state ?? "pending";
  return cn(
    "relative z-10 grid min-h-28 w-full gap-1.5 rounded-xl border bg-white/[0.018] p-3.5 text-left transition-colors",
    resolved === "done" && "border-emerald-400/28",
    resolved === "active" && "border-white/[0.28] shadow-[0_0_2rem_rgba(247,244,235,0.08)]",
    resolved === "pending" && "border-white/[0.075]",
    resolved === "error" && "border-red-400/50",
  );
}

export function RouteGraph({
  sourceAmount,
  venueLabel,
  venuePoolId,
  positionSymbol,
  finalAmount,
  finalAssetValue,
  finalApy,
  states,
  onInspectNode,
}: {
  sourceAmount: string;
  venueLabel?: string;
  venuePoolId?: string;
  positionSymbol?: string;
  finalAmount?: string;
  finalAssetValue?: string;
  finalApy?: string;
  states?: Partial<Record<string, GraphStage>>;
  onInspectNode?: (node: GraphNode) => void;
}) {
  const nodes: GraphNode[] = [
    {
      id: "source",
      label: "Arbitrum USDC",
      meta: "chain: 42161",
      detail: `amount: ${sourceAmount} USDC`,
      logoPoolId: "usdc",
      state: states?.source ?? "done",
    },
    {
      id: "lifi",
      label: "LI.FI Composer",
      meta: "bridge route",
      detail: "quote + execute",
      state: states?.lifi ?? "pending",
    },
    {
      id: "base",
      label: "Base USDC",
      meta: "chain: 8453",
      detail: "delivered asset",
      logoPoolId: "usdc",
      state: states?.base ?? "pending",
    },
    {
      id: "venue",
      label: venueLabel ?? "Venue Pool",
      meta: "supply",
      detail: "selected by Somnia",
      logoPoolId: venuePoolId,
      state: states?.venue ?? "pending",
    },
    {
      id: "position",
      label: positionSymbol ?? "Position Token",
      meta: "position",
      detail: finalAssetValue
        ? `${finalAssetValue}${finalApy ? ` · ${finalApy}` : ""}${finalAmount ? ` · ${finalAmount}` : ""}`
        : finalAmount ?? "pending",
      logoPoolId: venuePoolId,
      state: states?.position ?? "pending",
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-5" role="img" aria-label="Compiled route graph">
      {nodes.map((node, index) => (
        <div className="relative flex min-w-0" key={node.id}>
          <button className={nodeStateClass(node.state)} type="button" onClick={() => onInspectNode?.(node)}>
            <span className="flex items-center justify-between">
              <span className="grid size-8 place-items-center rounded-full bg-white/[0.05] text-emerald-400">
              {node.state === "done" ? (
                <Check size={14} />
              ) : node.logoPoolId ? (
                <VenueLogo poolId={node.logoPoolId} label={node.label} size={24} />
              ) : (
                <ExternalLink size={14} />
              )}
              </span>
              <span className="font-mono text-xs text-white/28">{index + 1}</span>
            </span>
            <strong className="mt-2 font-serif text-lg font-normal leading-tight text-white">{node.label}</strong>
            <span className="font-mono text-xs text-white/42">{node.meta}</span>
            <em className="font-mono text-xs not-italic text-white/58">{node.detail}</em>
          </button>
          {index < nodes.length - 1 ? (
            <span
              className={cn(
                "pointer-events-none absolute left-full top-1/2 z-0 hidden h-px w-3 -translate-y-1/2 lg:block",
                nodes[index + 1].state === "done" ? "bg-emerald-400/45" : "bg-white/15",
              )}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
