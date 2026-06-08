"use client";

import { ExternalLink } from "lucide-react";
import type { useExecuteIntent } from "@/lib/use-execute-intent";

type ExecutionController = ReturnType<typeof useExecuteIntent>;

const buttonLabels: Record<ExecutionController["buttonState"], string> = {
  default: "Execute intent",
  quoting: "Requesting quote...",
  switching: "Switching to Arbitrum...",
  confirming: "Confirm in wallet...",
  executing: "Executing on-chain...",
  done: "Executed → view position",
};

export function ExecuteButton({ execution, disabled }: { execution: ExecutionController; disabled?: boolean }) {
  const isBusy = ["quoting", "switching", "confirming", "executing"].includes(execution.buttonState);

  return (
    <button
      className="execute-intent-button"
      type="button"
      disabled={disabled || isBusy || execution.buttonState === "done"}
      onClick={execution.executeIntent}
    >
      {buttonLabels[execution.buttonState]}
      {execution.buttonState === "done" ? <ExternalLink size={15} /> : null}
    </button>
  );
}
