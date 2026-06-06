#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base } from "viem/chains";

const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_COMPOUND_CUSDCV3 = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
const COMPOUND_CONTRACT_CALL_GAS_LIMIT = "350000";
const DEFAULT_TO_AMOUNT = "0.098";
const LIFI_BASE_URL = "https://li.quest/v1";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
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
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
];

const compoundCometAbi = [
  {
    type: "function",
    name: "supply",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
    process.env[key] = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestQuote({ account, toAmount }) {
  const headers = { "content-type": "application/json" };
  if (process.env.LIFI_API_KEY) {
    headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  }

  const response = await fetch(`${LIFI_BASE_URL}/quote/contractCall`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fromChain: arbitrum.id,
      toChain: base.id,
      fromToken: ARBITRUM_USDC,
      toToken: BASE_USDC,
      toAmount: toAmount.toString(),
      fromAddress: account.address,
      toContractAddress: BASE_COMPOUND_CUSDCV3,
      toContractCallData: encodeFunctionData({
        abi: compoundCometAbi,
        functionName: "supply",
        args: [BASE_USDC, toAmount],
      }),
      toContractGasLimit: COMPOUND_CONTRACT_CALL_GAS_LIMIT,
      toApprovalAddress: BASE_COMPOUND_CUSDCV3,
      contractOutputsToken: BASE_COMPOUND_CUSDCV3,
      integrator: "asshai",
    }),
  });
  const body = await response.json();

  if (!response.ok || !body?.transactionRequest?.to || !body?.transactionRequest?.data) {
    throw new Error(`LI.FI quote failed (${response.status}): ${body?.message ?? JSON.stringify(body)}`);
  }

  return body;
}

async function pollStatus(txHash) {
  for (let i = 0; i < 36; i++) {
    const response = await fetch(
      `${LIFI_BASE_URL}/status?txHash=${txHash}&fromChain=${arbitrum.id}&toChain=${base.id}`,
    );
    const body = await response.json();
    const label = body?.status
      ? `${body.status}${body.substatus ? ` / ${body.substatus}` : ""}`
      : body?.message ?? JSON.stringify(body);
    console.log(`LI.FI status: ${label}`);

    if (body?.status === "DONE" || body?.status === "FAILED") {
      return body;
    }

    await sleep(5_000);
  }

  return undefined;
}

async function main() {
  loadDotEnv();

  const toAmount = parseUnits(argValue("to-amount", DEFAULT_TO_AMOUNT), 6);
  const dryRun = hasFlag("dry-run");
  const privateKey = requireEnv("PRIVATE_KEY");
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const arbitrumClient = createPublicClient({
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC ?? "https://arb1.arbitrum.io/rpc"),
  });
  const baseClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC ?? "https://mainnet.base.org"),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC ?? "https://arb1.arbitrum.io/rpc"),
  });

  const [usdcBalance, ethBalance, cTokenDecimals, cTokenBefore] = await Promise.all([
    arbitrumClient.readContract({
      address: ARBITRUM_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }),
    arbitrumClient.getBalance({ address: account.address }),
    baseClient.readContract({
      address: BASE_COMPOUND_CUSDCV3,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    baseClient.readContract({
      address: BASE_COMPOUND_CUSDCV3,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);

  console.log(`Wallet: ${account.address}`);
  console.log(`Arbitrum USDC before: ${formatUnits(usdcBalance, 6)}`);
  console.log(`Arbitrum ETH before: ${formatUnits(ethBalance, 18)}`);
  console.log(`Base cUSDCv3 before: ${formatUnits(cTokenBefore, cTokenDecimals)}`);
  console.log(`Requested Compound supply amount: ${formatUnits(toAmount, 6)} Base USDC`);

  const quote = await requestQuote({ account, toAmount });
  const fromAmount = BigInt(quote.estimate?.fromAmount ?? "0");
  const approvalAddress = getAddress(quote.estimate?.approvalAddress ?? quote.transactionRequest.to);
  console.log(`LI.FI steps: ${quote.includedSteps?.map((step) => step.tool ?? step.type ?? "step").join(" -> ")}`);
  console.log(`Required Arbitrum USDC: ${formatUnits(fromAmount, 6)}`);
  console.log(`Approval spender: ${approvalAddress}`);
  console.log(`Route target: ${quote.transactionRequest.to}`);
  console.log(`Native route value: ${BigInt(quote.transactionRequest.value ?? "0").toString()} wei`);

  if (dryRun) {
    console.log("Dry run only. No approval or route transaction sent.");
    return;
  }

  if (usdcBalance < fromAmount) {
    throw new Error(`Insufficient USDC: need ${formatUnits(fromAmount, 6)}, have ${formatUnits(usdcBalance, 6)}`);
  }

  const allowance = await arbitrumClient.readContract({
    address: ARBITRUM_USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, approvalAddress],
  });

  if (allowance < fromAmount) {
    const approveHash = await walletClient.writeContract({
      address: ARBITRUM_USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [approvalAddress, fromAmount],
    });
    console.log(`Approval tx: ${approveHash}`);
    await arbitrumClient.waitForTransactionReceipt({ hash: approveHash });
  } else {
    console.log(`Existing allowance is enough: ${formatUnits(allowance, 6)} USDC`);
  }

  const routeHash = await walletClient.sendTransaction({
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: BigInt(quote.transactionRequest.value ?? "0"),
    gas: quote.transactionRequest.gasLimit ? BigInt(quote.transactionRequest.gasLimit) : undefined,
  });
  console.log(`Route tx: ${routeHash}`);
  await arbitrumClient.waitForTransactionReceipt({ hash: routeHash });
  console.log("Source transaction confirmed.");

  const status = await pollStatus(routeHash);
  await sleep(5_000);

  const cTokenAfter = await baseClient.readContract({
    address: BASE_COMPOUND_CUSDCV3,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`Base cUSDCv3 after: ${formatUnits(cTokenAfter, cTokenDecimals)}`);
  console.log(`Base cUSDCv3 delta: ${formatUnits(cTokenAfter - cTokenBefore, cTokenDecimals)}`);

  if (status?.status !== "DONE" || cTokenAfter <= cTokenBefore) {
    throw new Error("Compound smoke did not confirm a positive cUSDCv3 balance delta.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
