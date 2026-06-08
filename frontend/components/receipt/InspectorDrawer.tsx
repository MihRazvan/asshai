"use client";

import { Drawer } from "vaul";
import { Copy, X } from "lucide-react";

export type InspectorPayload = {
  title: string;
  eyebrow?: string;
  body: unknown;
};

function stringify(body: unknown) {
  if (typeof body === "string") return body;
  return JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
}

export function InspectorDrawer({
  payload,
  onClose,
}: {
  payload: InspectorPayload | undefined;
  onClose: () => void;
}) {
  const text = payload ? stringify(payload.body) : "";

  return (
    <Drawer.Root open={Boolean(payload)} onOpenChange={(open) => !open && onClose()} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="inspector-overlay" />
        <Drawer.Content className="inspector-drawer" aria-describedby={undefined}>
          <div className="inspector-header">
            <div>
              {payload?.eyebrow ? <p>{payload.eyebrow}</p> : null}
              <Drawer.Title>{payload?.title ?? "Inspector"}</Drawer.Title>
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close inspector">
              <X size={15} />
            </button>
          </div>
          <pre>{text}</pre>
          <button className="secondary-action" type="button" onClick={() => navigator.clipboard.writeText(text)}>
            <Copy size={14} />
            Copy
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
