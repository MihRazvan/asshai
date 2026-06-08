"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

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
    <div className="raw-tab">
      {sections.map((section) => {
        const text = stringify(section.body);
        const isOpen = Boolean(open[section.title]);

        return (
          <section className="raw-section" key={section.title}>
            <button type="button" onClick={() => setOpen((current) => ({ ...current, [section.title]: !isOpen }))}>
              <span>{section.title}</span>
              <em>{isOpen ? "collapse" : "expand"}</em>
            </button>
            {isOpen ? (
              <>
                <pre>{text}</pre>
                <button className="secondary-action" type="button" onClick={() => navigator.clipboard.writeText(text)}>
                  <Copy size={14} />
                  Copy
                </button>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
