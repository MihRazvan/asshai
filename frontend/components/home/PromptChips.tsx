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
    <div className="flex flex-wrap gap-2" aria-label="Prompt presets">
      {promptPresets.map(({ Icon, ...preset }) => (
        <button
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.035] px-3 font-serif text-sm text-white/75 transition-colors hover:border-accent/35 hover:bg-accent/10 hover:text-white"
          type="button"
          key={preset.label}
          onClick={() => onSelect(preset.prompt, preset.amount)}
        >
          <Icon className="size-3.5 text-white/55" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}
