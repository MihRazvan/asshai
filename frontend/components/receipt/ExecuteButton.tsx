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
      className="min-h-14 w-full rounded-xl bg-gradient-to-b from-[#ffad55] via-accent to-accent-2 font-serif text-xl font-semibold text-[#120f0b] shadow-[0_1rem_3rem_rgba(255,122,26,0.22)] hover:from-[#ffb762] hover:to-[#f2652b]"
      type="button"
      disabled={disabled || isBusy || execution.buttonState === "done"}
      onClick={execution.executeIntent}
    >
      {buttonLabels[execution.buttonState]}
      {execution.buttonState === "done" ? <ExternalLink size={15} /> : null}
    </Button>
  );
}
