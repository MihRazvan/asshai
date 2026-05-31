"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { FormEvent, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { goalRegistryAbi, goalRegistryAddress } from "@/lib/contracts";

const arbitrumUsdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

export default function Home() {
  const { isConnected } = useAccount();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const [goal, setGoal] = useState("");

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeContract({
      address: goalRegistryAddress,
      abi: goalRegistryAbi,
      functionName: "postGoal",
      args: [
        goal,
        arbitrumUsdc,
        parseUnits("1000", 6),
        BigInt(42161),
        ["risk-low", "stablecoin"],
        BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
      ],
      value: BigInt(0),
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
        <button type="submit" disabled={!isConnected || isPending}>
          {isPending ? "Submitting..." : "Submit goal"}
        </button>
      </form>
      {hash ? <p>Transaction: {hash}</p> : null}
      {error ? <p>Error: {error.message}</p> : null}
    </main>
  );
}
