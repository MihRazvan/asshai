import { NextRequest, NextResponse } from "next/server";

const lifiOrderBaseUrl = "https://order.li.fi";

export async function POST(request: NextRequest) {
  const response = await fetch(`${lifiOrderBaseUrl}/quote/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await request.json()),
  });
  const body = await response.json();

  return NextResponse.json(body, { status: response.status });
}
