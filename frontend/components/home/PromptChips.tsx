"use client";

import { BarChart3, Droplets, LineChart, Shield, Scale } from "lucide-react";

export const promptPresets = [
  { label: "Safest", prompt: "safest stablecoin yield, no lockup", amount: "1", Icon: Shield },
  { label: "Best yield", prompt: "find the highest available USDC yield, vaults are okay", amount: "1", Icon: LineChart },
  { label: "Balanced 6%+", prompt: "find me 6%+ if possible, but don't use sketchy pools", amount: "1", Icon: Scale },
  { label: "Prefer Aave", prompt: "park my USDC somewhere conservative, prefer established lending", amount: "1", Icon: Droplets },
  { label: "Prefer Compound", prompt: "find strong USDC yield, prefer blue-chip lending with better APY", amount: "1", Icon: BarChart3 },
];

export function PromptChips({ onSelect }: { onSelect: (prompt: string, amount: string) => void }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Prompt presets">
      {promptPresets.map(({ Icon, ...preset }) => (
        <button
          className="group inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 font-mono text-[0.56rem] uppercase tracking-[0.1em] text-white/42 transition-colors hover:border-white/[0.14] hover:bg-white/[0.045] hover:text-white/78"
          type="button"
          key={preset.label}
          onClick={() => onSelect(preset.prompt, preset.amount)}
        >
          <Icon className="size-2.5 text-white/32 transition-colors group-hover:text-white/68" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}
