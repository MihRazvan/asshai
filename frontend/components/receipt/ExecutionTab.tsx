"use client";

import { ExternalLink } from "lucide-react";
import { RouteGraph, type GraphStage } from "@/components/receipt/RouteGraph";
import { Card } from "@/components/ui/card";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";
import type { AgentStep } from "@/lib/use-receipt-stream";

type Execution = {
  approvalHash?: string;
  routeHash?: string;
  lifiStatus?: string;
  isDone: boolean;
  finalAmount?: string;
  buttonState: string;
};

function shortHash(value?: string) {
  if (!value) return "pending";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function graphStates(execution: Execution): Partial<Record<string, GraphStage>> {
  if (execution.isDone) {
    return { source: "done", lifi: "done", base: "done", venue: "done", position: "done" };
  }

  if (execution.routeHash) {
    return { source: "done", lifi: "done", base: "active", venue: "pending", position: "pending" };
  }

  if (execution.approvalHash || execution.buttonState === "executing") {
    return { source: "done", lifi: "active", base: "pending", venue: "pending", position: "pending" };
  }

  return { source: "done", lifi: "pending", base: "pending", venue: "pending", position: "pending" };
}

export function ExecutionTab({
  sourceAmount,
  venueLabel,
  venuePoolId,
  positionSymbol,
  execution,
  steps,
  onInspect,
}: {
  sourceAmount: string;
  venueLabel?: string;
  venuePoolId?: string;
  positionSymbol?: string;
  execution: Execution;
  steps: AgentStep[];
  onInspect: (payload: InspectorPayload) => void;
}) {
  return (
    <Card className="gap-5 border-white/[0.1] bg-white/[0.025] p-5">
      {execution.isDone && execution.finalAmount ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 font-mono text-sm text-emerald-300">
          ✓ {execution.finalAmount} supplied to {venueLabel ?? "selected venue"}
        </div>
      ) : null}
      <div>
        <h2 className="font-serif text-2xl text-white">Execution trace</h2>
        <p className="mt-1 text-white/48">Source approval, LI.FI route, and destination supply progress in one path.</p>
      </div>
      <RouteGraph
        sourceAmount={sourceAmount}
        venueLabel={venueLabel}
        venuePoolId={venuePoolId}
        positionSymbol={positionSymbol}
        finalAmount={execution.finalAmount}
        states={graphStates(execution)}
        onInspectNode={(node) => onInspect({ title: node.label, eyebrow: "execution node", body: node })}
      />
      <section className="grid gap-2" aria-label="On-chain receipt tasks">
        {steps
          .filter((step) => step.status === "done")
          .map((step) => (
            <button
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-left text-white/65 hover:border-accent/30"
              type="button"
              key={step.id}
              onClick={() => onInspect({ title: step.stepName, eyebrow: "receipt log event", body: step })}
            >
              <span>{step.stepName}</span>
              <em className="font-mono text-xs not-italic text-white/36">request {step.requestId.toString()}</em>
              <ExternalLink size={13} />
            </button>
          ))}
        {execution.approvalHash ? (
          <a className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-white/65 hover:border-accent/30" href={`https://arbiscan.io/tx/${execution.approvalHash}`} target="_blank" rel="noreferrer">
            <span>Arbitrum approval</span>
            <em className="font-mono text-xs not-italic text-white/36">{shortHash(execution.approvalHash)}</em>
            <ExternalLink size={13} />
          </a>
        ) : null}
        {execution.routeHash ? (
          <a className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-white/65 hover:border-accent/30" href={`https://arbiscan.io/tx/${execution.routeHash}`} target="_blank" rel="noreferrer">
            <span>LI.FI route transaction</span>
            <em className="font-mono text-xs not-italic text-white/36">{shortHash(execution.routeHash)}</em>
            <ExternalLink size={13} />
          </a>
        ) : null}
      </section>
    </Card>
  );
}
