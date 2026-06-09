"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { decodeAbiParameters, formatUnits, Hex, isHex } from "viem";
import { useReadContract } from "wagmi";
import { HeroBand } from "@/components/receipt/HeroBand";
import { InspectorDrawer, type InspectorPayload } from "@/components/receipt/InspectorDrawer";
import { ReceiptTabs } from "@/components/receipt/ReceiptTabs";
import {
  addressRegistryAddress,
  compilerEngineAddress,
  goalRegistryAbi,
  goalRegistryAddress,
  intentStoreAbi,
  intentStoreAddress,
  receiptLogAddress,
  standardOrderEncoderAddress,
} from "@/lib/contracts";
import { goalPolicy } from "@/lib/goal-support";
import { somniaTestnet } from "@/lib/somnia";
import { useExecuteIntent } from "@/lib/use-execute-intent";
import { type AgentStep, useReceiptStream } from "@/lib/use-receipt-stream";

const goalStatuses = [
  "Pending",
  "Compiling",
  "IntentReady",
  "Submitted",
  "Settled",
  "Failed",
  "Expired",
] as const;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
      decimals?: number;
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

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function venueByPoolId(poolId?: string) {
  return goalPolicy.supportedVenues.find((venue) => venue.poolId === poolId);
}

function venueByOutputToken(token?: Hex) {
  if (!token) {
    return undefined;
  }

  const normalizedToken = token.toLowerCase();

  return goalPolicy.supportedVenues.find(
    (venue) =>
      venue.positionTokenAddress.toLowerCase() === normalizedToken ||
      venue.deliveryTokenAddress.toLowerCase() === normalizedToken,
  );
}

