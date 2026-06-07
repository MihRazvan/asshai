"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { decodeAbiParameters, Hex, parseEther, parseEventLogs, parseUnits } from "viem";
import { useAccount, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ReceiptCard } from "@/components/asshai/ReceiptCard";
import { goalRegistryAbi, goalRegistryAddress, receiptLogAbi, receiptLogAddress } from "@/lib/contracts";
import { classifyGoalSupport, goalPolicy } from "@/lib/goal-support";
import { somniaTestnet } from "@/lib/somnia";

const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const featuredGoalIds = [64n, 63n, 62n];
const examplePrompts = [
  "maximize my USDC yield, 7-day lockup",
  "safest stablecoin yield, no lockup, prefer Base",
  "find me 8%+ if possible, but don't use sketchy pools",
];

type ReceiptEntry = {
  stepName: string;
  data: Hex;
};

type GoalStruct = {
  naturalLanguage: string;
  status: number;
  createdAt: bigint;
};

function decodeString(data: Hex | undefined) {
  if (!data || data === "0x") {
    return "";
  }

  try {
    return decodeAbiParameters([{ type: "string" }], data)[0];
  } catch {
    return "";
  }
}

function parseDecision(receipts: readonly ReceiptEntry[] | undefined) {
  const decisionText = decodeString(receipts?.find((entry) => entry.stepName === "decision_built")?.data);

  if (!decisionText) {
    return undefined;
  }

  try {
    return JSON.parse(decisionText) as { poolId?: string; objectiveMatched?: string };
  } catch {
    return undefined;
  }
}

function parseRatesApy(receipts: readonly ReceiptEntry[] | undefined, poolId: string | undefined) {
  if (!poolId) {
    return undefined;
  }

  const ratesText = decodeString(receipts?.find((entry) => entry.stepName === "rates_fetched")?.data);
  const row = ratesText
    .split("|")
    .find((candidate) => candidate.includes(`poolId=${poolId}`));
  const apy = row?.match(/(?:^|,)apy=([^,]+)/)?.[1];

  return apy ? Number(apy).toFixed(2) : undefined;
}

