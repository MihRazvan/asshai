"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, ExternalLink, Lock, RotateCcw } from "lucide-react";
import { decodeAbiParameters, encodeFunctionData, formatUnits, Hex, isHex } from "viem";
import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ExecutionTrace } from "@/components/asshai/ExecutionTrace";
import { RejectedAlternative } from "@/components/asshai/RejectedAlternative";
import { ValidatorBadge } from "@/components/asshai/ValidatorBadge";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { erc20Abi, goalRegistryAbi, goalRegistryAddress, intentStoreAbi, intentStoreAddress } from "@/lib/contracts";
import { goalPolicy } from "@/lib/goal-support";
import { somniaTestnet } from "@/lib/somnia";
import { AgentStep, useReceiptStream } from "@/lib/use-receipt-stream";

const goalStatuses = [
  "Pending",
  "Compiling",
  "IntentReady",
  "Submitted",
  "Settled",
  "Failed",
  "Expired",
] as const;

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_COMPOUND_CUSDCV3 = "0xb125E6687d4313864e53df431d5425969c15Eb2F" as const;
const COMPOUND_CONTRACT_CALL_GAS_LIMIT = "350000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const compoundCometAbi = [
  {
    type: "function",
    name: "supply",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const standardOrderAbi = [
  {
    type: "tuple",
    components: [
      { name: "user", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "originChainId", type: "uint256" },
      { name: "expires", type: "uint32" },
      { name: "fillDeadline", type: "uint32" },
      { name: "inputOracle", type: "address" },
      { name: "inputs", type: "uint256[2][]" },
      {
        name: "outputs",
        type: "tuple[]",
        components: [
          { name: "oracle", type: "bytes32" },
          { name: "settler", type: "bytes32" },
          { name: "chainId", type: "uint256" },
          { name: "token", type: "bytes32" },
          { name: "amount", type: "uint256" },
          { name: "recipient", type: "bytes32" },
          { name: "callbackData", type: "bytes" },
          { name: "context", type: "bytes" },
        ],
      },
    ],
  },
] as const;

type StandardOrder = {
  user: Hex;
  nonce: bigint;
  originChainId: bigint;
  expires: number;
  fillDeadline: number;
  inputOracle: Hex;
  inputs: readonly (readonly [bigint, bigint])[];
  outputs: readonly {
    oracle: Hex;
    settler: Hex;
    chainId: bigint;
    token: Hex;
    amount: bigint;
    recipient: Hex;
    callbackData: Hex;
    context: Hex;
  }[];
};

type DecisionJson = {
  poolId?: string;
  objectiveMatched?: string;
  rejectedAlternatives?: { poolId?: string; reason?: string }[];
  reasoning?: string;
  confidence?: number;
};

type LifiQuote = {
  tool?: string;
  estimate?: {
    toAmount?: string;
    toAmountMin?: string;
  };
  transactionRequest?: {
    to?: Hex;
    data?: Hex;
    value?: string;
    chainId?: number;
    gasLimit?: string;
  };
  includedSteps?: readonly {
    tool?: string;
    type?: string;
  }[];
  message?: string;
};

type LifiStatusBody = {
  status?: string;
  substatus?: string;
  message?: string;
  receiving?: {
    amount?: string;
    token?: {
      symbol?: string;
    };
  };
};

type RatesVenue = Record<string, string>;

function decodeStringData(data: unknown) {
  if (typeof data === "string") {
    return data;
  }

  return "";
}

function decodeOrder(encoded: Hex | undefined) {
  if (!encoded || encoded === "0x" || !isHex(encoded)) {
    return undefined;
  }

  try {
    return decodeAbiParameters(standardOrderAbi, encoded)[0] as StandardOrder;
  } catch {
    return undefined;
  }
}

function tokenIdentifierToAddress(tokenIdentifier: bigint) {
  return `0x${tokenIdentifier.toString(16).padStart(40, "0").slice(-40)}` as Hex;
}

function bytes32ToAddress(value: Hex) {
  return `0x${value.slice(-40)}` as Hex;
}

function decodeYieldAction(callbackData: Hex) {
  if (callbackData === "0x") {
    return undefined;
  }

  try {
    const [goalId, beneficiary, deliveryToken, positionToken, strategyId, minAmount] = decodeAbiParameters(
      [
        { name: "goalId", type: "uint256" },
        { name: "beneficiary", type: "address" },
        { name: "deliveryToken", type: "address" },
        { name: "positionToken", type: "address" },
        { name: "strategyId", type: "bytes32" },
        { name: "minAmount", type: "uint256" },
      ],
      callbackData,
    );

    return { goalId, beneficiary, deliveryToken, positionToken, strategyId, minAmount };
  } catch {
    return undefined;
  }
}

function finalOutputToken(output: StandardOrder["outputs"][number]) {
  return decodeYieldAction(output.callbackData)?.positionToken ?? bytes32ToAddress(output.token);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asDecision(value: unknown): DecisionJson | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return record as DecisionJson;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseRatesPayload(payload: string): RatesVenue[] {
  if (!payload) {
    return [];
  }

  return payload
    .split("|")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) =>
      Object.fromEntries(
        row
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [key, ...valueParts] = part.split("=");
            return [key, valueParts.join("=")];
          })
          .filter(([key]) => Boolean(key)),
      ),
    );
}

