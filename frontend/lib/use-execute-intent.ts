"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useExecuteIntent({
  goalId,
  order,
  inputToken,
  outputToken,
  selectedVenue,
  selectedPositionToken,
  orderExpired,
}: ExecuteIntentArgs) {
  const { chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: capabilities } = useCapabilities({ chainId: ARBITRUM_CHAIN_ID });
  const { sendCallsAsync } = useSendCalls();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const [buttonState, setButtonState] = useState<ExecuteState>("default");
  const [quote, setQuote] = useState<LifiQuote>();
  const [statusBody, setStatusBody] = useState<LifiStatusBody>();
  const [approvalHash, setApprovalHash] = useState<Hex>();
  const [routeHash, setRouteHash] = useState<Hex>();
  const [bundleId, setBundleId] = useState<string>();

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

  const storageKey = `asshai-execution-${goalId}`;

  useEffect(() => {
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
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ approvalHash, routeHash, bundleId }));
    } catch {
      // localStorage is best-effort resume state.
    }
  }, [approvalHash, routeHash, bundleId, storageKey]);

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
        toast.success(`Intent executed${body.receiving?.amount ? ` · ${statusLabel(body, selectedDecimals)}` : ""}`);
      }
    },
    [originChainId, outputChainId, routeHash, selectedDecimals],
  );

  useEffect(() => {
    if (!routeHash || buttonState !== "executing") {
      return;
    }

    const timer = window.setInterval(() => {
      void checkStatus(routeHash);
    }, 5_000);
    void checkStatus(routeHash);

    return () => window.clearInterval(timer);
  }, [buttonState, checkStatus, routeHash]);

  useEffect(() => {
    if (routeReceipt.data?.status === "success" && buttonState === "executing") {
      toast.loading("Waiting for destination execution...", { id: `execute-${goalId}` });
    }
  }, [buttonState, goalId, routeReceipt.data?.status]);

  useEffect(() => {
    const status = String(callsStatus.data?.status ?? "");
    if (status === "100" || status === "CONFIRMED" || status === "success") {
      setButtonState("done");
      toast.success("Intent executed", { id: `execute-${goalId}` });
    }
  }, [callsStatus.data?.status, goalId]);

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
    toast.success("Quote ready");
    return body;
  }, [inputAmount, inputToken, isCompound, order, originChainId, output, outputChainId, outputToken]);

  const executeIntent = useCallback(async () => {
    try {
      if (orderExpired) {
        throw new Error("This compiled route is expired. Compile a fresh goal before execution.");
      }
      if (!order || !inputToken || !originChainId) {
        throw new Error("The compiled order is not ready yet.");
      }

      setButtonState("quoting");
      const currentQuote = quote?.transactionRequest?.to && quote.transactionRequest.data ? quote : await requestQuote();
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
      const atomicStatus = (capabilities as Record<string, { atomic?: { status?: string } }> | undefined)?.[
        ARBITRUM_CHAIN_ID
      ]?.atomic?.status;

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
        toast.loading("Executing on-chain...", { id: `execute-${goalId}` });
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
      toast.loading("Waiting for destination execution...", { id: `execute-${goalId}` });
    } catch (error) {
      setButtonState("default");
      toast.error(humanizeError(error), { duration: Number.POSITIVE_INFINITY });
    }
  }, [
    capabilities,
    chain?.id,
    goalId,
    inputAmount,
    inputToken,
    order,
    orderExpired,
    originChainId,
    quote,
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
    executeIntent,
    finalAmount,
    isDone,
    lifiStatus,
    quote,
    routeHash,
    routeReceipt,
    statusBody,
  };
}
