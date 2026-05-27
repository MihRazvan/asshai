"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { FormEvent, useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { intentRegistryAbi, intentRegistryAddress } from "@/lib/contracts";

export default function Home() {
  const { isConnected } = useAccount();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const [intent, setIntent] = useState("");

  function submitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeContract({
      address: intentRegistryAddress,
      abi: intentRegistryAbi,
      functionName: "postIntent",
      args: [
        intent,
        zeroAddress,
        BigInt(0),
        BigInt(42161),
        ["risk-low", "stablecoin"],
        BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
      ],
      value: BigInt(0),
    });
  }

  return (
    <main>
      <h1>Asshai Intent Submission</h1>
      <ConnectButton />
      <form onSubmit={submitIntent}>
        <label htmlFor="intent">Intent</label>
        <textarea
          id="intent"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="maximize my USDC yield, 7-day lockup max, low risk"
          required
        />
        <button type="submit" disabled={!isConnected || isPending}>
          {isPending ? "Submitting..." : "Submit intent"}
        </button>
      </form>
      {hash ? <p>Transaction: {hash}</p> : null}
      {error ? <p>Error: {error.message}</p> : null}
    </main>
  );
}
