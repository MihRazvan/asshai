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

export const inputSettlerEscrowAddress = "0x000025c3226C00B2Cdc200005a1600509f4e00C0" as Address;

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
    type: "function",
    name: "getGoal",
    stateMutability: "view",
    inputs: [{ name: "goalId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "author", type: "address" },
          { name: "naturalLanguage", type: "string" },
          { name: "sourceAsset", type: "address" },
          { name: "sourceAmount", type: "uint256" },
          { name: "sourceChainId", type: "uint256" },
          { name: "constraints", type: "string[]" },
          { name: "deadline", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
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

export const intentStoreAbi = [
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "goalId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "getIntentHash",
    stateMutability: "view",
    inputs: [{ name: "goalId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

export const receiptLogAbi = [
  {
    type: "function",
    name: "getEntries",
    stateMutability: "view",
    inputs: [{ name: "goalId", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "goalId", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "stepName", type: "string" },
          { name: "data", type: "bytes" },
          { name: "agentRequestId", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const inputSettlerEscrowAbi = [
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [{ name: "order", type: "bytes" }],
    outputs: [],
  },
] as const;