function relativeAge(timestamp: bigint | undefined) {
  if (!timestamp) {
    return undefined;
  }

  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - Number(timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function venueByPoolId(poolId: string | undefined) {
  return goalPolicy.supportedVenues.find((venue) => venue.poolId === poolId);
}

export default function Home() {
  const router = useRouter();
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [goal, setGoal] = useState("");
  const [goalId, setGoalId] = useState<bigint>();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const goalSupport = useMemo(() => classifyGoalSupport(goal), [goal]);
  const walletChainKnown = !isConnected || typeof chainId === "number";
  const mustSwitchToSomnia = Boolean(isConnected && typeof chainId === "number" && chainId !== somniaTestnet.id);

  const recentContracts = featuredGoalIds.flatMap((id) => [
    {
      address: goalRegistryAddress,
      abi: goalRegistryAbi,
      functionName: "getGoal",
      args: [id],
      chainId: somniaTestnet.id,
    },
    {
      address: receiptLogAddress,
      abi: receiptLogAbi,
      functionName: "getEntries",
      args: [id],
      chainId: somniaTestnet.id,
    },
  ] as const);

  const { data: recentData } = useReadContracts({
    contracts: recentContracts,
    query: { refetchInterval: 15_000 },
  });

  const recentReceipts = useMemo(
    () =>
      featuredGoalIds
        .map((id, index) => {
          const goalResult = recentData?.[index * 2];
          const receiptsResult = recentData?.[index * 2 + 1];

          if (goalResult?.status !== "success" || receiptsResult?.status !== "success") {
            return undefined;
          }

          const compiledGoal = goalResult.result as GoalStruct;
          const receipts = receiptsResult.result as readonly ReceiptEntry[];
          if (!compiledGoal || compiledGoal.status < 2) {
            return undefined;
          }

          const decision = parseDecision(receipts);
          const venue = venueByPoolId(decision?.poolId);
          if (!venue || !decision?.poolId) {
            return undefined;
          }

          return {
            goalId: id.toString(),
            goal: compiledGoal.naturalLanguage,
            poolId: decision.poolId,
            venueLabel: venue.label,
            objective: decision.objectiveMatched,
            apy: parseRatesApy(receipts, decision.poolId),
            age: relativeAge(compiledGoal.createdAt),
          };
        })
        .filter(Boolean),
    [recentData],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % examplePrompts.length);
    }, 3_200);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!receipt.data) {
      return;
    }

    const logs = parseEventLogs({
      abi: goalRegistryAbi,
      eventName: "GoalPosted",
      logs: receipt.data.logs,
    });
    if (logs[0]) {
      setGoalId(logs[0].args.goalId);
      router.push(`/intent/${logs[0].args.goalId.toString()}`);
    }
  }, [receipt.data, router]);

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalSupport.supported) {
      return;
    }

    if (mustSwitchToSomnia) {
      switchChain({ chainId: somniaTestnet.id });
      return;
    }

    writeContract({
      address: goalRegistryAddress,
      abi: goalRegistryAbi,
      functionName: "postGoal",
      args: [
        goal,
        arbitrumUsdc,
        parseUnits("1", 6),
        BigInt(42161),
        goalSupport.compilerConstraints,
        BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
      ],
      value: parseEther("0.6"),
      chainId: somniaTestnet.id,
    });
  }

  const showUnsupported = goal && !goalSupport.supported;

  return (
    <main className="page-shell home-shell">
      <section className="hero-copy">
        <p className="eyebrow">On-chain intent compiler</p>
        <h1 className="hero-title">
          Describe the outcome.
          <br />
          Asshai compiles the best on-chain path.
        </h1>
      </section>

      <form className="composer" onSubmit={submitGoal}>
        <div className="composer-input-wrap">
          <textarea
            className="composer-textarea"
            id="goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={examplePrompts[placeholderIndex]}
            required
          />
          <span className="compile-hint">⌘ ↵ to compile</span>
        </div>

        {showUnsupported ? (
          <motion.div
            className="unsupported-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <span className="unsupported-icon">
              <ShieldAlert size={24} />
            </span>
            <div>
              <strong>{goalSupport.reason}</strong>
              <p>Try a one-time USDC yield allocation instead.</p>
            </div>
          </motion.div>
        ) : null}

        {goalSupport.warnings.map((warning) => (
          <p className="tx-result" key={warning}>
            {warning}
          </p>
        ))}

        <button
          className="primary-cta"
          type="submit"
          disabled={!isConnected || !walletChainKnown || isPending || !goalSupport.supported}
        >
          {isPending
            ? "Submitting to Somnia..."
            : !walletChainKnown
              ? "Checking wallet network..."
              : mustSwitchToSomnia
                ? "Switch to Somnia Testnet"
                : "Compile intent"}
        </button>

        <p className="somnia-note">
          <span aria-hidden="true">✶</span>
          Backed by <strong>Somnia</strong> consensus. Audit every decision.
        </p>
      </form>

      <section className="receipt-feed">
        <p className="section-kicker">Recently compiled receipts</p>
        <div className="receipt-list">
          {recentReceipts.map((receipt) =>
            receipt ? <ReceiptCard key={receipt.goalId} {...receipt} /> : null,
          )}
        </div>
      </section>

      {hash ? <p className="tx-result">Transaction: {hash}</p> : null}
      {receipt.isLoading ? <p className="tx-result">Waiting for confirmation...</p> : null}
      {goalId !== undefined ? (
        <p className="tx-result">
          Goal: <a href={`/intent/${goalId.toString()}`}>{goalId.toString()}</a>
        </p>
      ) : null}
      {error ? <p className="tx-result">Error: {error.message}</p> : null}
    </main>
  );
}
