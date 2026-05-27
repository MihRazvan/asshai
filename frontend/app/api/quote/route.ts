import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const search = new URLSearchParams(incoming);
  const apiKey = process.env.LIFI_API_KEY;

  const response = await fetch(`https://li.quest/v1/quote?${search.toString()}`, {
    headers: apiKey ? { "x-lifi-api-key": apiKey } : undefined,
  });

  const body = await response.json();
  return NextResponse.json(body, { status: response.status });
}

