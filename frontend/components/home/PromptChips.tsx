"use client";

export const promptPresets = [
  { label: "Safest", prompt: "safest stablecoin yield, no lockup", amount: "1" },
  { label: "Best yield", prompt: "find the highest available USDC yield, vaults are okay", amount: "1" },
  { label: "Balanced 6%+", prompt: "find me 6%+ if possible, but don't use sketchy pools", amount: "1" },
  { label: "Prefer Aave", prompt: "park my USDC somewhere conservative, prefer established lending", amount: "1" },
  { label: "Prefer Compound", prompt: "find strong USDC yield, prefer blue-chip lending with better APY", amount: "1" },
];

export function PromptChips({ onSelect }: { onSelect: (prompt: string, amount: string) => void }) {
  return (
    <div className="prompt-chip-row" aria-label="Prompt presets">
      {promptPresets.map((preset) => (
        <button type="button" key={preset.label} onClick={() => onSelect(preset.prompt, preset.amount)}>
          {preset.label}
        </button>
      ))}
    </div>
  );
}
