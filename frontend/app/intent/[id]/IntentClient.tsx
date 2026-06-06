"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import {
  decodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  Hex,
  isHex,
} from "viem";
import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { somniaTestnet } from "@/lib/somnia";
import {
  erc20Abi,
  goalRegistryAbi,
  goalRegistryAddress,
  intentStoreAbi,
  intentStoreAddress,
  receiptLogAbi,
  receiptLogAddress,
} from "@/lib/contracts";

const goalStatuses = [
  "Pending",
  "Compiling",
  "IntentReady",
  "Submitted",
  "Settled",
  "Failed",
  "Expired",
] as const;

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_COMPOUND_CUSDCV3 = "0xb125E6687d4313864e53df431d5425969c15Eb2F" as const;
const COMPOUND_CONTRACT_CALL_GAS_LIMIT = "350000";
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
] as const;

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
] as const;

type StandardOrder = {
  user: Hex;
  nonce: bigint;
  originChainId: bigint;
  expires: number;
  fillDeadline: number;
  inputOracle: Hex;
  inputs: readonly (readonly [bigint, bigint])[];
  outputs: readonly {
    oracle: Hex;
    settler: Hex;
    chainId: bigint;
    token: Hex;
    amount: bigint;
    recipient: Hex;
    callbackData: Hex;
    context: Hex;
  }[];
};

function decodeString(data: Hex | undefined) {
  if (!data || data === "0x") {
    return "";
  }

  try {
    return decodeAbiParameters([{ type: "string" }], data)[0];
  } catch {
    return data;
  }
}

function decodeOrder(encoded: Hex | undefined) {
  if (!encoded || encoded === "0x" || !isHex(encoded)) {
    return undefined;
  }

  try {
    return decodeAbiParameters(standardOrderAbi, encoded)[0] as StandardOrder;
  } catch {
    return undefined;
  }
}

function tokenIdentifierToAddress(tokenIdentifier: bigint) {
  return `0x${tokenIdentifier.toString(16).padStart(40, "0").slice(-40)}` as Hex;
}

function bytes32ToAddress(value: Hex) {
  return `0x${value.slice(-40)}` as Hex;
}

function decodeYieldAction(callbackData: Hex) {
  if (callbackData === "0x") {
    return undefined;
  }

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

    return { goalId, beneficiary, deliveryToken, positionToken, strategyId, minAmount };
  } catch {
    return undefined;
  }
}

