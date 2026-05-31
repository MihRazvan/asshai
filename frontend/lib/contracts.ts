import type { Address } from "viem";

export const goalRegistryAddress = (process.env.NEXT_PUBLIC_GOAL_REGISTRY_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const compilerEngineAddress = (process.env.NEXT_PUBLIC_COMPILER_ENGINE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const receiptLogAddress = (process.env.NEXT_PUBLIC_RECEIPT_LOG_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const intentStoreAddress = (process.env.NEXT_PUBLIC_INTENT_STORE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const addressRegistryAddress = (process.env.NEXT_PUBLIC_ADDRESS_REGISTRY_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const standardOrderEncoderAddress = (process.env.NEXT_PUBLIC_STANDARD_ORDER_ENCODER_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as Address;

export const goalRegistryAbi = [
  {
    type: "function",
    name: "postGoal",
    stateMutability: "payable",
    inputs: [
      { name: "nl", type: "string" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "chainId", type: "uint256" },
      { name: "constraints", type: "string[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "goalId", type: "uint256" }],
  },
  {
    type: "event",
    name: "GoalPosted",
    inputs: [
      { name: "goalId", type: "uint256", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "sourceChainId", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
] as const;
