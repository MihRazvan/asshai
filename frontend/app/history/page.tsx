"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { decodeAbiParameters, Hex } from "viem";
import { useReadContracts } from "wagmi";
import { ReceiptTicker } from "@/components/home/ReceiptTicker";
import { goalRegistryAbi, goalRegistryAddress, receiptLogAbi, receiptLogAddress } from "@/lib/contracts";
import { goalPolicy } from "@/lib/goal-support";
import { somniaTestnet } from "@/lib/somnia";

type StoredIntent = {
  id: string;
  prompt?: string;
};

type ReceiptEntry = {
  stepName: string;
  data: Hex;
};

type GoalStruct = {
  naturalLanguage: string;
  status: number;
  createdAt: bigint;
};

const goalStatusLabels = ["Pending", "Compiling", "Ready", "Submitted", "Settled", "Failed", "Expired"] as const;

function decodeString(data: Hex | undefined) {
  if (!data || data === "0x") return "";

  try {
    return decodeAbiParameters([{ type: "string" }], data)[0];
  } catch {
    return "";
  }
}

function parseDecision(receipts: readonly ReceiptEntry[] | undefined) {
  const decisionText = decodeString(receipts?.find((entry) => entry.stepName === "decision_built")?.data);
  if (!decisionText) return undefined;

  try {
    return JSON.parse(decisionText) as { poolId?: string; objectiveMatched?: string };
  } catch {
    return undefined;
  }
}

function parseRatesApy(receipts: readonly ReceiptEntry[] | undefined, poolId: string | undefined) {
  if (!poolId) return undefined;

  const ratesText = decodeString(receipts?.find((entry) => entry.stepName === "rates_fetched")?.data);
  const row = ratesText.split("|").find((candidate) => candidate.includes(`poolId=${poolId}`));
  const apy = row?.match(/(?:^|,)apy=([^,]+)/)?.[1];

  return apy ? Number(apy).toFixed(2) : undefined;
}

function relativeAge(timestamp: bigint | undefined) {
  if (!timestamp) return undefined;

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

export default function HistoryPage() {
  const [items, setItems] = useState<StoredIntent[]>([]);
  const historyGoalIds = useMemo(() => items.map((item) => BigInt(item.id)).slice(0, 12), [items]);

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
          const fallback = items[index];

          if (goalResult?.status !== "success" || receiptsResult?.status !== "success") {
            return fallback
              ? {
                  goalId: fallback.id,
                  goal: fallback.prompt || `Intent ${fallback.id}`,
                  status: "Loading",
                }
              : undefined;
          }

          const compiledGoal = goalResult.result as GoalStruct;
          const receipts = receiptsResult.result as readonly ReceiptEntry[];
          const decision = parseDecision(receipts);
          const venue = venueByPoolId(decision?.poolId);

          return {
            goalId: id.toString(),
            goal: compiledGoal?.naturalLanguage || fallback?.prompt || `Intent ${id.toString()}`,
            poolId: decision?.poolId,
            venueLabel: venue?.label,
            objective: decision?.objectiveMatched,
            apy: parseRatesApy(receipts, decision?.poolId),
            age: relativeAge(compiledGoal?.createdAt),
            status: goalStatusLabels[compiledGoal?.status] ?? "Unknown",
          };
        })
        .filter(Boolean),
    [historyGoalIds, items, recentData],
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("asshai-recent-intents") ?? "[]") as StoredIntent[];
      setItems(stored.filter((item) => item.id && /^\d+$/.test(item.id)));
    } catch {
      setItems([]);
    }
  }, []);

  return (
    <main className="page-shell utility-page centered-utility">
      <section className="utility-header centered">
        <p className="eyebrow">Local history</p>
        <h1>Compiled intents</h1>
      </section>

      {items.length === 0 ? (
        <div className="empty-cta centered-empty">
          <h2>No local intents yet</h2>
          <p>Compile an intent and it will appear here.</p>
          <Link href="/">
            Compose intent
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <ReceiptTicker receipts={recentReceipts} title="Local intents" showViewAll={false} />
      )}
    </main>
  );
}
