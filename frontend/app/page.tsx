"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { decodeAbiParameters, Hex, parseEther, parseEventLogs, parseUnits } from "viem";
import { useAccount, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { PromptChips } from "@/components/home/PromptChips";
import { ReceiptTicker } from "@/components/home/ReceiptTicker";
import { Button } from "@/components/ui/button";
import { goalRegistryAbi, goalRegistryAddress, receiptLogAbi, receiptLogAddress } from "@/lib/contracts";
import { classifyGoalSupport, goalPolicy } from "@/lib/goal-support";
import { somniaTestnet } from "@/lib/somnia";

const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const examplePrompts = [
  "maximize my USDC yield, 7-day lockup",
  "safest stablecoin yield, no lockup, prefer Base",
  "find me 8%+ if possible, but don't use sketchy pools",
];
const headlinePrompts = [
  "What should your USDC do next?",
  "Where should your stables earn?",
  "Describe the yield you want.",
];
const goalStatusLabels = ["Pending", "Compiling", "Ready", "Submitted", "Settled", "Failed", "Expired"] as const;

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
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [goal, setGoal] = useState("");
  const [sourceAmountInput, setSourceAmountInput] = useState("1");
  const [goalId, setGoalId] = useState<bigint>();
  const [historyGoalIds, setHistoryGoalIds] = useState<bigint[]>([]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [typedHeadline, setTypedHeadline] = useState("");
  const goalSupport = useMemo(() => classifyGoalSupport(goal), [goal]);
  const sourceAmount = useMemo(() => {
    const trimmed = sourceAmountInput.trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(trimmed)) {
      return undefined;
    }

    try {
      const parsed = parseUnits(trimmed, 6);
      return parsed > 0n ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [sourceAmountInput]);
  const walletChainKnown = !isConnected || typeof chainId === "number";
  const mustSwitchToSomnia = Boolean(isConnected && typeof chainId === "number" && chainId !== somniaTestnet.id);

  const recentContracts = historyGoalIds.flatMap((id) => [
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
    query: { enabled: recentContracts.length > 0, refetchInterval: 15_000 },
  });

  const recentReceipts = useMemo(
    () =>
      historyGoalIds
        .map((id, index) => {
          const goalResult = recentData?.[index * 2];
          const receiptsResult = recentData?.[index * 2 + 1];

          if (goalResult?.status !== "success" || receiptsResult?.status !== "success") {
            return undefined;
          }

          const compiledGoal = goalResult.result as GoalStruct;
          const receipts = receiptsResult.result as readonly ReceiptEntry[];
          if (!compiledGoal?.naturalLanguage) {
            return undefined;
          }

          const decision = parseDecision(receipts);
          const venue = venueByPoolId(decision?.poolId);

          return {
            goalId: id.toString(),
            goal: compiledGoal.naturalLanguage,
            poolId: decision?.poolId,
            venueLabel: venue?.label,
            objective: decision?.objectiveMatched,
            apy: parseRatesApy(receipts, decision?.poolId),
            age: relativeAge(compiledGoal.createdAt),
            status: goalStatusLabels[compiledGoal.status] ?? "Unknown",
          };
        })
        .filter(Boolean),
    [historyGoalIds, recentData],
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const prompt = searchParams.get("prompt");
    const amount = searchParams.get("amount");
    if (prompt) setGoal(prompt);
    if (amount) setSourceAmountInput(amount);
    try {
      const stored = JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]") as {
        id?: string;
      }[];
      setHistoryGoalIds(
        stored
          .map((item) => item.id)
          .filter((id): id is string => typeof id === "string" && /^\d+$/.test(id))
          .map((id) => BigInt(id))
          .slice(0, 6),
      );
    } catch {
      setHistoryGoalIds([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % examplePrompts.length);
    }, 3_200);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const phrase = headlinePrompts[headlineIndex];

    async function animateHeadline() {
      setTypedHeadline("");

      for (let index = 1; index <= phrase.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 42));
        if (cancelled) return;
        setTypedHeadline(phrase.slice(0, index));
      }

      await new Promise((resolve) => window.setTimeout(resolve, 15_000));
      if (!cancelled) {
        setHeadlineIndex((current) => (current + 1) % headlinePrompts.length);
      }
    }

    void animateHeadline();

    return () => {
      cancelled = true;
    };
  }, [headlineIndex]);

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
      try {
        const existing = JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]") as {
          id: string;
          prompt?: string;
        }[];
        window.localStorage.setItem(
          "asshai-recent-intents",
          JSON.stringify([{ id: logs[0].args.goalId.toString(), prompt: goal }, ...existing].slice(0, 8)),
        );
      } catch {
        // Recent intent storage is best-effort.
      }
      router.push(`/intent/${logs[0].args.goalId.toString()}`);
    }
  }, [goal, receipt.data, router]);

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!goalSupport.supported) {
      return;
    }

    if (!sourceAmount) {
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
        sourceAmount,
        BigInt(42161),
        goalSupport.compilerConstraints,
        BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
      ],
      value: parseEther("0.6"),
      chainId: somniaTestnet.id,
    });
  }

  const showUnsupported = goal && !goalSupport.supported;

  const buttonLabel = isPending
    ? "Submitting to Somnia..."
    : !isConnected
      ? "Connect wallet"
    : !walletChainKnown
      ? "Checking wallet network..."
      : mustSwitchToSomnia
        ? "Switch network"
        : "Compile intent";

  return (
    <main className="page-shell home-shell">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="eyebrow">On-chain intent compiler</p>
        <h1 className="typed-headline" id="home-title">
          {typedHeadline}
          <span aria-hidden="true" />
        </h1>
      </section>

      <form className="composer" onSubmit={submitGoal}>
        <section className="home-composer-card">
          <div className="composer-input-wrap">
            <textarea
              className="composer-textarea"
              id="goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={examplePrompts[placeholderIndex]}
              required
            />
            <span className="compile-hint">⌘ ↵</span>
          </div>

          <div className="composer-control-row">
            <PromptChips
              onSelect={(prompt, amount) => {
                setGoal(prompt);
                setSourceAmountInput(amount);
              }}
            />

            <div className="composer-action-row">
              <label className="amount-inline" htmlFor="source-amount">
                <span>Amount</span>
                <div className="amount-input-wrap">
                  <input
                    id="source-amount"
                    inputMode="decimal"
                    min="0"
                    pattern="[0-9]+([.][0-9]{1,6})?"
                    title="Enter a USDC amount greater than 0, up to 6 decimals."
                    type="text"
                    value={sourceAmountInput}
                    onChange={(event) => setSourceAmountInput(event.target.value)}
                    placeholder="1"
                  />
                  <span className="amount-token">
                    <VenueLogo poolId="usdc" label="USDC" size={18} />
                    USDC
                  </span>
                </div>
              </label>

              <Button
                className="primary-cta compact"
                type="submit"
                disabled={!walletChainKnown || isPending || !goalSupport.supported || !sourceAmount}
              >
                <span className="truncate">{buttonLabel}</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        {!sourceAmount ? <p className="tx-result">Enter a USDC amount greater than 0, up to 6 decimals.</p> : null}

        {showUnsupported ? (
          <motion.div
            className="mt-4 flex items-start gap-3 border-t border-white/[0.09] px-1 pt-4 text-sm text-white/62"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <span className="mt-0.5 text-white/50">
              <ShieldAlert size={24} />
            </span>
            <div>
              <strong className="font-serif text-lg font-normal text-white">{goalSupport.reason}</strong>
              <p className="mt-1">Try a one-time USDC yield allocation instead.</p>
            </div>
          </motion.div>
        ) : null}

        {goalSupport.warnings.filter((warning) => !warning.includes("No source asset was specified")).map((warning) => (
          <p className="tx-result" key={warning}>
            {warning}
          </p>
        ))}
      </form>

      <div>
        <ReceiptTicker receipts={recentReceipts} />
      </div>

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
