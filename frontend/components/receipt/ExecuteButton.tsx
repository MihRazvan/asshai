"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <Button
      className="min-h-14 w-full rounded-xl border border-white/[0.12] bg-[#f7f4eb] font-serif text-xl font-semibold text-[#080807] shadow-[0_1rem_3rem_rgba(247,244,235,0.08)] hover:bg-white disabled:bg-white/[0.06] disabled:text-white/34"
      type="button"
      disabled={disabled || isBusy || execution.buttonState === "done"}
      onClick={execution.executeIntent}
    >
      {buttonLabels[execution.buttonState]}
      {execution.buttonState === "done" ? <ExternalLink size={15} /> : null}
    </Button>
  );
}
