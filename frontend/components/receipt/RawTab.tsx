"use client";

import { useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type RawSection = {
  title: string;
  body: unknown;
};

function stringify(body: unknown) {
  if (typeof body === "string") return body;
  return JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
}

export function RawTab({ sections }: { sections: RawSection[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.018]">
      {sections.map((section) => {
        const text = stringify(section.body);
        const isOpen = Boolean(open[section.title]);

        return (
          <section className="border-b border-white/[0.06] last:border-b-0" key={section.title}>
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left font-mono text-sm text-white/72 transition-colors hover:bg-white/[0.025] hover:text-white"
              type="button"
              onClick={() => setOpen((current) => ({ ...current, [section.title]: !isOpen }))}
            >
              <span>{section.title}</span>
              <span className="inline-flex items-center gap-2 text-white/38">
                {isOpen ? "collapse" : "expand"}
                <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {isOpen ? (
              <>
                <pre className="max-h-[30rem] overflow-auto border-t border-white/[0.06] bg-black/20 p-4 font-mono text-xs leading-relaxed text-orange-200/90">
                  {text}
                </pre>
                <Button
                  className="m-3 h-8 rounded-lg border-white/[0.1] bg-transparent text-white/58 hover:bg-white/[0.04] hover:text-white"
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(text)}
                >
                  <Copy size={14} />
                  Copy
                </Button>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
