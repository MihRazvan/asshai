"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

type StoredIntent = {
  id: string;
  prompt?: string;
};

export default function HistoryPage() {
  const [items, setItems] = useState<StoredIntent[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]") as StoredIntent[];
      setItems(stored.filter((item) => item.id && /^\d+$/.test(item.id)));
    } catch {
      setItems([]);
    }
  }, []);

  return (
    <main className="page-shell utility-page">
      <section className="utility-header">
        <p className="eyebrow">Local history</p>
        <h1>Compiled intents</h1>
        <p>Recent intents saved in this browser. Each receipt links back to its on-chain proof.</p>
      </section>

      <section className="history-list" aria-label="Compiled intent history">
        {items.length === 0 ? (
          <div className="empty-cta">
            <h2>No local intents yet</h2>
            <p>Compile an intent and it will appear here.</p>
            <Link href="/">
              Compose intent
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : null}

        {items.map((item) => (
          <Link className="history-row" href={`/intent/${item.id}`} key={item.id}>
            <span>
              <strong>{item.prompt || `Intent ${item.id}`}</strong>
              <em>Intent {item.id}</em>
            </span>
            <ArrowRight size={17} />
          </Link>
        ))}
      </section>
    </main>
  );
}
