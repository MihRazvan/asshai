"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import {
  decodeAbiParameters,
  formatUnits,
  Hex,
  isHex,
  isAddressEqual,
  padHex,
} from "viem";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { somniaTestnet } from "@/lib/somnia";
import {
  erc20Abi,
  goalRegistryAbi,
  goalRegistryAddress,
  inputSettlerEscrowAbi,
  inputSettlerEscrowAddress,
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

function toInteroperableAddress(chainId: bigint, address: Hex) {
  const chainHex = chainId.toString(16).padStart(4, "0");
  return `0x0001000002${chainHex}14${address.slice(2)}`;
}

function buildExclusiveLimitContext(exclusiveFor: Hex, exclusiveUntil: number) {
  const solver = padHex(exclusiveFor, { size: 32 }).slice(2);
  const timestamp = exclusiveUntil.toString(16).padStart(8, "0").slice(-8);
  return `0xe0${solver}${timestamp}` as Hex;
}

function buildQuoteRequest(order: StandardOrder) {
  const output = order.outputs[0];

  return {
    user: toInteroperableAddress(order.originChainId, order.user),
    intent: {
      intentType: "oif-swap",
      inputs: order.inputs.map(([token, amount]) => ({
        user: toInteroperableAddress(order.originChainId, order.user),
        asset: toInteroperableAddress(order.originChainId, tokenIdentifierToAddress(token)),
        amount: amount.toString(),
      })),
      outputs: [
        {
          receiver: toInteroperableAddress(output.chainId, bytes32ToAddress(output.recipient)),
          asset: toInteroperableAddress(output.chainId, bytes32ToAddress(output.token)),
          amount: output.amount.toString(),
          callbackData: output.callbackData,
        },
      ],
      swapType: "exact-input",
    },
    supportedTypes: ["oif-escrow-v0"],
  };
}

export function IntentClient({ goalId }: { goalId: string }) {
  const parsedGoalId = BigInt(goalId);
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [lifiStatus, setLifiStatus] = useState<string>();
  const [quoteStatus, setQuoteStatus] = useState<string>();
  const { data: approveHash, error: approveError, isPending: isApprovePending, writeContract: approve } =
    useWriteContract();
  const { data: openHash, error: openError, isPending: isOpenPending, writeContract: openOrder } =
    useWriteContract();
  const [orderId, setOrderId] = useState<Hex | undefined>();

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
  const openReceipt = useWaitForTransactionReceipt({ hash: openHash });

  useEffect(() => {
    const receipt = openReceipt.data;
    if (!receipt || orderId) {
      return;
    }

    const openLog = receipt.logs.find(
      (log) =>
        isAddressEqual(log.address, inputSettlerEscrowAddress) &&
        log.topics[1],
    );
    if (openLog?.topics[1]) {
      setOrderId(openLog.topics[1]);
    }
  }, [openReceipt.data, orderId]);

  const input = order?.inputs[0];
  const inputToken = input ? tokenIdentifierToAddress(input[0]) : undefined;
  const inputAmount = input?.[1] ?? 0n;
  const originChainId = order ? Number(order.originChainId) : undefined;
  const mustSwitchToOrigin = Boolean(originChainId && chainId !== originChainId);
  const orderExpired = order ? Date.now() >= order.expires * 1000 : false;
  const status = goal ? goalStatuses[goal.status] : "Loading";

  async function checkStatus() {
    if (!orderId) {
      return;
    }

    const response = await fetch(`/api/order?onChainOrderId=${orderId}`);
    const body = await response.json();
    setLifiStatus(body?.meta?.orderStatus ?? JSON.stringify(body));
  }

  async function openQuotedOrder() {
    if (!order) {
      return;
    }

    setQuoteStatus("Requesting LI.FI quote...");
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildQuoteRequest(order)),
    });
    const body = await response.json();
    const quote = body?.quotes?.[0];
    const exclusiveFor = quote?.metadata?.exclusiveFor as Hex | undefined;

    if (!response.ok || !exclusiveFor || !isHex(exclusiveFor)) {
      setQuoteStatus(`Quote failed or did not return exclusive solver: ${JSON.stringify(body)}`);
      return;
    }

    const patchedOrder = {
      ...order,
      outputs: order.outputs.map((output, index) =>
        index === 0
          ? {
              ...output,
              context: buildExclusiveLimitContext(exclusiveFor, order.fillDeadline),
            }
          : output,
      ),
    };

    setQuoteStatus(`Quote ${quote.quoteId ?? ""} reserved solver ${exclusiveFor}; opening quote-context order.`);
    setOrderId(undefined);
    setLifiStatus(undefined);
    openOrder({
      address: inputSettlerEscrowAddress,
      abi: inputSettlerEscrowAbi,
      functionName: "open",
      args: [patchedOrder],
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
        <h2>StandardOrder</h2>
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
        <h2>Open Escrow Order</h2>
        <p>LI.FI standard escrow flow requires approval, then an origin-chain call to InputSettlerEscrow.open.</p>
        {orderExpired ? <p>This order is expired. Compile a fresh goal before opening escrow.</p> : null}
        {mustSwitchToOrigin && originChainId ? (
          <button type="button" onClick={() => switchChain({ chainId: originChainId })}>
            Switch to origin chain {originChainId}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!isConnected || !order || !inputToken || isApprovePending || mustSwitchToOrigin || orderExpired}
          onClick={() =>
            inputToken &&
            approve({
              address: inputToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [inputSettlerEscrowAddress, inputAmount],
              chainId: originChainId,
            })
          }
        >
          {isApprovePending ? "Approving..." : "Approve input token"}
        </button>
        <button
          type="button"
          disabled={!isConnected || !order || !encodedIntent || isOpenPending || mustSwitchToOrigin || orderExpired}
          onClick={openQuotedOrder}
        >
          {isOpenPending ? "Opening..." : "Open escrow order"}
        </button>
        {approveHash ? <p>Approval tx: {approveHash}</p> : null}
        {openHash ? <p>Open tx: {openHash}</p> : null}
        {quoteStatus ? <p>Quote status: {quoteStatus}</p> : null}
        {orderId ? <p>On-chain order ID: {orderId}</p> : null}
        {lifiStatus ? <p>LI.FI status: {lifiStatus}</p> : null}
        {orderId ? (
          <button type="button" onClick={checkStatus}>
            Check LI.FI status
          </button>
        ) : null}
        {approveError ? <p>Approval error: {approveError.message}</p> : null}
        {openError ? <p>Open error: {openError.message}</p> : null}
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
