"use client";

import { ExternalLink } from "lucide-react";
import { RouteGraph, type GraphStage } from "@/components/receipt/RouteGraph";
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
    <div className="execution-tab">
      {execution.isDone && execution.finalAmount ? (
        <div className="execution-confirmation">✓ {execution.finalAmount} supplied to {venueLabel ?? "selected venue"}</div>
      ) : null}
      <RouteGraph
        sourceAmount={sourceAmount}
        venueLabel={venueLabel}
        venuePoolId={venuePoolId}
        positionSymbol={positionSymbol}
        finalAmount={execution.finalAmount}
        states={graphStates(execution)}
        onInspectNode={(node) => onInspect({ title: node.label, eyebrow: "execution node", body: node })}
      />
      <section className="task-list" aria-label="On-chain receipt tasks">
        {steps
          .filter((step) => step.status === "done")
          .map((step) => (
            <button
              className="task-row"
              type="button"
              key={step.id}
              onClick={() => onInspect({ title: step.stepName, eyebrow: "receipt log event", body: step })}
            >
              <span>{step.stepName}</span>
              <em>request {step.requestId.toString()}</em>
              <ExternalLink size={13} />
            </button>
          ))}
        {execution.approvalHash ? (
          <a className="task-row" href={`https://arbiscan.io/tx/${execution.approvalHash}`} target="_blank" rel="noreferrer">
            <span>Arbitrum approval</span>
            <em>{shortHash(execution.approvalHash)}</em>
            <ExternalLink size={13} />
          </a>
        ) : null}
        {execution.routeHash ? (
          <a className="task-row" href={`https://arbiscan.io/tx/${execution.routeHash}`} target="_blank" rel="noreferrer">
            <span>LI.FI route transaction</span>
            <em>{shortHash(execution.routeHash)}</em>
            <ExternalLink size={13} />
          </a>
        ) : null}
      </section>
    </div>
  );
}
