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
    <div className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Prompt presets">
      {promptPresets.map(({ Icon, ...preset }) => (
        <button
          className="group inline-flex h-7 items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-white/44 transition-colors hover:text-white"
          type="button"
          key={preset.label}
          onClick={() => onSelect(preset.prompt, preset.amount)}
        >
          <Icon className="size-3.5 text-white/34 transition-colors group-hover:text-white" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}
