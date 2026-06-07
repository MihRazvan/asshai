import { XCircle } from "lucide-react";

export function RejectedAlternative({ poolId, reason }: { poolId: string; reason: string }) {
  return (
    <div className="rejected-alternative">
      <XCircle size={16} />
      <span>{poolId}</span>
      <em>{reason}</em>
    </div>
  );
}
