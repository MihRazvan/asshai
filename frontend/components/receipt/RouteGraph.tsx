"use client";

import { Check, ExternalLink } from "lucide-react";
import { VenueLogo } from "@/components/asshai/VenueLogo";

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
  return `route-node route-node-${state ?? "pending"}`;
}

export function RouteGraph({
  sourceAmount,
  venueLabel,
  venuePoolId,
  positionSymbol,
  finalAmount,
  states,
  onInspectNode,
}: {
  sourceAmount: string;
  venueLabel?: string;
  venuePoolId?: string;
  positionSymbol?: string;
  finalAmount?: string;
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
      meta: "final asset",
      detail: finalAmount ?? "pending",
      logoPoolId: venuePoolId,
      state: states?.position ?? "pending",
    },
  ];

  return (
    <div className="route-graph" role="img" aria-label="Compiled route graph">
      {nodes.map((node, index) => (
        <div className="route-graph-cell" key={node.id}>
          <button className={nodeStateClass(node.state)} type="button" onClick={() => onInspectNode?.(node)}>
            <span className="route-node-icon">
              {node.state === "done" ? (
                <Check size={14} />
              ) : node.logoPoolId ? (
                <VenueLogo poolId={node.logoPoolId} label={node.label} size={24} />
              ) : (
                <ExternalLink size={14} />
              )}
            </span>
            <strong>{node.label}</strong>
            <span>{node.meta}</span>
            <em>{node.detail}</em>
          </button>
          {index < nodes.length - 1 ? <span className={`route-edge route-edge-${nodes[index + 1].state ?? "pending"}`} /> : null}
        </div>
      ))}
    </div>
  );
}
