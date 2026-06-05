import { NextRequest, NextResponse } from "next/server";

const lifiBaseUrl = "https://li.quest/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams({
    txHash: searchParams.get("txHash") ?? "",
    fromChain: searchParams.get("fromChain") ?? "",
    toChain: searchParams.get("toChain") ?? "",
  });

  const headers: HeadersInit = {};
  if (process.env.LIFI_API_KEY) {
    headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  }

  const response = await fetch(`${lifiBaseUrl}/status?${params.toString()}`, {
    headers,
  });
  const body = await response.json();

  return NextResponse.json(body, { status: response.status });
}
