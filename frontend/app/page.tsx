"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseEther, parseEventLogs, parseUnits } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { goalRegistryAbi, goalRegistryAddress } from "@/lib/contracts";
import { classifyGoalSupport } from "@/lib/goal-support";

const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

export default function Home() {
  const { isConnected } = useAccount();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [goal, setGoal] = useState("");
  const [goalId, setGoalId] = useState<bigint>();
  const goalSupport = useMemo(() => classifyGoalSupport(goal), [goal]);

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
    }
  }, [receipt.data]);

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalSupport.supported) {
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
    });
  }

  return (
    <main>
      <h1>Asshai Goal Compiler</h1>
      <ConnectButton />
      <form onSubmit={submitGoal}>
        <label htmlFor="goal">Goal</label>
        <textarea
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="maximize my USDC yield, 7-day lockup max, low risk"
          required
        />
        {goal && !goalSupport.supported ? <p>Unsupported: {goalSupport.reason}</p> : null}
        {goalSupport.warnings.map((warning) => (
          <p key={warning}>Warning: {warning}</p>
        ))}
        {goal ? (
          <section>
            <h2>Executable envelope</h2>
            <p>Policy: {goalSupport.policyVersion}</p>
            <p>
              Source: {goalSupport.source.tokenSymbol} on {goalSupport.source.chainName} (
              {goalSupport.source.chainId})
            </p>
            <p>
              Intent shape: {goalSupport.intentShape.standard}, {goalSupport.intentShape.allocationMode} allocation,
              max {goalSupport.intentShape.maxOutputs} output
            </p>
            <p>
              Execution: {goalSupport.execution.provider}, {goalSupport.execution.quoteReadiness} quotes
            </p>
            <p>Candidate pools: {goalSupport.candidatePoolIds.join(", ")}</p>
            <ul>
              {goalSupport.supportedVenues.map((venue) => (
                <li key={venue.poolId}>
                  {venue.label}: {venue.executionType}, risk {venue.riskTier},{" "}
                  {venue.callbackRequired ? "callback required" : "no callback"}. {venue.riskNotes}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <button type="submit" disabled={!isConnected || isPending || !goalSupport.supported}>
          {isPending ? "Submitting..." : "Submit goal"}
        </button>
      </form>
      {hash ? <p>Transaction: {hash}</p> : null}
      {receipt.isLoading ? <p>Waiting for confirmation...</p> : null}
      {goalId !== undefined ? (
        <p>
          Goal: <a href={`/intent/${goalId.toString()}`}>{goalId.toString()}</a>
        </p>
      ) : null}
      {error ? <p>Error: {error.message}</p> : null}
    </main>
  );
}
