"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import { encodeFunctionData, formatUnits, Hex } from "viem";
import {
  useAccount,
  useCallsStatus,
  useCapabilities,
  useSendCalls,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { erc20Abi } from "@/lib/contracts";
import { humanizeError } from "@/lib/humanize-error";

const ARBITRUM_CHAIN_ID = 42161;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BASE_COMPOUND_CUSDCV3 = "0xb125E6687d4313864e53df431d5425969c15Eb2F" as const;
const COMPOUND_CONTRACT_CALL_GAS_LIMIT = "350000";
const QUOTE_TTL_MS = 60_000;
const STATUS_POLL_TIMEOUT_MS = 15 * 60_000;
const executionToastId = (goalId: string) => `execute-${goalId}`;

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

type RouteTx = {
  to?: Hex;
  data?: Hex;
  value?: string;
  chainId?: number;
  gasLimit?: string;
};

export type LifiQuote = {
  tool?: string;
  estimate?: {
    approvalAddress?: Hex;
    toAmount?: string;
    toAmountMin?: string;
  };
  transactionRequest?: RouteTx;
  includedSteps?: readonly {
    tool?: string;
    type?: string;
  }[];
  message?: string;
};

export type LifiStatusBody = {
  status?: string;
  substatus?: string;
  message?: string;
  receiving?: {
    amount?: string;
    token?: {
      symbol?: string;
      decimals?: number;
    };
  };
};

type ExecuteState = "default" | "quoting" | "switching" | "confirming" | "executing" | "done";

type WalletCapabilities = Record<
  string | number,
  {
    atomic?: { status?: string };
    atomicBatch?: { supported?: boolean };
  }
>;

type ExecuteIntentArgs = {
  goalId: string;
  order:
    | {
        user: Hex;
        originChainId: bigint;
        inputs: readonly (readonly [bigint, bigint])[];
        outputs: readonly {
          chainId: bigint;
          amount: bigint;
        }[];
      }
    | undefined;
  inputToken?: Hex;
  outputToken?: Hex;
  selectedVenue?: {
    poolId: string;
    positionTokenSymbol: string;
    positionTokenDecimals: number;
  };
  selectedPositionToken?: Hex;
  orderExpired?: boolean;
};

function bigintFromRequestValue(value: string | undefined) {
  return value ? BigInt(value) : 0n;
}

function bigintFromOptionalDecimal(value: string | undefined) {
  return value ? BigInt(value) : undefined;
}

function statusLabel(body: LifiStatusBody | undefined, decimals: number) {
  if (!body?.status) {
    return undefined;
  }

  const received = body.receiving?.amount
    ? ` (${formatUnits(BigInt(body.receiving.amount), body.receiving.token?.decimals ?? decimals)} ${
        body.receiving.token?.symbol ?? ""
      })`
    : "";

  return `${body.status}${body.substatus ? ` / ${body.substatus}` : ""}${received}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isCallsConfirmed(status: unknown) {
  if (status === 100) {
    return true;
  }

  const normalized = String(status ?? "").toLowerCase();
  return normalized === "100" || normalized === "confirmed" || normalized === "success";
}

function lastRouteHashFromCallsStatus(data: unknown) {
  const receipts = (data as { receipts?: readonly { transactionHash?: Hex; hash?: Hex }[] } | undefined)?.receipts ?? [];

  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const hash = receipts[index]?.transactionHash ?? receipts[index]?.hash;
    if (hash) {
      return hash;
    }
  }

  return undefined;
}

function atomicStatusFromCapabilities(capabilities: unknown) {
  const caps = (capabilities as WalletCapabilities | undefined)?.[ARBITRUM_CHAIN_ID];
  return caps?.atomic?.status ?? (caps?.atomicBatch?.supported ? "supported" : "unsupported");
}

export function useExecuteIntent({
  goalId,
  order,
  inputToken,
  outputToken,
  selectedVenue,
  selectedPositionToken,
  orderExpired,
}: ExecuteIntentArgs) {
  const { address, chain, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { switchChainAsync } = useSwitchChain();
  const { data: capabilities } = useCapabilities({ chainId: ARBITRUM_CHAIN_ID });
  const { sendCallsAsync } = useSendCalls();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const [buttonState, setButtonState] = useState<ExecuteState>("default");
  const [quote, setQuote] = useState<LifiQuote>();
  const [quoteFetchedAt, setQuoteFetchedAt] = useState(0);
  const [statusBody, setStatusBody] = useState<LifiStatusBody>();
  const [approvalHash, setApprovalHash] = useState<Hex>();
  const [routeHash, setRouteHash] = useState<Hex>();
  const [bundleId, setBundleId] = useState<string>();
  const statusPollStartedAt = useRef<number | null>(null);

  const routeReceipt = useWaitForTransactionReceipt({ hash: routeHash });
  const callsStatus = useCallsStatus({
    id: bundleId ?? "",
    query: { enabled: Boolean(bundleId), refetchInterval: buttonState === "executing" ? 2_000 : false },
  });

  const originChainId = order ? Number(order.originChainId) : undefined;
  const inputAmount = order?.inputs[0]?.[1] ?? 0n;
  const output = order?.outputs[0];
  const outputChainId = output ? Number(output.chainId) : undefined;
  const selectedDecimals = selectedVenue?.positionTokenDecimals ?? 6;
  const isCompound = selectedPositionToken?.toLowerCase() === BASE_COMPOUND_CUSDCV3.toLowerCase();
  const ownerMismatch = Boolean(
    isConnected && address && order?.user && address.toLowerCase() !== order.user.toLowerCase(),
  );
  const ctaLabel = !isConnected
    ? "Connect wallet"
    : ownerMismatch && order?.user
      ? `Connect ${shortAddress(order.user)}`
      : undefined;

  const finalAmount = useMemo(() => {
    if (!statusBody?.receiving?.amount) {
      return undefined;
    }

    return `${formatUnits(
      BigInt(statusBody.receiving.amount),
      statusBody.receiving.token?.decimals ?? selectedDecimals,
    )} ${statusBody.receiving.token?.symbol ?? selectedVenue?.positionTokenSymbol ?? ""}`.trim();
  }, [selectedDecimals, selectedVenue?.positionTokenSymbol, statusBody]);

  const lifiStatus = useMemo(() => statusLabel(statusBody, selectedDecimals), [selectedDecimals, statusBody]);

  const storageKey = `asshai-execution-${goalId}-${address?.toLowerCase() ?? "disconnected"}`;

  useEffect(() => {
    setApprovalHash(undefined);
    setRouteHash(undefined);
    setBundleId(undefined);
    setStatusBody(undefined);
    setButtonState("default");

    if (!address) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { approvalHash?: Hex; routeHash?: Hex; bundleId?: string };
      setApprovalHash(parsed.approvalHash);
      setRouteHash(parsed.routeHash);
      setBundleId(parsed.bundleId);
      if (parsed.routeHash || parsed.bundleId) {
        setButtonState("executing");
      }
    } catch {
      // Ignore corrupted local execution state.
    }
  }, [address, storageKey]);

  useEffect(() => {
    if (!address) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ approvalHash, routeHash, bundleId }));
    } catch {
      // localStorage is best-effort resume state.
    }
  }, [address, approvalHash, routeHash, bundleId, storageKey]);

  const checkStatus = useCallback(
    async (txHash = routeHash) => {
      if (!txHash || !originChainId || !outputChainId) {
        return;
      }

      const response = await fetch(`/api/lifi/status?txHash=${txHash}&fromChain=${originChainId}&toChain=${outputChainId}`);
      const body = (await response.json()) as LifiStatusBody;
      setStatusBody(body);

      if (body.status === "DONE") {
        setButtonState("done");
        toast.dismiss(executionToastId(goalId));
        toast.success(`Intent executed${body.receiving?.amount ? ` · ${statusLabel(body, selectedDecimals)}` : ""}`, {
          id: executionToastId(goalId),
        });
      }
    },
    [goalId, originChainId, outputChainId, routeHash, selectedDecimals],
  );

  useEffect(() => {
    if (!routeHash || buttonState !== "executing") {
      statusPollStartedAt.current = null;
      return;
    }

    statusPollStartedAt.current ??= Date.now();

    const poll = () => {
      if (statusPollStartedAt.current && Date.now() - statusPollStartedAt.current > STATUS_POLL_TIMEOUT_MS) {
        setButtonState("default");
        toast.warning("Destination execution is taking longer than expected. Check the route transaction.", {
          id: executionToastId(goalId),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }

      void checkStatus(routeHash);
    };

    const timer = window.setInterval(poll, 5_000);
    poll();

    return () => window.clearInterval(timer);
  }, [buttonState, checkStatus, goalId, routeHash]);

  useEffect(() => {
    if (routeReceipt.data?.status === "success" && buttonState === "executing" && statusBody?.status !== "DONE") {
      toast.loading("Waiting for destination execution...", { id: executionToastId(goalId) });
    }
  }, [buttonState, goalId, routeReceipt.data?.status, statusBody?.status]);

  useEffect(() => {
    if (!isCallsConfirmed(callsStatus.data?.status)) {
      return;
    }

    const transactionHash = lastRouteHashFromCallsStatus(callsStatus.data);
    if (transactionHash) {
      if (transactionHash === routeHash) {
        return;
      }

      setRouteHash(transactionHash);
      setButtonState("executing");
      toast.loading("Waiting for destination execution...", { id: executionToastId(goalId) });
      void checkStatus(transactionHash);
      return;
    }

    setButtonState("default");
    toast.warning("Wallet confirmed the batch, but did not return a route transaction hash. Check wallet activity.", {
      id: executionToastId(goalId),
      duration: Number.POSITIVE_INFINITY,
    });
  }, [callsStatus.data, checkStatus, goalId, routeHash]);

  useEffect(() => {
    if (statusBody?.status === "DONE") {
      toast.dismiss(executionToastId(goalId));
    }
  }, [goalId, statusBody?.status]);

  const requestQuote = useCallback(async () => {
    if (!order || !inputToken || !outputToken || !originChainId || !outputChainId || !output) {
      throw new Error("The compiled order is not ready yet.");
    }

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
    const body = (await response.json()) as LifiQuote;

    if (!response.ok || !body.transactionRequest?.to || !body.transactionRequest.data) {
      throw new Error(body.message ?? "LI.FI quote failed.");
    }

    setQuote(body);
    setQuoteFetchedAt(Date.now());
    toast.success("Quote ready");
    return body;
  }, [inputAmount, inputToken, isCompound, order, originChainId, output, outputChainId, outputToken]);

  const executeIntent = useCallback(async () => {
    try {
      if (!isConnected || !address) {
        openConnectModal?.();
        return;
      }
      if (orderExpired) {
        throw new Error("This compiled route is expired. Compile a fresh goal before execution.");
      }
      if (!order || !inputToken || !originChainId) {
        throw new Error("The compiled order is not ready yet.");
      }
      if (address.toLowerCase() !== order.user.toLowerCase()) {
        openAccountModal?.();
        throw new Error(`Connect ${shortAddress(order.user)} to execute this intent.`);
      }

      setButtonState("quoting");
      const quoteIsFresh = Boolean(
        quote?.transactionRequest?.to && quote.transactionRequest.data && Date.now() - quoteFetchedAt < QUOTE_TTL_MS,
      );
      const currentQuote = quoteIsFresh && quote ? quote : await requestQuote();
      const routeTx = currentQuote.transactionRequest;
      if (!routeTx?.to || !routeTx.data) {
        throw new Error("LI.FI returned an incomplete route.");
      }
      const approvalAddress = currentQuote.estimate?.approvalAddress ?? routeTx.to;

      if (chain?.id !== ARBITRUM_CHAIN_ID) {
        setButtonState("switching");
        toast.info("Switching to Arbitrum");
        await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
      }

      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [approvalAddress, inputAmount],
      });
      const atomicStatus = atomicStatusFromCapabilities(capabilities);

      if (atomicStatus === "supported" || atomicStatus === "ready") {
        setButtonState("confirming");
        toast.info("Confirm in wallet...");
        const result = await sendCallsAsync({
          chainId: ARBITRUM_CHAIN_ID,
          calls: [
            { to: inputToken, data: approveData, value: 0n },
            {
              to: routeTx.to,
              data: routeTx.data,
              value: bigintFromRequestValue(routeTx.value),
              gas: bigintFromOptionalDecimal(routeTx.gasLimit),
            },
          ],
          capabilities: { atomic: { required: atomicStatus === "supported" } },
        } as never);
        setBundleId((result as { id?: string }).id);
        setButtonState("executing");
        toast.loading("Executing on-chain...", { id: executionToastId(goalId) });
        return;
      }

      setButtonState("confirming");
      toast.info("Confirm approval in wallet...");
      const approved = await writeContractAsync({
        address: inputToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [approvalAddress, inputAmount],
        chainId: ARBITRUM_CHAIN_ID,
      });
      setApprovalHash(approved);
      toast.success("Approval confirmed");

      setButtonState("executing");
      toast.info("Confirm route in wallet...");
      const routed = await sendTransactionAsync({
        to: routeTx.to,
        data: routeTx.data,
        value: bigintFromRequestValue(routeTx.value),
        gas: bigintFromOptionalDecimal(routeTx.gasLimit),
        chainId: ARBITRUM_CHAIN_ID,
      });
      setRouteHash(routed);
      toast.loading("Waiting for destination execution...", { id: executionToastId(goalId) });
    } catch (error) {
      setButtonState("default");
      toast.error(humanizeError(error), { duration: Number.POSITIVE_INFINITY });
    }
  }, [
    address,
    capabilities,
    chain?.id,
    goalId,
    inputAmount,
    inputToken,
    isConnected,
    order,
    orderExpired,
    originChainId,
    openConnectModal,
    openAccountModal,
    quote,
    quoteFetchedAt,
    requestQuote,
    sendCallsAsync,
    sendTransactionAsync,
    switchChainAsync,
    writeContractAsync,
  ]);

  const isDone = buttonState === "done" || statusBody?.status === "DONE";

  return {
    approvalHash,
    bundleId,
    buttonState,
    callsStatus: callsStatus.data,
    ctaLabel,
    executeIntent,
    finalAmount,
    isDone,
    lifiStatus,
    ownerMismatch,
    quote,
    routeHash,
    routeReceipt,
    statusBody,
  };
}
