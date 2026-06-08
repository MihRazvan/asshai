"use client";

import { ExternalLink } from "lucide-react";
import { RouteGraph } from "@/components/receipt/RouteGraph";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";

function shortHash(value?: string) {
  if (!value) return "pending";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function PlanTab({
  goalId,
  intentHash,
  sourceAmount,
  venueLabel,
  venuePoolId,
  positionSymbol,
  finalAmount,
  encodedIntent,
  onInspect,
}: {
  goalId: string;
  intentHash?: string;
  sourceAmount: string;
  venueLabel?: string;
  venuePoolId?: string;
  positionSymbol?: string;
  finalAmount?: string;
  encodedIntent?: string;
  onInspect: (payload: InspectorPayload) => void;
}) {
  return (
    <div className="plan-tab">
      <RouteGraph
        sourceAmount={sourceAmount}
        venueLabel={venueLabel}
        venuePoolId={venuePoolId}
        positionSymbol={positionSymbol}
        finalAmount={finalAmount}
        states={{ source: "done", lifi: "done", base: "done", venue: "done", position: finalAmount ? "done" : "active" }}
        onInspectNode={(node) => onInspect({ title: node.label, eyebrow: "plan node", body: node })}
      />
      <div className="graph-meta-strip">
        <span>Intent ID {goalId}</span>
        <span>Hash {shortHash(intentHash)}</span>
        <button type="button" onClick={() => onInspect({ title: "Encoded StandardOrder", body: encodedIntent ?? "0x" })}>
          Encoded StandardOrder
        </button>
        <a href={`https://shannon-explorer.somnia.network/address/${intentHash ?? ""}`} target="_blank" rel="noreferrer">
          View on Somnia explorer
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
