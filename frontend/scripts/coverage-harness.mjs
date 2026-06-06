#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isHex,
  parseEther,
  parseEventLogs,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { defineChain } from "viem";
import { classifyGoalSupport } from "./goal-support.mjs";

const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_COMPOUND_CUSDCV3 = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
const COMPOUND_CONTRACT_CALL_GAS_LIMIT = "350000";
const DEFAULT_AMOUNT = "0.1";
const DEFAULT_COMPILATION_VALUE_STT = "0.6";
const DEFAULT_REPORT_PATH = "docs/coverage/latest.json";
const DEFAULT_SOMNIA_RPC = "https://api.infra.testnet.somnia.network/";

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Somnia Test Token",
    symbol: "STT",
  },
  rpcUrls: {
    default: { http: [DEFAULT_SOMNIA_RPC] },
  },
  testnet: true,
});

const promptCases = [
  {
    id: "max_yield_7d",
    prompt: "maximize my USDC yield, 7-day lockup",
    expected: "supported",
  },
  {
    id: "safest_no_lockup_base",
    prompt: "safest stablecoin yield, no lockup, prefer Base",
    expected: "supported",
  },
  {
    id: "low_gas_low_risk",
    prompt: "I want low gas and low risk for USDC",
    expected: "supported",
  },
  {
    id: "target_8_percent",
    prompt: "find me 8%+ if possible, but don't use sketchy pools",
    expected: "supported_with_reasonable_fallback",
  },
  {
    id: "plain_language_week",
    prompt: "put my stables somewhere safe for a week",
    expected: "supported",
  },
  {
    id: "prefer_ethereum",
    prompt: "prefer Ethereum even if APY is lower",
    expected: "supported_or_reject_if_unexecutable",
  },
  {
    id: "split_two_safest",
    prompt: "split between the two safest USDC venues",
    expected: "unsupported_until_multi_route",
  },
  {
    id: "conditional_eth_drop",
    prompt: "rebalance if ETH drops",
    expected: "unsupported_conditional",
  },
  {
    id: "use_usdt",
    prompt: "use USDT",
    expected: "unsupported_token",
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

const goalRegistryAbi = [
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
];

const intentStoreAbi = [
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
];

const receiptLogAbi = [
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
];

const standardOrderAbi = [
  {
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
];

const goalStatusLabels = [
  "Pending",
  "Compiling",
  "IntentReady",
  "Submitted",
  "Settled",
  "Failed",
  "Expired",
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

function tokenIdentifierToAddress(tokenIdentifier) {
  return `0x${tokenIdentifier.toString(16).padStart(40, "0").slice(-40)}`;
}

function bytes32ToAddress(value) {
  return `0x${value.slice(-40)}`;
}

function decodeYieldAction(callbackData) {
  if (!callbackData || callbackData === "0x") return undefined;

  try {
    const [goalId, beneficiary, deliveryToken, positionToken, strategyId, minAmount] = decodeAbiParameters(
      [
        { name: "goalId", type: "uint256" },
        { name: "beneficiary", type: "address" },
        { name: "deliveryToken", type: "address" },
        { name: "positionToken", type: "address" },
        { name: "strategyId", type: "bytes32" },
        { name: "minAmount", type: "uint256" },
      ],
      callbackData,
    );

    return {
      goalId: goalId.toString(),
      beneficiary,
      deliveryToken,
      positionToken,
      strategyId,
      minAmount: minAmount.toString(),
    };
  } catch {
    return undefined;
  }
}

function decodeString(data) {
  if (!data || data === "0x") return "";

  try {
    return decodeAbiParameters([{ type: "string" }], data)[0];
  } catch {
    return data;
  }
}

function decodeOrder(encoded) {
  if (!encoded || encoded === "0x" || !isHex(encoded)) return undefined;
  return decodeAbiParameters(standardOrderAbi, encoded)[0];
}

function stringifyBigInts(value) {
  return JSON.parse(
    JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postGoal({ walletClient, publicClient, addresses, prompt, amountRaw, compilationValue, constraints }) {
  const hash = await walletClient.writeContract({
    address: addresses.goalRegistry,
    abi: goalRegistryAbi,
    functionName: "postGoal",
    args: [
      prompt,
      ARBITRUM_USDC,
      amountRaw,
      42161n,
      constraints,
      BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
    ],
    value: compilationValue,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: goalRegistryAbi,
    eventName: "GoalPosted",
    logs: receipt.logs,
  });
  const goalId = logs[0]?.args.goalId;
  if (goalId === undefined) throw new Error(`GoalPosted event missing for tx ${hash}`);

  return { hash, goalId };
}

async function waitForCompilation({ publicClient, addresses, goalId, timeoutMs }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const goal = await publicClient.readContract({
      address: addresses.goalRegistry,
      abi: goalRegistryAbi,
      functionName: "getGoal",
      args: [goalId],
    });
    const status = Number(goal.status);

    if (status === 2 || status === 5 || status === 6) {
      return goal;
    }

    await sleep(3_000);
  }

  throw new Error(`Timed out waiting for goal ${goalId.toString()} compilation`);
}

async function readCompiled({ publicClient, addresses, goalId }) {
  const [encodedIntent, intentHash, receipts] = await Promise.all([
    publicClient.readContract({
      address: addresses.intentStore,
      abi: intentStoreAbi,
      functionName: "getIntent",
      args: [goalId],
    }),
    publicClient.readContract({
      address: addresses.intentStore,
      abi: intentStoreAbi,
      functionName: "getIntentHash",
      args: [goalId],
    }),
    publicClient.readContract({
      address: addresses.receiptLog,
      abi: receiptLogAbi,
      functionName: "getEntries",
      args: [goalId],
    }),
  ]);

  const planReceipt = receipts.find((entry) => entry.stepName === "plan_built");
  const decisionReceipt = receipts.find((entry) => entry.stepName === "decision_built");
  const selectedReceipt = receipts.find((entry) => entry.stepName === "candidates_selected");
  const planText = planReceipt ? decodeString(planReceipt.data) : "";
  const decisionText = decisionReceipt ? decodeString(decisionReceipt.data) : "";
  const selectedPoolId = selectedReceipt ? decodeString(selectedReceipt.data) : "";
  const order = decodeOrder(encodedIntent);

  return { encodedIntent, intentHash, receipts, planText, decisionText, selectedPoolId, order };
}

async function requestLifiQuote({ order }) {
  const input = order?.inputs?.[0];
  const output = order?.outputs?.[0];
  if (!input || !output) {
    return { ok: false, message: "Missing input or output" };
  }

  const sourceToken = tokenIdentifierToAddress(input[0]);
  const destinationToken = decodeYieldAction(output.callbackData)?.positionToken ?? bytes32ToAddress(output.token);
  const isCompound = destinationToken.toLowerCase() === BASE_COMPOUND_CUSDCV3.toLowerCase();
  let response;
  let body;

  if (isCompound) {
    response = await fetch("https://li.quest/v1/quote/contractCall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fromChain: Number(order.originChainId),
        toChain: Number(output.chainId),
        fromToken: sourceToken,
        toToken: BASE_USDC,
        toAmount: output.amount.toString(),
        fromAddress: order.user,
        toContractAddress: BASE_COMPOUND_CUSDCV3,
        toContractCallData: encodeFunctionData({
          abi: compoundCometAbi,
          functionName: "supply",
          args: [BASE_USDC, output.amount],
        }),
        toContractGasLimit: COMPOUND_CONTRACT_CALL_GAS_LIMIT,
        toApprovalAddress: BASE_COMPOUND_CUSDCV3,
        contractOutputsToken: BASE_COMPOUND_CUSDCV3,
        integrator: "asshai",
      }),
    });
    body = await response.json();
  } else {
  const params = new URLSearchParams({
    fromChain: order.originChainId.toString(),
    toChain: output.chainId.toString(),
    fromToken: sourceToken,
    toToken: destinationToken,
    fromAmount: input[1].toString(),
    fromAddress: order.user,
    integrator: "asshai",
  });

    response = await fetch(`https://li.quest/v1/quote?${params.toString()}`);
    body = await response.json();
  }

  if (!response.ok || !body?.transactionRequest?.to || !body?.transactionRequest?.data) {
    return {
      ok: false,
      status: response.status,
      fromChain: order.originChainId.toString(),
      toChain: output.chainId.toString(),
      fromToken: sourceToken,
      toToken: destinationToken,
      message: body?.message ?? body?.error ?? JSON.stringify(body),
    };
  }

  return {
    ok: true,
    status: response.status,
    fromChain: order.originChainId.toString(),
    toChain: output.chainId.toString(),
    fromToken: sourceToken,
    toToken: destinationToken,
    tool: body.tool,
    steps: body.includedSteps?.map((step) => step.tool ?? step.type ?? "step") ?? [],
    toAmount: body.estimate?.toAmount,
    toAmountFormatted: body.estimate?.toAmount ? formatUnits(BigInt(body.estimate.toAmount), 6) : undefined,
    toAmountMin: body.estimate?.toAmountMin,
    requestedToAmount: isCompound ? output.amount.toString() : undefined,
    requestedToAmountFormatted: isCompound ? formatUnits(output.amount, 6) : undefined,
    transactionTarget: body.transactionRequest.to,
    gasLimit: body.transactionRequest.gasLimit,
  };
}

async function main() {
  loadDotEnv();

  const amount = argValue("amount", DEFAULT_AMOUNT);
  const limit = Number(argValue("limit", String(promptCases.length)));
  const reportPath = argValue("out", DEFAULT_REPORT_PATH);
  const timeoutMs = Number(argValue("timeout-ms", "120000"));
  const compilationValue = parseEther(argValue("compilation-value", DEFAULT_COMPILATION_VALUE_STT));
  const dryRun = hasFlag("dry-run");
  const ignorePreflight = hasFlag("ignore-preflight");

  const addresses = {
    goalRegistry: getAddress(requireEnv("NEXT_PUBLIC_GOAL_REGISTRY_ADDRESS")),
    intentStore: getAddress(requireEnv("NEXT_PUBLIC_INTENT_STORE_ADDRESS")),
    receiptLog: getAddress(requireEnv("NEXT_PUBLIC_RECEIPT_LOG_ADDRESS")),
  };
  const amountRaw = parseUnits(amount, 6);
  const account = privateKeyToAccount(
    requireEnv("PRIVATE_KEY").startsWith("0x") ? requireEnv("PRIVATE_KEY") : `0x${requireEnv("PRIVATE_KEY")}`,
  );
  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http(process.env.SOMNIA_TESTNET_RPC ?? DEFAULT_SOMNIA_RPC),
  });
  const walletClient = createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(process.env.SOMNIA_TESTNET_RPC ?? DEFAULT_SOMNIA_RPC),
  });
  const arbitrumClient = createPublicClient({
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC ?? "https://arb1.arbitrum.io/rpc"),
  });

  const [usdcBalance, ethBalance] = await Promise.all([
    arbitrumClient.readContract({
      address: ARBITRUM_USDC,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [account.address],
    }),
    arbitrumClient.getBalance({ address: account.address }),
  ]);

  console.log(`Wallet: ${account.address}`);
  console.log(`Arbitrum USDC: ${formatUnits(usdcBalance, 6)}`);
  console.log(`Arbitrum ETH: ${formatUnits(ethBalance, 18)}`);
  console.log(`Per-case source amount: ${amount} USDC`);
  console.log(`LI.FI execution: disabled (quote-only)`);
  console.log(`Preflight guard: ${ignorePreflight ? "ignored" : "enabled"}`);

  if (dryRun) {
    console.log("Dry run: no Somnia compilation transactions will be sent.");
    return;
  }

  const cases = promptCases.slice(0, Math.max(0, limit));
  const results = [];

  for (const [index, testCase] of cases.entries()) {
    console.log(`\n[${index + 1}/${cases.length}] ${testCase.id}: ${testCase.prompt}`);

    const result = {
      id: testCase.id,
      prompt: testCase.prompt,
      expected: testCase.expected,
      amount,
      sourceToken: ARBITRUM_USDC,
      sourceChain: "42161",
    };

    try {
      const preflight = classifyGoalSupport(testCase.prompt);
      result.preflight = preflight;

      if (!preflight.supported && !ignorePreflight) {
        result.skipped = true;
        result.skipReason = preflight.reason;
        console.log(`  preflight rejected: ${preflight.reason}`);
        results.push(result);
        continue;
      }

      if (preflight.warnings.length > 0) {
        console.log(`  preflight warnings: ${preflight.warnings.join(" | ")}`);
      }
      console.log(`  policy: ${preflight.policyVersion}; candidates: ${preflight.candidatePoolIds.join(", ")}`);

      const posted = await postGoal({
        walletClient,
        publicClient,
        addresses,
        prompt: testCase.prompt,
        amountRaw,
        compilationValue,
        constraints: preflight.compilerConstraints,
      });
      result.goalId = posted.goalId.toString();
      result.postGoalTx = posted.hash;
      console.log(`  posted goal ${result.goalId}: ${posted.hash}`);

      const goal = await waitForCompilation({
        publicClient,
        addresses,
        goalId: posted.goalId,
        timeoutMs,
      });
      result.goalStatus = goalStatusLabels[Number(goal.status)] ?? String(goal.status);
      console.log(`  status: ${result.goalStatus}`);

      const compiled = await readCompiled({
        publicClient,
        addresses,
        goalId: posted.goalId,
      });
      result.intentHash = compiled.intentHash;
      result.planText = compiled.planText;
      result.decisionText = compiled.decisionText;
      result.selectedPoolId = compiled.selectedPoolId;
      result.receipts = compiled.receipts.map((entry) => ({
        stepName: entry.stepName,
        timestamp: entry.timestamp.toString(),
        agentRequestId: entry.agentRequestId.toString(),
      }));

      if (compiled.order) {
        const output = compiled.order.outputs[0];
        const yieldAction = output ? decodeYieldAction(output.callbackData) : undefined;
        result.decoded = {
          originChainId: compiled.order.originChainId.toString(),
          inputToken: tokenIdentifierToAddress(compiled.order.inputs[0][0]),
          inputAmount: compiled.order.inputs[0][1].toString(),
          inputAmountFormatted: formatUnits(compiled.order.inputs[0][1], 6),
          outputChainId: output?.chainId.toString(),
          outputToken: output ? bytes32ToAddress(output.token) : undefined,
          outputAmount: output?.amount.toString(),
          outputAmountFormatted: output?.amount ? formatUnits(output.amount, 6) : undefined,
          callbackPositionToken: yieldAction?.positionToken,
          callbackMinAmount: yieldAction?.minAmount,
        };

        const quote = await requestLifiQuote({ order: compiled.order });
        result.lifiQuote = quote;
        console.log(
          quote.ok
            ? `  quote: ${quote.steps.join(" -> ")} -> ${quote.toAmountFormatted} output`
            : `  quote failed: ${quote.message}`,
        );
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.log(`  error: ${result.error}`);
    }

    results.push(result);
  }

  const report = stringifyBigInts({
    generatedAt: new Date().toISOString(),
    amount,
    executionMode: "quote-only",
    cases: results,
  });
  const outputPath = resolve(process.cwd(), reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  const quoteOk = results.filter((result) => result.lifiQuote?.ok).length;
  const compiledOk = results.filter((result) => result.goalStatus === "IntentReady").length;
  const skipped = results.filter((result) => result.skipped).length;
  console.log(`\nReport: ${reportPath}`);
  console.log(`Compiled: ${compiledOk}/${results.length}`);
  console.log(`Preflight skipped: ${skipped}/${results.length}`);
  console.log(`LI.FI quote-ok: ${quoteOk}/${results.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
