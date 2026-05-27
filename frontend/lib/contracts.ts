import type { Address } from "viem";

export const intentRegistryAddress = (process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const solverEngineAddress = (process.env.NEXT_PUBLIC_SOLVER_ENGINE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const receiptLogAddress = (process.env.NEXT_PUBLIC_RECEIPT_LOG_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const planVaultAddress = (process.env.NEXT_PUBLIC_PLAN_VAULT_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const intentRegistryAbi = [
  {
    type: "function",
    name: "postIntent",
    stateMutability: "payable",
    inputs: [
      { name: "nl", type: "string" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "chainId", type: "uint256" },
      { name: "constraints", type: "string[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "intentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "IntentPosted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "sourceChainId", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
] as const;

