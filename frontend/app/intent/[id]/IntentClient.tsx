"use client";

import { useEffect, useMemo, useState } from "react";
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

function formatTvl(value?: string) {
  const amount = Number(value ?? "0");
  if (!amount) return "unknown";
  if (amount > 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  return `$${amount.toLocaleString()}`;
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
          ✶ Compose a new intent
        </a>
        <a className="empty-link" href="/">
          ← Back to recent receipts
        </a>
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
  const title = execution.isDone ? "Intent executed. Proof complete." : isCompiling ? "Compiling your intent on-chain." : "Your intent is compiled and ready.";

  return (
    <main className="page-shell intent-shell receipt-artifact">
      <section className="intent-hero compact-hero">
        <p className="eyebrow">On-chain intent compiler</p>
        <h1 className="intent-title">{title}</h1>
      </section>

      {isCompiling ? (
        <div className="compile-progress" aria-label="Compilation progress">
          <span style={{ width: `${Math.max(12, steps.filter((step) => step.status === "done").length * 20)}%` }} />
        </div>
      ) : null}

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
