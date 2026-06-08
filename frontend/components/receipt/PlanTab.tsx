"use client";

import { ExternalLink } from "lucide-react";
import { RouteGraph } from "@/components/receipt/RouteGraph";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card className="gap-5 border-white/[0.1] bg-white/[0.025] p-5">
      <div>
        <h2 className="font-serif text-2xl text-white">Compiled route plan</h2>
        <p className="mt-1 text-white/48">A deterministic StandardOrder-shaped path built from registry-verified addresses.</p>
      </div>
      <RouteGraph
        sourceAmount={sourceAmount}
        venueLabel={venueLabel}
        venuePoolId={venuePoolId}
        positionSymbol={positionSymbol}
        finalAmount={finalAmount}
        states={{ source: "done", lifi: "done", base: "done", venue: "done", position: finalAmount ? "done" : "active" }}
        onInspectNode={(node) => onInspect({ title: node.label, eyebrow: "plan node", body: node })}
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4 font-mono text-xs text-white/42">
        <span>Intent ID {goalId}</span>
        <span>Hash {shortHash(intentHash)}</span>
        <Button
          className="h-8 rounded-lg border-white/[0.1] bg-transparent text-white/58 hover:bg-white/[0.04] hover:text-white"
          type="button"
          variant="outline"
          onClick={() => onInspect({ title: "Encoded StandardOrder", body: encodedIntent ?? "0x" })}
        >
          Encoded StandardOrder
        </Button>
        <Button
          asChild
          className="h-8 rounded-lg border-white/[0.1] bg-transparent text-white/58 hover:bg-white/[0.04] hover:text-white"
          variant="outline"
        >
        <a href={`https://shannon-explorer.somnia.network/address/${intentHash ?? ""}`} target="_blank" rel="noreferrer">
          View on Somnia explorer
          <ExternalLink size={13} />
        </a>
        </Button>
      </div>
    </Card>
  );
}
