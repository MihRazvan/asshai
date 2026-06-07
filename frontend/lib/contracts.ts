import type { Address } from "viem";

export const goalRegistryAddress = (process.env.NEXT_PUBLIC_GOAL_REGISTRY_ADDRESS ||
  "0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6") as Address;

export const compilerEngineAddress = (process.env.NEXT_PUBLIC_COMPILER_ENGINE_ADDRESS ||
  "0x9B09F49133D227203C0b9CC4A83548E80D38B079") as Address;

export const receiptLogAddress = (process.env.NEXT_PUBLIC_RECEIPT_LOG_ADDRESS ||
  "0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1") as Address;

export const intentStoreAddress = (process.env.NEXT_PUBLIC_INTENT_STORE_ADDRESS ||
  "0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea") as Address;

export const addressRegistryAddress = (process.env.NEXT_PUBLIC_ADDRESS_REGISTRY_ADDRESS ||
  "0x146bd5510D7B488d936b23040062e2ca8Fc26E76") as Address;

export const standardOrderEncoderAddress = (process.env.NEXT_PUBLIC_STANDARD_ORDER_ENCODER_ADDRESS ||
  "0xB9084F50D6F75006953F69741762548990B334E7") as Address;

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
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "originChainId", type: "uint256" },
          { name: "expires", type: "uint32" },
          { name: "fillDeadline", type: "uint32" },
          { name: "inputOracle", type: "address" },
          { name: "inputs", type: "uint256[2][]" },
          {
            name: "outputs",
            type: "tuple[]",
            components: [
              { name: "oracle", type: "bytes32" },
              { name: "settler", type: "bytes32" },
              { name: "chainId", type: "uint256" },
              { name: "token", type: "bytes32" },
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "bytes32" },
              { name: "callbackData", type: "bytes" },
              { name: "context", type: "bytes" },
            ],
          },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Open",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      {
        name: "order",
        type: "tuple",
        indexed: false,
        components: [
          { name: "user", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "originChainId", type: "uint256" },
          { name: "expires", type: "uint32" },
          { name: "fillDeadline", type: "uint32" },
          { name: "inputOracle", type: "address" },
          { name: "inputs", type: "uint256[2][]" },
          {
            name: "outputs",
            type: "tuple[]",
            components: [
              { name: "oracle", type: "bytes32" },
              { name: "settler", type: "bytes32" },
              { name: "chainId", type: "uint256" },
              { name: "token", type: "bytes32" },
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "bytes32" },
              { name: "callbackData", type: "bytes" },
              { name: "context", type: "bytes" },
            ],
          },
        ],
      },
    ],
  },
] as const;