function finalOutputToken(output: StandardOrder["outputs"][number]) {
  return decodeYieldAction(output.callbackData)?.positionToken ?? bytes32ToAddress(output.token);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function isCompoundBaseOutput(output: StandardOrder["outputs"][number]) {
  return bytes32ToAddress(output.token).toLowerCase() === BASE_COMPOUND_CUSDCV3.toLowerCase();
}

type LifiQuote = {
  tool?: string;
  estimate?: {
    toAmount?: string;
    toAmountMin?: string;
  };
  transactionRequest?: {
    to?: Hex;
    data?: Hex;
    value?: string;
    chainId?: number;
    gasLimit?: string;
  };
  includedSteps?: readonly {
    tool?: string;
    type?: string;
  }[];
  message?: string;
};

function bigintFromRequestValue(value: string | undefined) {
  if (!value) {
    return 0n;
  }

  return BigInt(value);
}

export function IntentClient({ goalId }: { goalId: string }) {
  const parsedGoalId = BigInt(goalId);
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [lifiStatus, setLifiStatus] = useState<string>();
  const [quoteStatus, setQuoteStatus] = useState<string>();
  const [lifiQuote, setLifiQuote] = useState<LifiQuote>();
  const [executionStatus, setExecutionStatus] = useState<string>();
  const { data: approveHash, error: approveError, isPending: isApprovePending, writeContract: approve } =
    useWriteContract();
  const { data: routeHash, error: routeError, isPending: isRoutePending, sendTransaction } = useSendTransaction();

  const { data: goal } = useReadContract({
    address: goalRegistryAddress,
    abi: goalRegistryAbi,
    functionName: "getGoal",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });
  const { data: encodedIntent } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntent",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });
  const { data: intentHash } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntentHash",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });
  const { data: receipts } = useReadContract({
    address: receiptLogAddress,
    abi: receiptLogAbi,
    functionName: "getEntries",
    args: [parsedGoalId],
    chainId: somniaTestnet.id,
    query: { refetchInterval: 3_000 },
  });

  const order = useMemo(() => decodeOrder(encodedIntent as Hex | undefined), [encodedIntent]);
  const routeReceipt = useWaitForTransactionReceipt({ hash: routeHash });
  const ratesReceipt = receipts?.find((entry) => entry.stepName === "rates_fetched");
  const decisionReceipt = receipts?.find((entry) => entry.stepName === "decision_built");
  const selectedReceipt = receipts?.find((entry) => entry.stepName === "candidates_selected");
  const planReceipt = receipts?.find((entry) => entry.stepName === "plan_built");
  const ratesText = ratesReceipt ? decodeString(ratesReceipt.data as Hex) : "";
  const decisionText = decisionReceipt ? decodeString(decisionReceipt.data as Hex) : "";
  const decisionJson = decisionText ? tryParseJson(decisionText) : undefined;
  const selectedPoolId = selectedReceipt ? decodeString(selectedReceipt.data as Hex) : "";
  const planText = planReceipt ? decodeString(planReceipt.data as Hex) : "";
  const planJson = planText ? tryParseJson(planText) : undefined;

  useEffect(() => {
    if (!routeHash) return;

    const timer = window.setInterval(() => {
      void checkComposerStatus(routeHash);
    }, 5_000);

    void checkComposerStatus(routeHash);

    return () => window.clearInterval(timer);
  }, [routeHash, order]);

  useEffect(() => {
    if (routeReceipt.data?.status === "success") {
      setExecutionStatus("Source transaction confirmed. Waiting for destination execution...");
    }
  }, [routeReceipt.data?.status]);

  const input = order?.inputs[0];
  const inputToken = input ? tokenIdentifierToAddress(input[0]) : undefined;
  const inputAmount = input?.[1] ?? 0n;
  const output = order?.outputs[0];
  const outputToken = output ? finalOutputToken(output) : undefined;
  const outputChainId = output ? Number(output.chainId) : undefined;
  const originChainId = order ? Number(order.originChainId) : undefined;
  const mustSwitchToOrigin = Boolean(originChainId && chainId !== originChainId);
  const orderExpired = order ? Date.now() >= order.expires * 1000 : false;
  const status = goal ? goalStatuses[goal.status] : "Loading";
  const routeTx = lifiQuote?.transactionRequest;
  const routeSpender = routeTx?.to;

  async function requestComposerQuote() {
    if (!order || !output || !inputToken || !outputToken || !originChainId || !outputChainId) {
      return;
    }

    setQuoteStatus("Requesting LI.FI Composer quote...");
    setLifiQuote(undefined);
    setExecutionStatus(undefined);
    setLifiStatus(undefined);

    const isCompound = isCompoundBaseOutput(output);
    const response = await fetch(isCompound ? "/api/lifi/contract-call-quote" : "/api/lifi/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isCompound
          ? {
              fromChain: originChainId,
              toChain: outputChainId,
              fromToken: inputToken,
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
            }
          : {
              fromChain: originChainId,
              toChain: outputChainId,
              fromToken: inputToken,
              toToken: outputToken,
              fromAmount: inputAmount.toString(),
              fromAddress: order.user,
            },
      ),
    });
    const body = await response.json();

    if (!response.ok || !body?.transactionRequest?.to || !body?.transactionRequest?.data) {
      setQuoteStatus(`Quote failed: ${body?.message ?? JSON.stringify(body)}`);
      return;
    }

    setLifiQuote(body);
    setQuoteStatus(
      `Quote ready via ${body.tool ?? "LI.FI"}: ${formatUnits(BigInt(body.estimate?.toAmount ?? "0"), 6)} output tokens.`,
    );
  }

  async function checkComposerStatus(txHash = routeHash) {
    if (!txHash || !originChainId || !outputChainId) {
      return;
    }

    const response = await fetch(`/api/lifi/status?txHash=${txHash}&fromChain=${originChainId}&toChain=${outputChainId}`);
    const body = await response.json();

    setLifiStatus(
      body?.status
        ? `${body.status}${body.substatus ? ` / ${body.substatus}` : ""}${body.receiving?.amount ? ` (${formatUnits(BigInt(body.receiving.amount), 6)} ${body.receiving?.token?.symbol ?? ""})` : ""}`
        : body?.message ?? JSON.stringify(body),
    );
  }

  function executeComposerRoute() {
    if (!routeTx?.to || !routeTx.data || !originChainId) {
      return;
    }

    setExecutionStatus("Submitting LI.FI route transaction...");
    sendTransaction({
      to: routeTx.to,
      data: routeTx.data,
      value: bigintFromRequestValue(routeTx.value),
      chainId: originChainId,
    });
  }

  return (
    <main>
      <h1>Compiled intent {goalId}</h1>
      <ConnectButton />

      <section>
        <h2>Goal</h2>
        <p>Status: {status}</p>
        {goal ? <p>{goal.naturalLanguage}</p> : <p>Loading goal...</p>}
        {intentHash && intentHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
          <p>Intent hash: {intentHash}</p>
        ) : (
          <p>No encoded intent stored yet.</p>
        )}
      </section>

      <section>
        <h2>Proof of Reasoning</h2>
        <h3>User goal</h3>
        {goal ? <p>{goal.naturalLanguage}</p> : <p>Loading goal...</p>}
        <h3>Data considered</h3>
        {ratesText ? <pre>{ratesText}</pre> : <p>Waiting for rates receipt.</p>}
        <h3>Consensus agent decision</h3>
        {decisionText ? (
          <>
            {selectedPoolId ? <p>Selected pool: {selectedPoolId}</p> : null}
            <pre>{decisionJson ? prettyJson(decisionJson) : decisionText}</pre>
          </>
        ) : (
          <p>Waiting for decision receipt.</p>
        )}
        <h3>Deterministic Solidity plan</h3>
        {planText ? <pre>{planJson ? prettyJson(planJson) : planText}</pre> : <p>Waiting for plan receipt.</p>}
      </section>

      <section>
        <h2>StandardOrder-Shaped Plan</h2>
        {order ? (
          <>
            <p>User: {order.user}</p>
            <p>Origin chain: {order.originChainId.toString()}</p>
            <p>Nonce: {order.nonce.toString()}</p>
            <p>Fill deadline: {new Date(order.fillDeadline * 1000).toISOString()}</p>
            <p>Expires: {new Date(order.expires * 1000).toISOString()}</p>
            <p>Input oracle: {order.inputOracle}</p>
            <h3>Inputs</h3>
            <ul>
              {order.inputs.map(([token, amount], index) => (
                <li key={`${token}-${index}`}>
                  {tokenIdentifierToAddress(token)}: {formatUnits(amount, 6)}
                </li>
              ))}
            </ul>
            <h3>Outputs</h3>
            <ul>
              {order.outputs.map((output, index) => (
                <li key={`${output.chainId}-${output.token}-${index}`}>
                  chain {output.chainId.toString()} token {bytes32ToAddress(output.token)}:{" "}
                  {formatUnits(output.amount, 6)} to {bytes32ToAddress(output.recipient)}
                  {output.callbackData !== "0x" ? " with callback" : ""}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Waiting for the compiler to store an encoded order.</p>
        )}
      </section>

      <section>
        <h2>Execute With LI.FI Composer</h2>
        <p>LI.FI Composer uses the compiled route to bridge the input asset and complete the destination yield action.</p>
        {orderExpired ? <p>This compiled route is expired. Compile a fresh goal before execution.</p> : null}
        {mustSwitchToOrigin && originChainId ? (
          <button type="button" onClick={() => switchChain({ chainId: originChainId })}>
            Switch to origin chain {originChainId}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!isConnected || !order || !inputToken || !outputToken || mustSwitchToOrigin || orderExpired}
          onClick={requestComposerQuote}
        >
          Request LI.FI Composer quote
        </button>
        <button
          type="button"
          disabled={
            !isConnected ||
            !order ||
            !inputToken ||
            !routeSpender ||
            isApprovePending ||
            mustSwitchToOrigin ||
            orderExpired
          }
          onClick={() =>
            inputToken &&
            routeSpender &&
            approve({
              address: inputToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [routeSpender, inputAmount],
              chainId: originChainId,
            })
          }
        >
          {isApprovePending ? "Approving..." : "Approve input token"}
        </button>
        <button
          type="button"
          disabled={!isConnected || !routeTx?.to || !routeTx.data || isRoutePending || mustSwitchToOrigin || orderExpired}
          onClick={executeComposerRoute}
        >
          {isRoutePending ? "Executing..." : "Execute LI.FI route"}
        </button>
        {approveHash ? <p>Approval tx: {approveHash}</p> : null}
        {routeHash ? <p>Route tx: {routeHash}</p> : null}
        {quoteStatus ? <p>Quote status: {quoteStatus}</p> : null}
        {lifiQuote?.includedSteps?.length ? (
          <p>LI.FI steps: {lifiQuote.includedSteps.map((step) => step.tool ?? step.type ?? "step").join(" -> ")}</p>
        ) : null}
        {executionStatus ? <p>Execution status: {executionStatus}</p> : null}
        {lifiStatus ? <p>LI.FI status: {lifiStatus}</p> : null}
        {routeHash || lifiStatus ? (
          <section>
            <h3>Execution proof</h3>
            {approveHash ? <p>Approval tx: {approveHash}</p> : null}
            {routeHash ? <p>Route tx: {routeHash}</p> : null}
            {lifiStatus ? <p>Status: {lifiStatus}</p> : null}
            {outputToken ? <p>Expected position token: {outputToken}</p> : null}
          </section>
        ) : null}
        {routeHash ? (
          <button type="button" onClick={() => checkComposerStatus()}>
            Check LI.FI status
          </button>
        ) : null}
        {approveError ? <p>Approval error: {approveError.message}</p> : null}
        {routeError ? <p>Route error: {routeError.message}</p> : null}
      </section>

      <section>
        <h2>Receipts</h2>
        {receipts && receipts.length > 0 ? (
          <ol>
            {receipts.map((entry) => (
              <li key={`${entry.stepName}-${entry.agentRequestId}`}>
                {entry.stepName} at {new Date(Number(entry.timestamp) * 1000).toISOString()}
                {entry.agentRequestId > 0n ? `, request ${entry.agentRequestId.toString()}` : ""}
                {entry.stepName === "plan_built" ? <pre>{decodeString(entry.data as Hex)}</pre> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>No receipts yet.</p>
        )}
      </section>
    </main>
  );
}
