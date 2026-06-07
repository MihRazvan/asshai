import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";

type ExecutionTraceProps = {
  approveHash?: string;
  routeHash?: string;
  lifiStatus?: string;
  isDone?: boolean;
};

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function TraceIcon({ done, active }: { done?: boolean; active?: boolean }) {
  if (done) return <CheckCircle2 className="trace-icon trace-done" size={18} />;
  if (active) return <Loader2 className="trace-icon trace-active" size={18} />;
  return <Circle className="trace-icon" size={18} />;
}

export function ExecutionTrace({ approveHash, routeHash, lifiStatus, isDone }: ExecutionTraceProps) {
  const bridgeActive = Boolean(routeHash && !isDone);

  return (
    <div className="execution-trace">
      <div className="execution-line">
        <TraceIcon done={Boolean(approveHash)} />
        <div>
          <strong>Arbitrum approval</strong>
          <span>{approveHash ? `Tx: ${shortHash(approveHash)}` : "Waiting for token approval"}</span>
        </div>
        {approveHash ? <ExternalLink size={15} /> : null}
      </div>
      <div className="execution-line">
        <TraceIcon done={Boolean(routeHash)} />
        <div>
          <strong>LI.FI route transaction</strong>
          <span>{routeHash ? `Tx: ${shortHash(routeHash)}` : "Waiting for route submission"}</span>
        </div>
        {routeHash ? <ExternalLink size={15} /> : null}
      </div>
      <div className="execution-line">
        <TraceIcon done={isDone} active={bridgeActive} />
        <div>
          <strong>Cross-chain execution</strong>
          <span>{lifiStatus ?? "LI.FI status will appear here"}</span>
        </div>
      </div>
      <div className="execution-line">
        <TraceIcon done={isDone} />
        <div>
          <strong>Base destination supply</strong>
          <span>{isDone ? "Final position acquired" : "Waiting for destination completion"}</span>
        </div>
      </div>
    </div>
  );
}
