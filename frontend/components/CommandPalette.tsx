"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { promptPresets } from "@/components/home/PromptChips";

type RecentIntent = {
  id: string;
  prompt?: string;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentIntent[]>([]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    try {
      setRecent(JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]"));
    } catch {
      setRecent([]);
    }
  }, [open]);

  function closeAndRun(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Asshai command palette">
      <Command.Input placeholder="Search intents, presets, actions..." />
      <Command.List>
        <Command.Empty>No command found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => closeAndRun(() => router.push("/"))}>Compile new intent</Command.Item>
          <Command.Item
            onSelect={() =>
              closeAndRun(() => {
                const url = window.prompt("Paste a receipt URL or intent ID");
                const id = url?.match(/intent\/(\d+)/)?.[1] ?? url?.match(/^\d+$/)?.[0];
                if (id) router.push(`/intent/${id}`);
              })
            }
          >
            Paste a receipt URL
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Prompt presets">
          {promptPresets.map((preset) => (
            <Command.Item
              key={preset.label}
              onSelect={() =>
                closeAndRun(() => {
                  router.push(`/?prompt=${encodeURIComponent(preset.prompt)}&amount=${encodeURIComponent(preset.amount)}`);
                })
              }
            >
              {preset.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Recent intents">
          {recent.slice(0, 5).map((item) => (
            <Command.Item key={item.id} onSelect={() => closeAndRun(() => router.push(`/intent/${item.id}`))}>
              Intent {item.id}
              {item.prompt ? ` · ${item.prompt}` : ""}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
