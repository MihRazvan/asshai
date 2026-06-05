import { NextRequest, NextResponse } from "next/server";

const lifiBaseUrl = "https://li.quest/v1";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const params = new URLSearchParams({
    fromChain: String(body.fromChain),
    toChain: String(body.toChain),
    fromToken: String(body.fromToken),
    toToken: String(body.toToken),
    fromAmount: String(body.fromAmount),
    fromAddress: String(body.fromAddress),
    integrator: "asshai",
  });

  const headers: HeadersInit = {};
  if (process.env.LIFI_API_KEY) {
    headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  }

  const response = await fetch(`${lifiBaseUrl}/quote?${params.toString()}`, {
    headers,
  });
  const responseBody = await response.json();

  return NextResponse.json(responseBody, { status: response.status });
}
