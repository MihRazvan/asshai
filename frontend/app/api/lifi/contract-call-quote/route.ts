import { NextRequest, NextResponse } from "next/server";

const lifiBaseUrl = "https://li.quest/v1";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const headers: HeadersInit = { "content-type": "application/json" };
  if (process.env.LIFI_API_KEY) {
    headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  }

  const response = await fetch(`${lifiBaseUrl}/quote/contractCall`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fromChain: body.fromChain,
      fromToken: body.fromToken,
      fromAddress: body.fromAddress,
      toChain: body.toChain,
      toToken: body.toToken,
      toAmount: body.toAmount,
      toContractAddress: body.toContractAddress,
      toContractCallData: body.toContractCallData,
      toContractGasLimit: body.toContractGasLimit,
      toApprovalAddress: body.toApprovalAddress,
      contractOutputsToken: body.contractOutputsToken,
      integrator: "asshai",
    }),
  });
  const responseBody = await response.json();

  return NextResponse.json(responseBody, { status: response.status });
}
