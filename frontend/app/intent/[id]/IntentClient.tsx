"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import {
  decodeAbiParameters,
  formatUnits,
  Hex,
  isHex,
  isAddressEqual,
  toEventHash,
} from "viem";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
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
          { name: "call", type: "bytes" },
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
    call: Hex;
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

export function IntentClient({ goalId }: { goalId: string }) {
  const parsedGoalId = BigInt(goalId);
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [lifiStatus, setLifiStatus] = useState<string>();
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
  });
  const { data: encodedIntent } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntent",
    args: [parsedGoalId],
    query: { refetchInterval: 3_000 },
  });
  const { data: intentHash } = useReadContract({
    address: intentStoreAddress,
    abi: intentStoreAbi,
    functionName: "getIntentHash",
    args: [parsedGoalId],
    query: { refetchInterval: 3_000 },
  });
  const { data: receipts } = useReadContract({
    address: receiptLogAddress,
    abi: receiptLogAbi,
    functionName: "getEntries",
    args: [parsedGoalId],
    query: { refetchInterval: 3_000 },
  });

  const order = useMemo(() => decodeOrder(encodedIntent as Hex | undefined), [encodedIntent]);
  const openReceipt = useWaitForTransactionReceipt({ hash: openHash });

  useEffect(() => {
    const receipt = openReceipt.data;
    if (!receipt || orderId) {
      return;
    }

    const openTopic = toEventHash("Open(bytes32,bytes)");
    const openLog = receipt.logs.find(
      (log) =>
        isAddressEqual(log.address, inputSettlerEscrowAddress) &&
        log.topics[0] === openTopic &&
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
  const status = goal ? goalStatuses[goal.status] : "Loading";

  async function checkStatus() {
    if (!orderId) {
      return;
    }

    const response = await fetch(`/api/order?onChainOrderId=${orderId}`);
    const body = await response.json();
    setLifiStatus(body?.meta?.orderStatus ?? JSON.stringify(body));
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
        {mustSwitchToOrigin && originChainId ? (
          <button type="button" onClick={() => switchChain({ chainId: originChainId })}>
            Switch to origin chain {originChainId}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!isConnected || !order || !inputToken || isApprovePending || mustSwitchToOrigin}
          onClick={() =>
            inputToken &&
            approve({
              address: inputToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [inputSettlerEscrowAddress, inputAmount],
            })
          }
        >
          {isApprovePending ? "Approving..." : "Approve input token"}
        </button>
        <button
          type="button"
          disabled={!isConnected || !order || !encodedIntent || isOpenPending || mustSwitchToOrigin}
          onClick={() =>
            openOrder({
              address: inputSettlerEscrowAddress,
              abi: inputSettlerEscrowAbi,
              functionName: "open",
              args: [encodedIntent as Hex],
            })
          }
        >
          {isOpenPending ? "Opening..." : "Open escrow order"}
        </button>
        {approveHash ? <p>Approval tx: {approveHash}</p> : null}
        {openHash ? <p>Open tx: {openHash}</p> : null}
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
