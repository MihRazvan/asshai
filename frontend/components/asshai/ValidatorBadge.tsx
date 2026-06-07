import { ShieldCheck } from "lucide-react";

export function ValidatorBadge({ quorum = "3/3" }: { quorum?: string }) {
  return (
    <span className="validator-badge">
      <ShieldCheck size={17} />
      Verified by Somnia consensus
      <strong>{quorum}</strong>
    </span>
  );
}
