#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";

const INPUT_SETTLER_ESCROW = "0x000025c3226C00B2Cdc200005a1600509f4e00C0";
const DEFAULT_ORDER_API = "https://asshai.vercel.app/api/order";
const DEFAULT_ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";

const escrowAbi = [
  {
    type: "function",
    name: "refund",
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
];

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;

    const raw = valueParts.join("=").trim();
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

function usage() {
  console.error("Usage: pnpm refund:order <onChainOrderId> [--dry-run]");
  process.exit(1);
}

function normalizeOrder(order) {
  return {
    user: getAddress(order.user),
    nonce: BigInt(order.nonce),
    originChainId: BigInt(order.originChainId),
    expires: Number(order.expires),
    fillDeadline: Number(order.fillDeadline),
    inputOracle: getAddress(order.inputOracle),
    inputs: order.inputs.map(([token, amount]) => [BigInt(token), BigInt(amount)]),
    outputs: order.outputs.map((output) => ({
      oracle: output.oracle,
      settler: output.settler,
      chainId: BigInt(output.chainId),
      token: output.token,
      amount: BigInt(output.amount),
      recipient: output.recipient,
      callbackData: output.callbackData ?? output.call ?? "0x",
      context: output.context ?? "0x",
    })),
  };
}

async function main() {
  loadDotEnv();

  const orderId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!orderId || orderId.startsWith("--")) usage();

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY is missing from .env");

  const orderApi = process.env.ORDER_STATUS_API ?? DEFAULT_ORDER_API;
  const rpcUrl = process.env.ARBITRUM_RPC ?? DEFAULT_ARBITRUM_RPC;
  const response = await fetch(`${orderApi}?onChainOrderId=${orderId}`);
  if (!response.ok) {
    throw new Error(`Order API returned ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  if (!payload.order) {
    throw new Error(payload.message ?? "Order API response did not include an order");
  }

  const status = payload.meta?.orderStatus ?? "unknown";
  const order = normalizeOrder(payload.order);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date(order.expires * 1000).toISOString();

  console.log(`Order: ${orderId}`);
  console.log(`Status: ${status}`);
  console.log(`Expires: ${expiresAt}`);

  if (status === "Refunded") {
    console.log(`Already refunded: ${payload.meta?.refundTxHash ?? "tx unknown"}`);
    return;
  }
  if (status === "Settled" || status === "Delivered") {
    throw new Error(`Order is ${status}; it is not refundable.`);
  }
  if (now <= order.expires) {
    throw new Error(`Order has not expired yet. Try again after ${expiresAt}.`);
  }

  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
  );
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(rpcUrl),
  });

  await publicClient.simulateContract({
    account,
    address: INPUT_SETTLER_ESCROW,
    abi: escrowAbi,
    functionName: "refund",
    args: [order],
  });
  console.log("Simulation: passed");

  if (dryRun) return;

  const hash = await walletClient.writeContract({
    address: INPUT_SETTLER_ESCROW,
    abi: escrowAbi,
    functionName: "refund",
    args: [order],
  });
  console.log(`Refund tx: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status}`);
  console.log(`Block: ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