function outputDecimals(venue?: { positionTokenDecimals?: number }) {
  return venue?.positionTokenDecimals ?? 6;
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

function PendingCompileCard({
  goalId,
  goalText,
  status,
  steps,
  onInspect,
}: {
  goalId: string;
  goalText: string;
  status: string;
  steps: AgentStep[];
  onInspect: (payload: InspectorPayload) => void;
}) {
  const completedSteps = steps.filter((step) => step.status === "done");
  const realSteps = steps.filter((step) => step.status === "done" && step.requestId !== 0n);
  const currentCopy =
    realSteps.length === 0
      ? "Waiting for the first Somnia agent callback."
      : `${realSteps.length} compiler receipt${realSteps.length === 1 ? "" : "s"} recorded.`;

  return (
    <section className="mx-auto w-full max-w-[64rem] overflow-hidden rounded-2xl border border-white/[0.1] bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.055),transparent_24rem),rgba(7,8,8,0.82)] p-6 shadow-[0_1.5rem_6rem_rgba(0,0,0,0.26)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/46">Intent {goalId}</p>
          <h2 className="mt-3 font-serif text-[clamp(1.7rem,3.2vw,3rem)] leading-tight tracking-[-0.04em] text-white">
            {goalText || "Loading intent..."}
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-white/56">{currentCopy}</p>
        </div>

        <div className="min-w-36 text-right">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/42">Status</p>
          <p className="mt-2 font-mono text-sm uppercase tracking-[0.16em] text-white/64">{status}</p>
          <button
            className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-white/46 transition-colors hover:text-white"
            type="button"
            onClick={() => onInspect({ title: "Pending goal", body: { goalId, status, goalText, receipts: steps } })}
          >
            View raw
          </button>
        </div>
      </div>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <span
          className="block h-full rounded-full bg-white/70 transition-[width]"
          style={{ width: `${Math.min(92, Math.max(8, completedSteps.length * 20))}%` }}
        />
      </div>

      <div className="mt-5 grid gap-2">
        {realSteps.length > 0 ? (
          realSteps.map((step) => (
            <button
              className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-1 py-3 text-left transition-colors hover:text-white"
              key={`${step.stepName}-${step.requestId}`}
              type="button"
              onClick={() => onInspect({ title: step.stepName, body: step })}
            >
              <span className="font-serif text-lg text-white/82">{stepTitle(step.stepName)}</span>
              <span className="font-mono text-xs text-white/42">request {step.requestId.toString()}</span>
            </button>
          ))
        ) : (
          <div className="border-t border-white/[0.07] px-1 py-5 text-sm text-white/45">
            No on-chain receipts yet. The compile transaction is accepted; the first receipt appears after the rates agent responds.
          </div>
        )}
      </div>
    </section>
  );
}

function FailedCompileCard({
  goalId,
  goalText,
  steps,
  onInspect,
}: {
  goalId: string;
  goalText: string;
  steps: AgentStep[];
  onInspect: (payload: InspectorPayload) => void;
}) {
  const realSteps = steps.filter((step) => step.status === "done" && step.requestId !== 0n);

  return (
    <section className="mx-auto w-full max-w-[64rem] overflow-hidden rounded-2xl border border-red-400/20 bg-[radial-gradient(circle_at_0%_0%,rgba(229,72,77,0.08),transparent_24rem),rgba(7,8,8,0.82)] p-6 shadow-[0_1.5rem_6rem_rgba(0,0,0,0.26)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-red-200/60">Intent {goalId}</p>
          <h2 className="mt-3 font-serif text-[clamp(1.7rem,3.2vw,3rem)] leading-tight tracking-[-0.04em] text-white">
            Compile failed
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-white/58">
            The compiler rejected this goal or could not derive a safe supported route. No funds moved.
          </p>
          {goalText ? <p className="mt-4 max-w-2xl font-serif text-xl leading-snug text-white/78">{goalText}</p> : null}
        </div>

        <button
          className="font-mono text-xs uppercase tracking-[0.16em] text-white/46 transition-colors hover:text-white"
          type="button"
          onClick={() => onInspect({ title: "Failed goal", body: { goalId, status: "Failed", goalText, receipts: steps } })}
        >
          View raw
        </button>
      </div>

      <div className="mt-6 grid gap-2">
        {realSteps.length > 0 ? (
          realSteps.map((step) => (
            <button
              className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-1 py-3 text-left transition-colors hover:text-white"
              key={`${step.stepName}-${step.requestId}`}
              type="button"
              onClick={() => onInspect({ title: step.stepName, body: step })}
            >
              <span className="font-serif text-lg text-white/82">{stepTitle(step.stepName)}</span>
              <span className="font-mono text-xs text-white/42">request {step.requestId.toString()}</span>
            </button>
          ))
        ) : (
          <div className="border-t border-white/[0.07] px-1 py-5 text-sm text-white/45">
            No compiler receipts were recorded for this failed goal.
          </div>
        )}
      </div>

      <a className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 font-mono text-sm text-white/72 transition-colors hover:bg-white/[0.07] hover:text-white" href="/">
        Try a new goal
      </a>
    </section>
  );
}

export function IntentClient({ goalId }: { goalId: string }) {
  const parsedGoalId = BigInt(goalId);
  const [inspector, setInspector] = useState<InspectorPayload>();

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
  const ratesStep = steps.find((step) => step.stepName === "rates_fetched");
  const decisionStep = steps.find((step) => step.stepName === "decision_built");
  const selectedStep = steps.find((step) => step.stepName === "candidates_selected");
  const planStep = steps.find((step) => step.stepName === "plan_built");
  const ratesText = decodeStringData(ratesStep?.payload);
  const ratesVenues = useMemo(() => parseRatesPayload(ratesText), [ratesText]);
  const ratesById = useMemo(() => new Map(ratesVenues.map((venue) => [venue.poolId ?? "", venue])), [ratesVenues]);
  const venuesById = useMemo(() => new Map(goalPolicy.supportedVenues.map((venue) => [venue.poolId, venue])), []);
  const decisionJson = asDecision(decisionStep?.payload);
  const planJson = planStep?.payload;
  const planDecisionJson = decisionFromPlan(planJson);
  const activeDecision = decisionJson ?? planDecisionJson;
  const output = order?.outputs[0];
  const input = order?.inputs[0];
  const inputToken = input ? tokenIdentifierToAddress(input[0]) : undefined;
  const inputAmount = input?.[1] ?? 0n;
  const outputToken = output ? finalOutputToken(output) : undefined;
  const selectedPoolIdFromReceipts = decodeStringData(selectedStep?.payload) || activeDecision?.poolId;
  const selectedVenue = venueByPoolId(selectedPoolIdFromReceipts) ?? venueByOutputToken(outputToken);
  const selectedPoolId = selectedPoolIdFromReceipts ?? selectedVenue?.poolId;
  const selectedRate = selectedPoolId ? ratesById.get(selectedPoolId) : undefined;
  const sourceAmount = formatUnits(inputAmount, 6);
  const orderExpired = order ? Date.now() >= order.expires * 1000 : false;
  const status = goal ? goalStatuses[goal.status] : "Loading";
  const notFound =
    !isGoalLoading &&
    goal &&
    goal.author.toLowerCase() === ZERO_ADDRESS &&
    goal.createdAt === 0n &&
    !goal.naturalLanguage;

  const execution = useExecuteIntent({
    goalId,
    order,
    inputToken,
    outputToken,
    selectedVenue,
    selectedPositionToken: outputToken,
    orderExpired,
  });

  useEffect(() => {
    if (!goal?.naturalLanguage) return;
    try {
      const existing = JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]") as {
        id: string;
        prompt?: string;
      }[];
      const next = [{ id: goalId, prompt: goal.naturalLanguage }, ...existing.filter((item) => item.id !== goalId)].slice(0, 8);
      window.localStorage.setItem("asshai-recent-intents", JSON.stringify(next));
    } catch {
      // Recent intent storage is best-effort.
    }
  }, [goal?.naturalLanguage, goalId]);

  if (notFound || status === "Expired") {
    return (
      <main className="page-shell empty-receipt">
        <h1>This receipt has expired.</h1>
        <p>It may have been removed or the link is no longer valid.</p>
        <a className="empty-cta" href="/">
          Compose a new intent
        </a>
        <a className="empty-link" href="/">
          ← Back to recent receipts
        </a>
      </main>
    );
  }

  if (status === "Failed") {
    return (
      <main className="relative z-10 mx-auto w-full max-w-[88rem] px-5 pb-8 pt-2 lg:px-8">
        <section className="mx-auto mb-4 max-w-4xl text-center">
          <div className="mx-auto mb-3 grid size-9 place-items-center rounded-full border border-red-300/20 bg-red-400/[0.06] text-red-200/80">
            <XCircle className="size-4" />
          </div>
          <h1 className="font-serif text-[clamp(2rem,4vw,3.8rem)] leading-[0.95] tracking-[-0.05em] text-white">
            Compile failed
          </h1>
        </section>

        <FailedCompileCard
          goalId={goalId}
          goalText={goal?.naturalLanguage ?? ""}
          steps={steps}
          onInspect={setInspector}
        />

        <InspectorDrawer payload={inspector} onClose={() => setInspector(undefined)} />
      </main>
    );
  }

  const rawSections = [
    { title: "Decision JSON", body: activeDecision ?? {} },
    { title: "LI.FI quote", body: execution.quote ?? {} },
    { title: "StandardOrder bytes", body: (encodedIntent as Hex | undefined) ?? "0x" },
    { title: "Receipt log", body: receipts ?? steps },
    { title: "Goal envelope", body: goal ?? {} },
    {
      title: "Contract addresses",
      body: {
        CompilerEngine: compilerEngineAddress,
        ReceiptLog: receiptLogAddress,
        IntentStore: intentStoreAddress,
        AddressRegistry: addressRegistryAddress,
        GoalRegistry: goalRegistryAddress,
        StandardOrderEncoder: standardOrderEncoderAddress,
      },
    },
  ];

  const isCompiling = status === "Pending" || status === "Compiling" || !activeDecision;
  const title = isCompiling ? "Compiling intent" : "Intent ready";

  if (isCompiling) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-[88rem] px-5 pb-8 pt-2 lg:px-8">
        <section className="mx-auto mb-4 max-w-4xl text-center">
          <div className="mx-auto mb-3 grid size-9 place-items-center rounded-full border border-white/[0.12] bg-white/[0.04] text-white/70">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <h1 className="font-serif text-[clamp(2rem,4vw,3.8rem)] leading-[0.95] tracking-[-0.05em] text-white">
            {title}
          </h1>
        </section>

        <PendingCompileCard
          goalId={goalId}
          goalText={goal?.naturalLanguage ?? ""}
          status={status}
          steps={steps}
          onInspect={setInspector}
        />

        <InspectorDrawer payload={inspector} onClose={() => setInspector(undefined)} />
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-[88rem] px-5 pb-6 pt-1 lg:px-8">
      <HeroBand
        goalId={goalId}
        goalText={goal?.naturalLanguage ?? ""}
        intentHash={intentHash && intentHash !== ZERO_HASH ? intentHash : undefined}
        selectedVenue={selectedVenue}
        selectedRate={selectedRate}
        decision={activeDecision}
        execution={execution}
        onInspect={setInspector}
      />

      <ReceiptTabs
        goalId={goalId}
        intentHash={intentHash && intentHash !== ZERO_HASH ? intentHash : undefined}
        sourceAmount={sourceAmount}
        selectedVenue={selectedVenue}
        selectedRate={selectedRate}
        decision={activeDecision}
        venuesById={venuesById}
        ratesById={ratesById}
        encodedIntent={(encodedIntent as Hex | undefined) ?? "0x"}
        execution={execution}
        steps={steps}
        rawSections={rawSections}
        onInspect={setInspector}
      />

      <InspectorDrawer payload={inspector} onClose={() => setInspector(undefined)} />
    </main>
  );
}
