"use client";

import { useMemo } from "react";
import { decodeAbiParameters, Hex } from "viem";
import { useReadContract } from "wagmi";
import { receiptLogAbi, receiptLogAddress } from "@/lib/contracts";
import { somniaTestnet } from "@/lib/somnia";

export type ReceiptStepName =
  | "rates_fetched"
  | "decision_built"
  | "candidates_selected"
  | "plan_built"
  | "order_encoded";

export type AgentStep = {
  id: string;
  stepName: ReceiptStepName;
  status: "pending" | "streaming" | "done";
  timestamp: number;
  payload: unknown;
  requestId: bigint;
};

const orderedSteps: ReceiptStepName[] = [
  "rates_fetched",
  "decision_built",
  "candidates_selected",
  "plan_built",
  "order_encoded",
];

function decodeReceiptPayload(stepName: string, data: Hex) {
  if (data === "0x") {
    return "";
  }

  if (stepName === "order_encoded") {
    return data;
  }

  try {
    const decoded = decodeAbiParameters([{ type: "string" }], data)[0];
    if (stepName === "decision_built" || stepName === "plan_built") {
      try {
        return JSON.parse(decoded) as unknown;
      } catch {
        return decoded;
      }
    }

    return decoded;
  } catch {
    return data;
  }
}

export function useReceiptStream(goalId: bigint, goalStatus?: number) {
  const isCompiling = goalStatus === 1;
  const { data: receipts } = useReadContract({
    address: receiptLogAddress,
    abi: receiptLogAbi,
    functionName: "getEntries",
    args: [goalId],
    chainId: somniaTestnet.id,
    query: { enabled: goalId >= 0n, refetchInterval: isCompiling ? 1_500 : false },
  });

  const steps = useMemo<AgentStep[]>(() => {
    const entries = receipts ?? [];
    const byStep = new Map(entries.map((entry) => [entry.stepName, entry]));
    const nextIndex = orderedSteps.findIndex((stepName) => !byStep.has(stepName));

    return orderedSteps.map((stepName, index) => {
      const entry = byStep.get(stepName);
      const streamingIndex = nextIndex === -1 ? orderedSteps.length : nextIndex;

      if (entry) {
        return {
          id: `${entry.stepName}-${entry.agentRequestId.toString()}`,
          stepName,
          status: "done",
          timestamp: Number(entry.timestamp),
          payload: decodeReceiptPayload(entry.stepName, entry.data as Hex),
          requestId: entry.agentRequestId,
        };
      }

      return {
        id: `${stepName}-virtual`,
        stepName,
        status: isCompiling && index === streamingIndex ? "streaming" : "pending",
        timestamp: 0,
        payload: undefined,
        requestId: 0n,
      };
    });
  }, [isCompiling, receipts]);

  return { receipts, steps };
}