function decisionFromPlan(value: unknown) {
  const plan = asRecord(value);
  const decision = plan?.decision;

  if (typeof decision !== "string") {
    return undefined;
  }

  return asDecision(tryParseJson(decision));
}

function isCompoundBaseOutput(output: StandardOrder["outputs"][number]) {
  return finalOutputToken(output).toLowerCase() === BASE_COMPOUND_CUSDCV3.toLowerCase();
}

function bigintFromRequestValue(value: string | undefined) {
  if (!value) {
    return 0n;
  }

  return BigInt(value);
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function venueByPoolId(poolId?: string) {
  return goalPolicy.supportedVenues.find((venue) => venue.poolId === poolId);
}

function objectiveClass(objective?: string) {
  if (objective === "safety") return "objective-pill objective-safety";
  if (objective === "fallback") return "objective-pill objective-fallback";
  return "objective-pill objective-matched";
}

function stepTitle(stepName: AgentStep["stepName"]) {
  const titles: Record<AgentStep["stepName"], string> = {
    rates_fetched: "Reading verified yield venues from DefiLlama",
    decision_built: "Asking the Somnia LLM to choose",
    candidates_selected: "Validating the selected pool",
    plan_built: "Building the deterministic allocation plan",
    order_encoded: "Encoding the StandardOrder-shaped artifact",
  };

  return titles[stepName];
}

function formatTvl(value?: string) {
  const amount = Number(value ?? "0");
  if (!amount) return "unknown";
  if (amount > 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  return `$${amount.toLocaleString()}`;
}

export function IntentClient({ goalId }: { goalId: string }) {
  const parsedGoalId = BigInt(goalId);
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [lifiStatus, setLifiStatus] = useState<string>();
  const [lifiStatusBody, setLifiStatusBody] = useState<LifiStatusBody>();
  const [quoteStatus, setQuoteStatus] = useState<string>();
  const [lifiQuote, setLifiQuote] = useState<LifiQuote>();
  const [executionStatus, setExecutionStatus] = useState<string>();
  const [showRaw, setShowRaw] = useState(false);
  const { data: approveHash, error: approveError, isPending: isApprovePending, writeContract: approve } =
    useWriteContract();
  const { data: routeHash, error: routeError, isPending: isRoutePending, sendTransaction } = useSendTransaction();

  const { data: goal, isLoading: isGoalLoading } = useReadContract({
    address: goalRegistryAddress,
    abi: goalRegistryAbi,
    functionName: "getGoal",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });
  const { data: encodedIntent } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntent",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });
  const { data: intentHash } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntentHash",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });

  const { receipts, steps } = useReceiptStream(parsedGoalId, goal?.status);
  const order = useMemo(() => decodeOrder(encodedIntent as Hex | undefined), [encodedIntent]);
  const routeReceipt = useWaitForTransactionReceipt({ hash: routeHash });
  const ratesStep = steps.find((step) => step.stepName === "rates_fetched");
  const decisionStep = steps.find((step) => step.stepName === "decision_built");
  const selectedStep = steps.find((step) => step.stepName === "candidates_selected");
  const planStep = steps.find((step) => step.stepName === "plan_built");
  const ratesText = decodeStringData(ratesStep?.payload);
  const ratesVenues = useMemo(() => parseRatesPayload(ratesText), [ratesText]);
  const decisionJson = asDecision(decisionStep?.payload);
  const selectedPoolId = decodeStringData(selectedStep?.payload) || decisionJson?.poolId;
  const planJson = planStep?.payload;
  const planDecisionJson = decisionFromPlan(planJson);
  const activeDecision = decisionJson ?? planDecisionJson;
  const selectedVenue = venueByPoolId(selectedPoolId);
  const output = order?.outputs[0];
  const input = order?.inputs[0];
  const inputToken = input ? tokenIdentifierToAddress(input[0]) : undefined;
  const inputAmount = input?.[1] ?? 0n;
  const outputToken = output ? finalOutputToken(output) : undefined;
  const outputChainId = output ? Number(output.chainId) : undefined;
  const originChainId = order ? Number(order.originChainId) : undefined;
  const mustSwitchToOrigin = Boolean(originChainId && chainId !== originChainId);
  const orderExpired = order ? Date.now() >= order.expires * 1000 : false;
  const status = goal ? goalStatuses[goal.status] : "Loading";
  const routeTx = lifiQuote?.transactionRequest;
  const routeSpender = routeTx?.to;
  const isFilled = lifiStatus?.startsWith("DONE") || lifiStatusBody?.status === "DONE";
  const isExecuting = Boolean(routeHash && !isFilled);
  const isFailed = status === "Failed";
  const isCompiling = status === "Compiling";
  const isReady = status === "IntentReady" && !isExecuting && !isFilled;
  const notFound =
    !isGoalLoading &&
    goal &&
    goal.author.toLowerCase() === ZERO_ADDRESS &&
    goal.createdAt === 0n &&
    !goal.naturalLanguage;

  useEffect(() => {
    if (!routeHash) return;

    const timer = window.setInterval(() => {
      void checkComposerStatus(routeHash);
    }, 5_000);

    void checkComposerStatus(routeHash);

    return () => window.clearInterval(timer);
  }, [routeHash, order]);

  useEffect(() => {
    if (routeReceipt.data?.status === "success") {
      setExecutionStatus("Source transaction confirmed. Waiting for destination execution...");
    }
  }, [routeReceipt.data?.status]);

  async function requestComposerQuote() {
    if (!order || !output || !inputToken || !outputToken || !originChainId || !outputChainId) {
      return;
    }

    setQuoteStatus("Requesting LI.FI Composer quote...");
    setLifiQuote(undefined);
    setExecutionStatus(undefined);
    setLifiStatus(undefined);
    setLifiStatusBody(undefined);

    const isCompound = isCompoundBaseOutput(output);
    const response = await fetch(isCompound ? "/api/lifi/contract-call-quote" : "/api/lifi/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isCompound
          ? {
              fromChain: originChainId,
              toChain: outputChainId,
              fromToken: inputToken,
              toToken: BASE_USDC,
              toAmount: output.amount.toString(),
              fromAddress: order.user,
              toContractAddress: BASE_COMPOUND_CUSDCV3,
              toContractCallData: encodeFunctionData({
                abi: compoundCometAbi,
                functionName: "supply",
                args: [BASE_USDC, output.amount],
              }),
              toContractGasLimit: COMPOUND_CONTRACT_CALL_GAS_LIMIT,
              toApprovalAddress: BASE_COMPOUND_CUSDCV3,
              contractOutputsToken: BASE_COMPOUND_CUSDCV3,
            }
          : {
              fromChain: originChainId,
              toChain: outputChainId,
              fromToken: inputToken,
              toToken: outputToken,
              fromAmount: inputAmount.toString(),
              fromAddress: order.user,
            },
      ),
    });
    const body = await response.json();

    if (!response.ok || !body?.transactionRequest?.to || !body?.transactionRequest?.data) {
      setQuoteStatus(`Quote failed: ${body?.message ?? JSON.stringify(body)}`);
      return;
    }

    setLifiQuote(body);
    setQuoteStatus(
      isCompound
        ? `Quote ready via ${body.tool ?? "LI.FI"}: bridge ${formatUnits(output.amount, 6)} Base USDC and supply it into Compound V3 for cUSDCv3.`
        : `Quote ready via ${body.tool ?? "LI.FI"}: ${formatUnits(BigInt(body.estimate?.toAmount ?? "0"), 6)} output tokens.`,
    );
  }

  async function checkComposerStatus(txHash = routeHash) {
    if (!txHash || !originChainId || !outputChainId) {
      return;
    }

    const response = await fetch(`/api/lifi/status?txHash=${txHash}&fromChain=${originChainId}&toChain=${outputChainId}`);
    const body = (await response.json()) as LifiStatusBody;

    setLifiStatusBody(body);
    setLifiStatus(
      body?.status
        ? `${body.status}${body.substatus ? ` / ${body.substatus}` : ""}${body.receiving?.amount ? ` (${formatUnits(BigInt(body.receiving.amount), 6)} ${body.receiving?.token?.symbol ?? ""})` : ""}`
        : body?.message ?? JSON.stringify(body),
    );
  }

  function executeComposerRoute() {
    if (!routeTx?.to || !routeTx.data || !originChainId) {
      return;
    }

    setExecutionStatus("Submitting LI.FI route transaction...");
    sendTransaction({
      to: routeTx.to,
      data: routeTx.data,
      value: bigintFromRequestValue(routeTx.value),
      chainId: originChainId,
    });
  }

  if (notFound || status === "Expired") {
    return (
      <main className="page-shell empty-receipt">
        <h1>This receipt has expired.</h1>
        <p>It may have been removed or the link is no longer valid.</p>
        <a className="empty-cta" href="/">
          ✶ Compose a new intent
        </a>
        <a className="empty-link" href="/">
          ← Back to recent receipts
        </a>
      </main>
    );
  }

  const heroTitle = isFilled
    ? "Intent executed. Proof complete."
    : isReady
      ? "Your intent is compiled and ready."
      : "Compiling your intent on-chain.";
  const finalAmount = lifiStatusBody?.receiving?.amount
    ? `${formatUnits(BigInt(lifiStatusBody.receiving.amount), 6)} ${lifiStatusBody.receiving.token?.symbol ?? ""}`
    : undefined;

  return (
    <main className="page-shell intent-shell">
      <section className="intent-hero">
        <p className="eyebrow">On-chain intent compiler</p>
        <h1 className="intent-title">{heroTitle}</h1>
        {(isReady || isFilled) && <ValidatorBadge />}
        <button className="raw-toggle" type="button" onClick={() => setShowRaw((current) => !current)}>
          {showRaw ? "Hide raw" : "View raw"}
        </button>
      </section>

      {isFilled ? (
        <section className="filled-summary">
          <Check size={28} />
          <p>
            <strong>{finalAmount ?? `Position token ${outputToken ?? ""}`}</strong> supplied to{" "}
            <strong>{selectedVenue?.label ?? selectedPoolId ?? "selected venue"}</strong> via reasoning audited by
            Somnia.
          </p>
        </section>
      ) : null}

      <section className="locked-goal">
        <Lock size={17} />
        <span>{goal?.naturalLanguage || "Loading goal..."}</span>
        <em>{isFailed ? "compile failed" : isExecuting ? "executing..." : isCompiling ? "compiling..." : "compiled"}</em>
      </section>

      <section className={isFilled ? "filled-grid" : "reasoning-timeline"}>
        <div className={isFilled ? "filled-card" : undefined}>
          {isFilled ? <h2>Why we chose this</h2> : null}
          {steps.slice(0, 4).map((step, index) => (
            <motion.article
              className={`timeline-step timeline-${step.status}`}
              key={step.stepName}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.24 }}
            >
              <div className="timeline-marker">{step.status === "done" ? <Check size={16} /> : index + 1}</div>
              <div className="timeline-content">
                <h2>
                  {index + 1}. {stepTitle(step.stepName)}
                </h2>
                {step.stepName === "rates_fetched" ? <RatesTable venues={ratesVenues} /> : null}
                {step.stepName === "decision_built" ? (
                  isFailed ? (
                    <FailureCard />
                  ) : activeDecision ? (
                    <DecisionPanel decision={activeDecision} selectedPoolId={selectedPoolId} />
                  ) : (
                    <PendingBox label="Waiting for consensus decision..." />
                  )
                ) : null}
                {step.stepName === "candidates_selected" ? (
                  selectedPoolId ? (
                    <p className="selected-copy">Solidity validated {selectedPoolId} against the v1 allowlist.</p>
                  ) : (
                    <PendingBox label="Waiting for pool validation..." />
                  )
                ) : null}
                {step.stepName === "plan_built" ? (
                  order && selectedVenue && output ? (
                    <PlanSummary order={order} output={output} venueLabel={selectedVenue.label} outputToken={outputToken} />
                  ) : (
                    <PendingBox label="Waiting for deterministic plan..." />
                  )
                ) : null}
              </div>
            </motion.article>
          ))}
        </div>

        {isFilled ? (
          <div className="filled-card">
            <h2>What happened</h2>
            <ExecutionTrace approveHash={approveHash} routeHash={routeHash} lifiStatus={lifiStatus} isDone={isFilled} />
            <div className="final-position-card">
              <strong>Final position acquired</strong>
              <dl>
                <div>
                  <dt>Protocol</dt>
                  <dd>{selectedVenue?.label ?? selectedPoolId}</dd>
                </div>
                <div>
                  <dt>Supplied</dt>
                  <dd>{finalAmount ?? "Completed"}</dd>
                </div>
                <div>
                  <dt>Chain</dt>
                  <dd>Base</dd>
                </div>
                <div>
                  <dt>Route tx</dt>
                  <dd>{routeHash ? shortHash(routeHash) : "Recorded"}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}
      </section>

      {isReady || isExecuting ? (
        <section className="execute-panel">
          <div className="execute-brand">LI.FI</div>
          <div>
            <strong>Execute via LI.FI Composer</strong>
            <p>Approve and execute the compiled route from Arbitrum into the selected Base yield position.</p>
          </div>
          <div className="execute-amount">
            {formatUnits(inputAmount, 6)} USDC
            <ArrowRight size={18} />
            {selectedVenue?.positionTokenSymbol ?? "position token"}
          </div>
          <div className="execute-actions">
            {orderExpired ? <p>This compiled route is expired. Compile a fresh goal before execution.</p> : null}
            {mustSwitchToOrigin && originChainId ? (
              <button type="button" onClick={() => switchChain({ chainId: originChainId })}>
                Switch to origin chain {originChainId}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!isConnected || !order || !inputToken || !outputToken || mustSwitchToOrigin || orderExpired}
              onClick={requestComposerQuote}
            >
              Request quote
            </button>
            <button
              type="button"
              disabled={
                !isConnected ||
                !order ||
                !inputToken ||
                !routeSpender ||
                isApprovePending ||
                mustSwitchToOrigin ||
                orderExpired
              }
              onClick={() =>
                inputToken &&
                routeSpender &&
                approve({
                  address: inputToken,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [routeSpender, inputAmount],
                  chainId: originChainId,
                })
              }
            >
              {isApprovePending ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              disabled={!isConnected || !routeTx?.to || !routeTx.data || isRoutePending || mustSwitchToOrigin || orderExpired}
              onClick={executeComposerRoute}
            >
              {isRoutePending ? "Executing..." : "Execute via LI.FI"}
              <ExternalLink size={15} />
            </button>
          </div>
        </section>
      ) : null}

      {isExecuting ? (
        <section className="execution-section">
          <h2>Executing cross-chain plan</h2>
          <ExecutionTrace approveHash={approveHash} routeHash={routeHash} lifiStatus={lifiStatus} isDone={isFilled} />
          {routeHash ? (
            <button type="button" onClick={() => checkComposerStatus()}>
              Refresh LI.FI status
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="receipt-meta">
        <span>Intent ID {goalId}</span>
        {intentHash && intentHash !== ZERO_HASH ? <span>Hash {shortHash(intentHash)}</span> : null}
        <span>{receipts?.length ?? 0} on-chain receipts</span>
        {routeHash ? <span>Route {shortHash(routeHash)}</span> : null}
      </section>

      {showRaw ? (
        <section className="raw-panel">
          <h2>Raw StandardOrder bytes</h2>
          <pre>{(encodedIntent as Hex | undefined) ?? "0x"}</pre>
          <button type="button" onClick={() => navigator.clipboard.writeText((encodedIntent as Hex | undefined) ?? "0x")}>
            <Copy size={15} />
            Copy raw bytes
          </button>
        </section>
      ) : null}

      {quoteStatus ? <p className="tx-result">Quote status: {quoteStatus}</p> : null}
      {lifiQuote?.includedSteps?.length ? (
        <p className="tx-result">LI.FI steps: {lifiQuote.includedSteps.map((step) => step.tool ?? step.type ?? "step").join(" -> ")}</p>
      ) : null}
      {executionStatus ? <p className="tx-result">Execution status: {executionStatus}</p> : null}
      {lifiStatus ? <p className="tx-result">LI.FI status: {lifiStatus}</p> : null}
      {approveError ? <p className="tx-result">Approval error: {approveError.message}</p> : null}
      {routeError ? <p className="tx-result">Route error: {routeError.message}</p> : null}
    </main>
  );
}

function PendingBox({ label }: { label: string }) {
  return <div className="pending-box">{label}</div>;
}

function FailureCard() {
  return (
    <div className="failure-card">
      <RotateCcw size={24} />
      <div>
        <strong>The compiler couldn't reach consensus on this goal. Try refining it.</strong>
        <p>Validators returned conflicting or malformed outputs, so no safe plan could be derived.</p>
      </div>
    </div>
  );
}

function RatesTable({ venues }: { venues: RatesVenue[] }) {
  if (!venues.length) {
    return <PendingBox label="Waiting for verified venue data..." />;
  }

  return (
    <div className="venue-table">
      <div className="venue-table-head">
        <span>Pool ID</span>
        <span>APY</span>
        <span>TVL</span>
        <span>Risk tier</span>
        <span>Lockup</span>
        <span>Source</span>
      </div>
      {venues.map((venue) => (
        <div className="venue-table-row" key={venue.poolId}>
          <span>
            <VenueLogo poolId={venue.poolId ?? "usdc"} label={venue.project} size={24} />
            {venue.poolId}
          </span>
          <span>{venue.apy ? `${Number(venue.apy).toFixed(2)}%` : "unknown"}</span>
          <span>{formatTvl(venue.tvlUsd)}</span>
          <span>
            <em>{venue.riskTier ?? "unknown"}</em>
          </span>
          <span>{venue.lockup ?? "unknown"}</span>
          <span>DefiLlama</span>
        </div>
      ))}
    </div>
  );
}

function DecisionPanel({ decision, selectedPoolId }: { decision: DecisionJson; selectedPoolId?: string }) {
  return (
    <div className="decision-panel">
      <div className="decision-summary">
        <span className={objectiveClass(decision.objectiveMatched)}>{decision.objectiveMatched ?? "objectiveMatched"}</span>
        <strong>Selected {selectedPoolId ?? decision.poolId}</strong>
      </div>
      <pre>{prettyJson(decision)}</pre>
      {decision.rejectedAlternatives?.length ? (
        <div className="rejected-list">
          {decision.rejectedAlternatives.map((alternative, index) => (
            <RejectedAlternative
              key={`${alternative.poolId}-${index}`}
              poolId={alternative.poolId ?? "unknown"}
              reason={alternative.reason ?? "Rejected by consensus decision"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlanSummary({
  order,
  output,
  venueLabel,
  outputToken,
}: {
  order: StandardOrder;
  output: StandardOrder["outputs"][number];
  venueLabel: string;
  outputToken?: Hex;
}) {
  return (
    <div className="plan-summary">
      <div>
        <span>Destination chain</span>
        <strong>Base</strong>
      </div>
      <div>
        <span>Amount</span>
        <strong>{formatUnits(output.amount, 6)} USDC</strong>
      </div>
      <div>
        <span>Action</span>
        <strong>Supply yield</strong>
      </div>
      <div>
        <span>Destination</span>
        <strong>{venueLabel}</strong>
      </div>
      <div>
        <span>Position token</span>
        <strong>{outputToken ? shortHash(outputToken) : "pending"}</strong>
      </div>
      <div>
        <span>Origin</span>
        <strong>Chain {order.originChainId.toString()}</strong>
      </div>
    </div>
  );
}
