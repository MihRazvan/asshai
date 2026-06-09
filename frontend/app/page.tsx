"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { parseEther, parseEventLogs, parseUnits } from "viem";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { VenueLogo } from "@/components/asshai/VenueLogo";
import { PromptChips } from "@/components/home/PromptChips";
import { Button } from "@/components/ui/button";
import { goalRegistryAbi, goalRegistryAddress } from "@/lib/contracts";
import { classifyGoalSupport } from "@/lib/goal-support";
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

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const prompt = searchParams.get("prompt");
    const amount = searchParams.get("amount");
    if (prompt) setGoal(prompt);
    if (amount) setSourceAmountInput(amount);
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
